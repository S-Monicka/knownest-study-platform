import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

// Initialize the official @google/genai client on the server only.
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Status codes intercepted by the front-end nginx proxy (error_page 403 / 502 503 504),
// which would replace JSON error bodies with HTML pages.
const PROXY_INTERCEPTED_STATUSES = new Set([403, 502, 503, 504]);

function normalizeApiError(error: any, fallbackMessage: string): { status: number; message: string } {
  const rawStatus = typeof error?.status === "number" ? error.status : 500;
  let message = typeof error?.message === "string" && error.message.trim()
    ? error.message.trim()
    : fallbackMessage;

  // @google/genai ApiError often embeds a JSON payload inside error.message.
  if (message.startsWith("{")) {
    try {
      const parsed = JSON.parse(message);
      const innerMsg = parsed?.error?.message || parsed?.message;
      if (typeof innerMsg === "string" && innerMsg.trim()) {
        message = innerMsg.trim();
      }
    } catch {
      // Keep original message if not JSON.
    }
  }

  if (rawStatus === 403) {
    message = "Gemini API permission denied. Please verify your GEMINI_API_KEY in Settings > Secrets.";
  } else if (rawStatus === 429 || /RESOURCE_EXHAUSTED|quota exceeded/i.test(message)) {
    message =
      "Gemini API quota limit was reached. Please wait briefly and try again, or configure a billing-enabled GEMINI_API_KEY in Settings > Secrets.";
  }

  const safeStatus =
    rawStatus >= 400 && rawStatus < 600 && !PROXY_INTERCEPTED_STATUSES.has(rawStatus)
      ? rawStatus
      : 500;

  return { status: safeStatus, message };
}

function stripJsonCodeFences(rawText: string): string {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function getErrorStatus(err: any): number {
  if (typeof err?.status === "number") return err.status;
  if (typeof err?.code === "number") return err.code;
  return 0;
}

function isDailyQuotaExhausted(err: any): boolean {
  const status = getErrorStatus(err);
  const msg = typeof err?.message === "string" ? err.message : "";
  if (status !== 429 && !/RESOURCE_EXHAUSTED/i.test(msg)) {
    return false;
  }
  return /GenerateRequestsPerDay|PerDayPerProject|FreeTier|retry in \d+h/i.test(msg);
}

function isModelFallbackEligible(err: any): boolean {
  const status = getErrorStatus(err);
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg = typeof err?.message === "string" ? err.message : "";
  return /RESOURCE_EXHAUSTED|quota|rate limit|overloaded|unavailable/i.test(msg);
}

async function withTransientRetry<T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      // Do not waste retry delays when a model's daily quota is already exhausted.
      if (isDailyQuotaExhausted(err)) {
        throw err;
      }
      const status = getErrorStatus(err);
      const isTransient = status === 429 || status === 502 || status === 503 || status === 504;
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 700 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function runWithModelFallback<T>(
  models: readonly string[],
  runner: (model: string) => Promise<T>
): Promise<{ result: T; model: string }> {
  let lastError: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const result = await withTransientRetry(() => runner(model), 1);
      return { result, model };
    } catch (err: any) {
      lastError = err;
      const hasNext = i < models.length - 1;
      if (hasNext && isModelFallbackEligible(err)) {
        console.warn(`Gemini model "${model}" unavailable/quota-limited; falling back to "${models[i + 1]}".`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Lightweight schema when the user clicks "Generate Notes & Summary" only.
const summaryOnlyResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "A concise, clear academic title for the uploaded study notes (4-8 words).",
    },
    subject: {
      type: Type.STRING,
      description: "Short academic subject or discipline label (e.g., Cell Biology, Operating Systems).",
    },
    summary: {
      type: Type.STRING,
      description: "A crisp 2-4 sentence summary synthesizing the core material in the notes.",
    },
    extractedNotes: {
      type: Type.STRING,
      description:
        "Clean, well-structured plain-text study notes derived from the input (preserving key details from any attached PDF/image or refining text formatting).",
    },
    keyConcepts: {
      type: Type.ARRAY,
      description: "4 to 6 key concepts or takeaways distilled from the notes.",
      items: {
        type: Type.OBJECT,
        properties: {
          heading: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
        required: ["heading", "detail"],
      },
    },
  },
  required: ["title", "subject", "summary", "extractedNotes", "keyConcepts"],
};

// Structured schema enforcing flashcards and MCQs from Gemini.
const studySetResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "A concise, clear academic title for the uploaded study notes (4-8 words).",
    },
    subject: {
      type: Type.STRING,
      description: "Short academic subject or discipline label (e.g., Cell Biology, Operating Systems).",
    },
    summary: {
      type: Type.STRING,
      description: "A crisp 2-3 sentence synthesis of the core material in the notes.",
    },
    extractedNotes: {
      type: Type.STRING,
      description:
        "Clean, well-structured plain-text study notes derived from the input (especially useful when the user uploads a PDF or image).",
    },
    keyConcepts: {
      type: Type.ARRAY,
      description: "4 to 6 key concepts or takeaways distilled from the notes.",
      items: {
        type: Type.OBJECT,
        properties: {
          heading: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
        required: ["heading", "detail"],
      },
    },
    flashcards: {
      type: Type.ARRAY,
      description: "Study flashcards covering the most important terms, mechanisms, and relationships.",
      items: {
        type: Type.OBJECT,
        properties: {
          term: {
            type: Type.STRING,
            description: "The front of the flashcard: a concise concept, question, or term.",
          },
          definition: {
            type: Type.STRING,
            description: "The back of the flashcard: a clear, accurate explanation or answer (1-3 sentences).",
          },
          hint: {
            type: Type.STRING,
            description: "A subtle 1-sentence memory cue without giving away the entire answer.",
          },
          topic: {
            type: Type.STRING,
            description: "Short sub-topic label (1-3 words).",
          },
        },
        required: ["term", "definition", "hint", "topic"],
      },
    },
    quiz: {
      type: Type.ARRAY,
      description: "Multiple-choice questions testing comprehension and application of the notes.",
      items: {
        type: Type.OBJECT,
        properties: {
          question: {
            type: Type.STRING,
            description: "Clear multiple-choice question stem.",
          },
          options: {
            type: Type.ARRAY,
            description: "Exactly 4 distinct answer choices.",
            items: { type: Type.STRING },
          },
          correctIndex: {
            type: Type.INTEGER,
            description: "Zero-based index (0, 1, 2, or 3) of the single correct option in options.",
          },
          explanation: {
            type: Type.STRING,
            description: "Brief explanation of why the correct option is right and common misconceptions.",
          },
          topic: {
            type: Type.STRING,
            description: "Short sub-topic label (1-3 words) tested by this question.",
          },
        },
        required: ["question", "options", "correctIndex", "explanation", "topic"],
      },
    },
  },
  required: ["title", "subject", "summary", "extractedNotes", "keyConcepts", "flashcards", "quiz"],
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/study/generate", async (req, res) => {
    try {
      const { notesText, file, preferredSubject, flashcardCount, quizCount, mode } = req.body as {
        notesText?: string;
        file?: { name: string; mimeType: string; base64: string };
        preferredSubject?: string;
        flashcardCount?: number;
        quizCount?: number;
        mode?: "summary" | "full";
      };

      const isSummaryOnly = mode === "summary";
      const safeFlashcardCount = Math.min(30, Math.max(10, Math.round(Number(flashcardCount) || 10)));
      const safeQuizCount = Math.min(30, Math.max(10, Math.round(Number(quizCount) || 10)));

      const trimmedText = typeof notesText === "string" ? notesText.trim() : "";

      if (!trimmedText && !file?.base64) {
        return res.status(400).json({
          error: "Please paste your study notes or upload a file before generating.",
        });
      }

      const ai = getGeminiClient();

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (file?.base64 && file?.mimeType) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.base64,
          },
        });
      }

      const instructionPrompt = isSummaryOnly
        ? `Analyze the provided student study material and generate clean structured notes, a concise summary, and 4 to 6 key concepts in JSON.
Requirements:
1. Ground every concept and summary point directly in the provided notes or attached document.
2. In "summary", write a clear, comprehensive 2-4 sentence summary capturing the essential ideas.
3. In "extractedNotes", provide a clean, readable plain-text version of the source notes (preserving key details if read from an attached file, or refining formatting if text was provided).

${trimmedText ? `STUDENT NOTES:\n${trimmedText}` : `Uploaded file: ${file?.name || "study-notes"}`}`
        : `Analyze the provided student study material and generate a complete study package in JSON.
Requirements:
1. Produce EXACTLY ${safeFlashcardCount} distinct high-yield flashcards in "flashcards" (no fewer, no more than ${safeFlashcardCount}).
2. Produce EXACTLY ${safeQuizCount} distinct multiple-choice questions in "quiz" (no fewer, no more than ${safeQuizCount}), each with EXACTLY 4 options, a valid "correctIndex" (0-3), and a specific sub-topic label in "topic".
3. Ground every flashcard, key concept, and quiz question directly in the provided notes.
4. Keep definitions, hints, and explanations crisp, accurate, and student-friendly.
5. In "extractedNotes", provide a clean, readable plain-text version of the source notes (preserving key details if read from an attached file, or refining formatting if text was provided).

${trimmedText ? `STUDENT NOTES:\n${trimmedText}` : `Uploaded file: ${file?.name || "study-notes"}`}`;

      parts.push({ text: instructionPrompt });

      const candidateModels = isSummaryOnly
        ? ["gemini-3.1-flash-lite", "gemini-4-hydrogen"]
        : ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];

      const { result: response } = await runWithModelFallback(candidateModels, (model) =>
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction: isSummaryOnly
              ? "You are an expert academic tutor and curriculum designer. Always return strictly valid JSON matching the requested schema with clean study notes, summary, and key concepts."
              : `You are an expert academic tutor and curriculum designer. Always return strictly valid JSON matching the requested schema with exactly ${safeFlashcardCount} flashcards and exactly ${safeQuizCount} multiple-choice questions.`,
            responseMimeType: "application/json",
            responseSchema: isSummaryOnly ? summaryOnlyResponseSchema : studySetResponseSchema,
            ...(model === "gemini-4-hydrogen"
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        })
      );

      const rawText = response.text?.trim();
      if (!rawText) {
        return res.status(500).json({ error: "Gemini returned an empty response. Please try again." });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(stripJsonCodeFences(rawText));
      } catch {
        return res.status(500).json({
          error: "Gemini returned an invalid JSON structure for the study set. Please try again.",
        });
      }

      // Normalize and enforce configured array bounds & valid indices for client safety
      const flashcards = isSummaryOnly
        ? []
        : Array.isArray(parsed.flashcards)
          ? parsed.flashcards.slice(0, safeFlashcardCount).map((card: any, index: number) => ({
              id: `fc-${Date.now()}-${index}`,
              term: String(card?.term || `Concept ${index + 1}`),
              definition: String(card?.definition || ""),
              hint: String(card?.hint || "Review the core mechanism in your notes."),
              topic: String(card?.topic || parsed.subject || "Core Concept"),
              mastery: "new" as const,
            }))
          : [];

      const quiz = isSummaryOnly
        ? []
        : Array.isArray(parsed.quiz)
          ? parsed.quiz.slice(0, safeQuizCount).map((q: any, index: number) => {
              const rawOptions = Array.isArray(q?.options) ? q.options.slice(0, 4).map(String) : [];
              while (rawOptions.length < 4) {
                rawOptions.push(`Option ${rawOptions.length + 1}`);
              }
              const parsedIndex = Number(q?.correctIndex);
              const safeIndex =
                Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < 4 ? parsedIndex : 0;

              return {
                id: `q-${Date.now()}-${index}`,
                question: String(q?.question || `Question ${index + 1}`),
                options: rawOptions,
                correctIndex: safeIndex,
                explanation: String(q?.explanation || ""),
                topic: String(q?.topic || parsed.subject || "Core Concept"),
              };
            })
          : [];

      if (!isSummaryOnly && (flashcards.length === 0 || quiz.length === 0)) {
        return res.status(422).json({
          error: "Could not extract enough material to build flashcards and quiz questions. Please provide more detailed notes.",
        });
      }

      const cleanPreferredSubject =
        typeof preferredSubject === "string" && preferredSubject.trim() && preferredSubject !== "All Subjects"
          ? preferredSubject.trim()
          : "";

      const studySet = {
        id: `set-${Date.now()}`,
        title: String(parsed.title || "Study Session"),
        subject: cleanPreferredSubject || String(parsed.subject || "General Study"),
        summary: String(parsed.summary || ""),
        sourceNotes: trimmedText || String(parsed.extractedNotes || ""),
        keyConcepts: Array.isArray(parsed.keyConcepts)
          ? parsed.keyConcepts.slice(0, 6).map((c: any) => ({
              heading: String(c?.heading || "Key Takeaway"),
              detail: String(c?.detail || ""),
            }))
          : [],
        flashcards,
        quiz,
        createdAt: new Date().toISOString(),
      };

      return res.json({ studySet });
    } catch (error: any) {
      console.error("Gemini study generation failed:", error);
      const { status, message } = normalizeApiError(
        error,
        "Failed to generate study materials from notes. Please try again."
      );
      return res.status(status).json({ error: message });
    }
  });

  // Multi-turn Gemini Study Tutor chat endpoint supporting full conversation history.
  app.post("/api/study/chat", async (req, res) => {
    try {
      const { messages, studyContext, fastMode } = req.body as {
        messages?: Array<{ role: "user" | "model"; text: string }>;
        studyContext?: {
          title?: string;
          subject?: string;
          summary?: string;
          sourceNotes?: string;
          keyConcepts?: Array<{ heading: string; detail: string }>;
          flashcards?: Array<{ term: string; definition: string }>;
        } | null;
        fastMode?: boolean;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Please enter a message to ask the Study Tutor." });
      }

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== "user" || !lastMessage.text?.trim()) {
        return res.status(400).json({ error: "Latest chat turn must be a non-empty user message." });
      }

      const ai = getGeminiClient();

      // Build a role-specific system instruction grounded in the active study set.
      const contextLines: string[] = [
        "You are KnowNest Study Tutor, an encouraging, rigorous academic tutor.",
        "Explain concepts clearly using step-by-step reasoning, concrete analogies, and memory hooks.",
        "When the student asks about their uploaded material, ground your answer directly in their study set below.",
        "Keep answers focused, well-structured, and easy to scan.",
      ];

      if (studyContext?.title) {
        contextLines.push(`\nACTIVE STUDY SET: "${studyContext.title}" (${studyContext.subject || "General"})`);
        if (studyContext.summary) {
          contextLines.push(`Summary: ${studyContext.summary}`);
        }
        if (Array.isArray(studyContext.keyConcepts) && studyContext.keyConcepts.length > 0) {
          contextLines.push(
            "Key Concepts:\n" +
              studyContext.keyConcepts
                .map((c, i) => `${i + 1}. ${c.heading}: ${c.detail}`)
                .join("\n")
          );
        }
        if (Array.isArray(studyContext.flashcards) && studyContext.flashcards.length > 0) {
          contextLines.push(
            "Flashcards:\n" +
              studyContext.flashcards
                .map((fc, i) => `- [${i + 1}] ${fc.term} => ${fc.definition}`)
                .join("\n")
          );
        }
        if (studyContext.sourceNotes) {
          contextLines.push(`Source Notes Excerpt:\n${studyContext.sourceNotes.slice(0, 4000)}`);
        }
      }

      const priorHistory = messages
        .slice(0, -1)
        .filter((m) => (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim())
        .map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

      const chatModels = fastMode
        ? ["gemini-3.1-flash-lite"]
        : ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];

      const { result: response, model: usedModel } = await runWithModelFallback(chatModels, (model) => {
        const chat = ai.chats.create({
          model,
          history: priorHistory,
          config: {
            systemInstruction: contextLines.join("\n"),
          },
        });
        return chat.sendMessage({
          message: lastMessage.text.trim(),
        });
      });

      const reply = response.text?.trim();
      if (!reply) {
        return res.status(500).json({ error: "Study Tutor returned an empty response. Please try again." });
      }

      return res.json({ reply, model: usedModel });
    } catch (error: any) {
      console.error("Gemini study chat failed:", error);
      const { status, message } = normalizeApiError(
        error,
        "Failed to get a response from Study Tutor."
      );
      return res.status(status).json({ error: message });
    }
  });

  // Ensure unmatched /api/* endpoints return JSON 404 instead of falling through to SPA HTML.
  app.use("/api", (req, res) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Ensure middleware/body-parser/route errors on /api/* always return JSON instead of HTML.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.path.startsWith("/api")) {
      return next(err);
    }
    if (res.headersSent) {
      return next(err);
    }
    if (err?.type === "entity.too.large" || err?.status === 413) {
      return res.status(413).json({
        error: "Uploaded notes or attachments exceed the 20 MB request limit. Please use a smaller file.",
      });
    }
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({
        error: "Malformed JSON in API request body.",
      });
    }
    const { status, message } = normalizeApiError(
      err,
      "An unexpected server error occurred."
    );
    return res.status(status).json({ error: message });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`KnowNest server listening on http://localhost:${PORT}`);
  });
}

startServer();
