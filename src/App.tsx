/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { NotesWorkspace } from "./components/NotesWorkspace";
import { FlashcardWorkspace } from "./components/FlashcardWorkspace";
import { QuizWorkspace } from "./components/QuizWorkspace";
import { StudyTutorChat } from "./components/StudyTutorChat";
import {
  CardMastery,
  ChatMessage,
  QuizProgressState,
  StoredUploadRecord,
  StudyMode,
  StudySet,
  StudyStreakState,
  UploadedFilePayload,
} from "./types/study";

const STORAGE_KEY_SETS = "luminous_study_sets_v1";
const STORAGE_KEY_ACTIVE_ID = "luminous_study_active_id_v1";
const STORAGE_KEY_QUIZ_BY_SET = "luminous_study_quiz_progress_v1";
const STORAGE_KEY_CHAT_BY_SET = "luminous_study_chat_history_v1";
const STORAGE_KEY_SUBJECTS = "luminous_study_subjects_v1";
const STORAGE_KEY_UPLOADS = "luminous_study_uploads_v1";
const STORAGE_KEY_STREAK = "luminous_study_streak_v1";

const DEFAULT_SUBJECTS = ["All Subjects", "Cell Biology", "Computer Science"];

const createDefaultQuizProgress = (): QuizProgressState => ({
  currentIndex: 0,
  answers: {},
  questionTimesMs: {},
  elapsedSeconds: 0,
  isPaused: false,
  isCompleted: false,
});

const DEFAULT_STREAK: StudyStreakState = {
  currentStreakDays: 0,
  longestStreakDays: 0,
  lastActiveDate: null,
  actionsToday: 0,
};

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPreviousDateKey(date = new Date()): string {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  return getLocalDateKey(prev);
}

/**
 * Safely parses an API Response as JSON without throwing raw SyntaxError on
 * unexpected HTML/proxy/error pages, surfacing clear error messages instead.
 */
async function parseApiJsonResponse<T>(
  response: Response,
  fallbackError: string
): Promise<T> {
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const trimmed = rawText.trim();

  let parsed: (T & { error?: string }) | null = null;
  if (trimmed) {
    const looksLikeHtml =
      contentType.toLowerCase().includes("text/html") ||
      trimmed.startsWith("<!") ||
      trimmed.toLowerCase().startsWith("<html");
    if (!looksLikeHtml) {
      try {
        parsed = JSON.parse(trimmed) as T & { error?: string };
      } catch {
        parsed = null;
      }
    }
  }

  if (!response.ok) {
    throw new Error(
      parsed?.error ||
        (response.status >= 500
          ? `Server error (${response.status}). Please try again in a moment.`
          : `${fallbackError} (HTTP ${response.status})`)
    );
  }

  if (!parsed) {
    throw new Error(
      "The server returned an unexpected non-JSON response. Please refresh or try again."
    );
  }

  return parsed;
}

/**
 * Root application component managing synchronized state across the three study modes:
 * 1. Navigation & Mode State (`activeMode`: 'notes' | 'flashcards' | 'quiz')
 * 2. Subject Organizer & Previous Uploads Vault (`subjects`, `selectedSubject`, `storedUploads`)
 * 3. Rich Lecture Notes Editor State (`notesInput`, `notesHtml`, `editorSyncVersion`, `uploadedFile`)
 * 4. Gemini Generation & Study Set Library State (`savedSets`, `activeSetId`)
 * 5. Flashcard Mastery State (mutating `mastery` inside the active StudySet's flashcards)
 * 6. Quiz Timer, Per-Question Timing, Live Streak & Score State (`quizProgressBySet`)
 * 7. Daily Study Streak State (`studyStreak`) & Multi-Turn Tutor Chat (`chatHistoryBySet`)
 */
export default function App() {
  const [activeMode, setActiveMode] = useState<StudyMode>("notes");

  // Hydrate saved study sets from localStorage so learners do not lose generated decks on refresh.
  const [savedSets, setSavedSets] = useState<StudySet[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETS);
      return raw ? (JSON.parse(raw) as StudySet[]) : [];
    } catch {
      return [];
    }
  });

  // Track which StudySet is currently open across Notes, Flashcards, and Quiz.
  const [activeSetId, setActiveSetId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    } catch {
      return null;
    }
  });

  // Subject organizer list and active filter tab shown above the lecture notes section.
  const [subjects, setSubjects] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SUBJECTS);
      const parsed = raw ? (JSON.parse(raw) as string[]) : DEFAULT_SUBJECTS;
      return parsed.includes("All Subjects")
        ? parsed
        : ["All Subjects", ...parsed];
    } catch {
      return DEFAULT_SUBJECTS;
    }
  });
  const [selectedSubject, setSelectedSubject] = useState<string>("All Subjects");

  // Vault of previously uploaded files and saved subject notes for reuse.
  const [storedUploads, setStoredUploads] = useState<StoredUploadRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_UPLOADS);
      return raw ? (JSON.parse(raw) as StoredUploadRecord[]) : [];
    } catch {
      return [];
    }
  });

  // Daily study streak state persisted across sessions.
  const [studyStreak, setStudyStreak] = useState<StudyStreakState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_STREAK);
      if (!raw) return DEFAULT_STREAK;
      const parsed = JSON.parse(raw) as StudyStreakState;
      const today = getLocalDateKey();
      const yesterday = getPreviousDateKey();
      // Reset today's action counter on a new day, and reset current streak if > 1 day missed.
      if (parsed.lastActiveDate && parsed.lastActiveDate !== today) {
        const stillAlive = parsed.lastActiveDate === yesterday;
        return {
          ...parsed,
          currentStreakDays: stillAlive ? parsed.currentStreakDays : 0,
          actionsToday: 0,
        };
      }
      return parsed;
    } catch {
      return DEFAULT_STREAK;
    }
  });

  // Hydrate per-set quiz progress (including timer seconds and per-question response times).
  const [quizProgressBySet, setQuizProgressBySet] = useState<
    Record<string, QuizProgressState>
  >(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_QUIZ_BY_SET);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, Partial<QuizProgressState>>;
      const normalized: Record<string, QuizProgressState> = {};
      for (const [id, state] of Object.entries(parsed)) {
        normalized[id] = {
          ...createDefaultQuizProgress(),
          ...state,
          questionTimesMs: state?.questionTimesMs ?? {},
          elapsedSeconds: state?.elapsedSeconds ?? 0,
          isPaused: state?.isPaused ?? false,
        };
      }
      return normalized;
    } catch {
      return {};
    }
  });

  // Hydrate per-set Study Tutor chat history so multi-turn conversations persist across modes.
  const [chatHistoryBySet, setChatHistoryBySet] = useState<
    Record<string, ChatMessage[]>
  >(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CHAT_BY_SET);
      return raw ? (JSON.parse(raw) as Record<string, ChatMessage[]>) : {};
    } catch {
      return {};
    }
  });

  // Resolve the active StudySet strictly from activeSetId so "New Study Set" and new uploads clear old overviews cleanly.
  const activeStudySet = activeSetId
    ? savedSets.find((s) => s.id === activeSetId) ?? null
    : null;

  // Editable lecture notes state (plain text + formatted HTML + sync counter for external replacements).
  const [notesInput, setNotesInput] = useState<string>(() => {
    return activeStudySet?.sourceNotes ?? "";
  });
  const [notesHtml, setNotesHtml] = useState<string>(() => {
    return activeStudySet?.sourceNotesHtml ?? "";
  });
  const [editorSyncVersion, setEditorSyncVersion] = useState<number>(0);
  const [uploadedFile, setUploadedFile] = useState<UploadedFilePayload | null>(null);

  // Configurable generation counts (10 min to 30 max) for flashcards and quiz MCQs.
  const [flashcardCount, setFlashcardCount] = useState<number>(10);
  const [quizCount, setQuizCount] = useState<number>(10);

  // Async Gemini generation & Study Tutor chat lifecycle state.
  const [generationMode, setGenerationMode] = useState<"summary" | "full" | null>(null);
  const isGenerating = generationMode !== null;
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Monotonic request counter so newer uploads/generations cleanly supersede any earlier in-flight call.
  const generationRequestIdRef = useRef<number>(0);

  // Timestamp reference used to measure exact time spent answering each quiz question.
  const questionStartedAtRef = useRef<number>(Date.now());

  // Persist all slices to localStorage safely.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETS, JSON.stringify(savedSets));
    } catch {
      // Ignore storage quota errors gracefully.
    }
  }, [savedSets]);

  useEffect(() => {
    try {
      if (activeStudySet?.id) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeStudySet.id);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
      }
    } catch {
      // Ignore storage errors.
    }
  }, [activeStudySet?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SUBJECTS, JSON.stringify(subjects));
    } catch {
      // Ignore storage errors.
    }
  }, [subjects]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_UPLOADS, JSON.stringify(storedUploads));
    } catch {
      // If embedded images exceed quota, retry saving without binary base64 payloads.
      try {
        const trimmed = storedUploads.map((item) => ({ ...item, fileBase64: undefined }));
        localStorage.setItem(STORAGE_KEY_UPLOADS, JSON.stringify(trimmed));
      } catch {
        // Ignore storage errors.
      }
    }
  }, [storedUploads]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STREAK, JSON.stringify(studyStreak));
    } catch {
      // Ignore storage errors.
    }
  }, [studyStreak]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_QUIZ_BY_SET,
        JSON.stringify(quizProgressBySet)
      );
    } catch {
      // Ignore storage errors.
    }
  }, [quizProgressBySet]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_CHAT_BY_SET,
        JSON.stringify(chatHistoryBySet)
      );
    } catch {
      // Ignore storage errors.
    }
  }, [chatHistoryBySet]);

  /**
   * Records a completed study action toward the learner's daily study streak.
   */
  const recordStudyActivity = () => {
    const today = getLocalDateKey();
    const yesterday = getPreviousDateKey();
    setStudyStreak((prev) => {
      if (prev.lastActiveDate === today) {
        return { ...prev, actionsToday: prev.actionsToday + 1 };
      }
      const nextStreak =
        prev.lastActiveDate === yesterday ? prev.currentStreakDays + 1 : 1;
      return {
        currentStreakDays: nextStreak,
        longestStreakDays: Math.max(prev.longestStreakDays, nextStreak),
        lastActiveDate: today,
        actionsToday: 1,
      };
    });
  };

  // Adds a subject to the organizer bar (deduplicated case-insensitively).
  const handleAddSubject = (subjectName: string) => {
    const cleaned = subjectName.trim();
    if (!cleaned) return;
    setSubjects((prev) => {
      if (prev.some((s) => s.toLowerCase() === cleaned.toLowerCase())) {
        return prev;
      }
      return [...prev, cleaned];
    });
  };

  // Explicit user-triggered action from below the notes editor to add and assign a subject.
  const handleAddSubjectFromNotes = (subjectName: string) => {
    const cleaned = subjectName.trim();
    if (!cleaned) return;
    handleAddSubject(cleaned);
    setSelectedSubject(cleaned);
    if (activeStudySet) {
      setSavedSets((prev) =>
        prev.map((s) =>
          s.id === activeStudySet.id ? { ...s, subject: cleaned } : s
        )
      );
      setStoredUploads((prev) =>
        prev.map((u) =>
          u.studySetId === activeStudySet.id ? { ...u, subject: cleaned } : u
        )
      );
    }
  };

  // Deletes a subject from the organizer bar (protecting "All Subjects") and resets filter if needed.
  const handleDeleteSubject = (subjectName: string) => {
    if (subjectName === "All Subjects") return;
    setSubjects((prev) =>
      prev.filter((s) => s.toLowerCase() !== subjectName.toLowerCase())
    );
    if (selectedSubject.toLowerCase() === subjectName.toLowerCase()) {
      setSelectedSubject("All Subjects");
    }
  };

  // Updates rich editor content during typing without resetting editor DOM selection.
  const handleChangeNotes = (plainText: string, htmlContent: string) => {
    setNotesInput(plainText);
    setNotesHtml(htmlContent);
    if (activeStudySet) {
      setSavedSets((prev) =>
        prev.map((s) =>
          s.id === activeStudySet.id
            ? { ...s, sourceNotes: plainText, sourceNotesHtml: htmlContent }
            : s
        )
      );
      setStoredUploads((prev) =>
        prev.map((u) =>
          u.studySetId === activeStudySet.id
            ? { ...u, textContent: plainText, htmlContent }
            : u
        )
      );
    }
  };

  // Replaces editor content externally (upload load, clear) and bumps sync key.
  const handleReplaceNotesFromSource = (
    plainText: string,
    htmlContent = ""
  ) => {
    setNotesInput(plainText);
    setNotesHtml(htmlContent);
    setEditorSyncVersion((v) => v + 1);
  };

  // Stores an uploaded file or formatted note snapshot into the Previous Uploads Vault.
  const saveRecordToUploadsVault = (record: Omit<StoredUploadRecord, "id" | "uploadedAt">): string => {
    const id = `upl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newRecord: StoredUploadRecord = {
      ...record,
      id,
      uploadedAt: new Date().toISOString(),
    };
    setStoredUploads((prev) => [newRecord, ...prev].slice(0, 30));
    return id;
  };

  // Updates uploaded file attachment state without auto-creating subjects.
  const handleSetUploadedFile = (file: UploadedFilePayload | null) => {
    setUploadedFile(file);
  };

  // Saves the current editable lecture notes (with bold/highlight/images) into the Vault without auto-creating subjects.
  const handleSaveCurrentNotesToVault = () => {
    if (!notesInput.trim() && !uploadedFile) return;
    const targetSubject =
      selectedSubject !== "All Subjects"
        ? selectedSubject
        : activeStudySet?.subject || "General Study";
    const firstLine =
      notesInput
        .trim()
        .split("\n")
        .find((line) => line.trim().length > 0)
        ?.slice(0, 48) || uploadedFile?.name || "Saved Lecture Notes";

    saveRecordToUploadsVault({
      name: uploadedFile ? uploadedFile.name : firstLine,
      subject: targetSubject,
      kind: uploadedFile ? "file" : "note",
      mimeType: uploadedFile ? uploadedFile.mimeType : "text/html",
      sizeBytes: uploadedFile ? uploadedFile.sizeBytes : notesHtml.length || notesInput.length,
      textContent: notesInput,
      htmlContent: notesHtml,
      studySetId: activeStudySet?.id,
      fileBase64:
        uploadedFile && uploadedFile.sizeBytes <= 2 * 1024 * 1024
          ? uploadedFile.base64
          : undefined,
    });
    recordStudyActivity();
  };

  // Reuses a stored upload or saved note from Previous Uploads, retrieving both its written notes and Summary.
  const handleReuseStoredUpload = (record: StoredUploadRecord) => {
    if (subjects.some((s) => s.toLowerCase() === record.subject.toLowerCase())) {
      setSelectedSubject(record.subject);
    }

    const trimmedRecordText = record.textContent.trim();
    const matchedSet =
      (record.studySetId
        ? savedSets.find((s) => s.id === record.studySetId)
        : undefined) ??
      savedSets.find((s) => {
        if (trimmedRecordText && s.sourceNotes.trim() === trimmedRecordText) {
          return true;
        }
        return s.title === record.name;
      });

    if (matchedSet) {
      setActiveSetId(matchedSet.id);
      setUploadedFile(null);
      handleReplaceNotesFromSource(
        record.textContent || matchedSet.sourceNotes,
        record.htmlContent || matchedSet.sourceNotesHtml || ""
      );
    } else {
      setActiveSetId(null);
      if (record.kind === "file" && record.fileBase64) {
        setUploadedFile({
          name: record.name,
          mimeType: record.mimeType,
          base64: record.fileBase64,
          sizeBytes: record.sizeBytes,
        });
      } else {
        setUploadedFile(null);
      }
      handleReplaceNotesFromSource(record.textContent, record.htmlContent || "");
    }
    setGenerationError(null);
  };

  const handleDeleteStoredUpload = (recordId: string) => {
    setStoredUploads((prev) => prev.filter((r) => r.id !== recordId));
  };

  /**
   * Core generation runner used when clicking "Generate Notes & Summary",
   * "Generate X Cards & Y MCQs", or immediately after uploading a file.
   * Never auto-creates entries in the Subjects organizer bar.
   */
  const runStudySetGeneration = async (params: {
    mode: "summary" | "full";
    notesText: string;
    notesHtmlSnapshot: string;
    file: UploadedFilePayload | null;
    saveToVault: boolean;
    uploadRecordId?: string;
    targetExistingSetId?: string | null;
  }) => {
    const {
      mode,
      notesText,
      notesHtmlSnapshot,
      file,
      saveToVault,
      uploadRecordId,
      targetExistingSetId,
    } = params;

    if (!notesText.trim() && !file) {
      setGenerationError("Please paste notes or upload a file before generating.");
      return;
    }

    const requestId = ++generationRequestIdRef.current;
    setGenerationMode(mode);
    setGenerationError(null);

    try {
      const response = await fetch("/api/study/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          notesText,
          preferredSubject: selectedSubject,
          flashcardCount,
          quizCount,
          file: file
            ? {
                name: file.name,
                mimeType: file.mimeType,
                base64: file.base64,
              }
            : undefined,
        }),
      });

      const data = await parseApiJsonResponse<{ studySet?: StudySet; error?: string }>(
        response,
        "Failed to generate study materials from your notes."
      );
      if (!data?.studySet) {
        throw new Error(
          data?.error || "Failed to generate study materials from your notes."
        );
      }

      // Discard stale response if the user already cleared or uploaded a newer document.
      if (requestId !== generationRequestIdRef.current) {
        return;
      }

      const generated = data.studySet as StudySet;
      const existingTarget = targetExistingSetId
        ? savedSets.find((s) => s.id === targetExistingSetId)
        : undefined;

      const resolvedSet: StudySet = existingTarget
        ? {
            ...existingTarget,
            title: generated.title || existingTarget.title,
            subject: generated.subject || existingTarget.subject,
            summary: generated.summary,
            keyConcepts: generated.keyConcepts,
            sourceNotes: generated.sourceNotes,
            sourceNotesHtml: notesHtmlSnapshot || existingTarget.sourceNotesHtml,
            flashcards:
              mode === "full" ? generated.flashcards : existingTarget.flashcards,
            quiz: mode === "full" ? generated.quiz : existingTarget.quiz,
          }
        : {
            ...generated,
            sourceNotesHtml: notesHtmlSnapshot || undefined,
          };

      if (existingTarget) {
        setSavedSets((prev) =>
          prev.map((s) => (s.id === existingTarget.id ? resolvedSet : s))
        );
      } else {
        setSavedSets((prev) => [resolvedSet, ...prev]);
        setQuizProgressBySet((prev) => ({
          ...prev,
          [resolvedSet.id]: createDefaultQuizProgress(),
        }));
      }

      if (uploadRecordId) {
        setStoredUploads((prev) =>
          prev.map((u) =>
            u.id === uploadRecordId
              ? {
                  ...u,
                  studySetId: resolvedSet.id,
                  textContent: resolvedSet.sourceNotes,
                  htmlContent: resolvedSet.sourceNotesHtml,
                }
              : u
          )
        );
      } else if (existingTarget) {
        setStoredUploads((prev) =>
          prev.map((u) =>
            u.studySetId === existingTarget.id
              ? {
                  ...u,
                  textContent: resolvedSet.sourceNotes,
                  htmlContent: resolvedSet.sourceNotesHtml,
                }
              : u
          )
        );
      }

      if (saveToVault) {
        saveRecordToUploadsVault({
          name: file ? file.name : resolvedSet.title,
          subject: resolvedSet.subject,
          kind: file ? "file" : "note",
          mimeType: file ? file.mimeType : "text/html",
          sizeBytes: file
            ? file.sizeBytes
            : (notesHtmlSnapshot || resolvedSet.sourceNotes).length,
          textContent: resolvedSet.sourceNotes,
          htmlContent: notesHtmlSnapshot || undefined,
          studySetId: resolvedSet.id,
          fileBase64:
            file && file.sizeBytes <= 2 * 1024 * 1024
              ? file.base64
              : undefined,
        });
      }

      setActiveSetId(resolvedSet.id);
      handleReplaceNotesFromSource(resolvedSet.sourceNotes, notesHtmlSnapshot);
      setUploadedFile(null);
      recordStudyActivity();
    } catch (err: any) {
      if (requestId !== generationRequestIdRef.current) {
        return;
      }
      setGenerationError(
        err?.message || "Something went wrong while generating your study set."
      );
    } finally {
      if (requestId === generationRequestIdRef.current) {
        setGenerationMode(null);
      }
    }
  };

  /**
   * Generates or refreshes only the Notes & Summary (overview + key concepts) quickly.
   */
  const handleGenerateNotesAndSummary = async () => {
    const existingHasMatchingSet = Boolean(activeStudySet);
    await runStudySetGeneration({
      mode: "summary",
      notesText: notesInput,
      notesHtmlSnapshot: notesHtml,
      file: uploadedFile,
      saveToVault: !existingHasMatchingSet,
      targetExistingSetId: activeStudySet?.id ?? null,
    });
  };

  /**
   * Calls the server-side Gemini endpoint (/api/study/generate) to synthesize
   * structured study concepts, flashcards, and MCQs from the user's current notes.
   */
  const handleGenerateStudySet = async () => {
    const canUpgradeSummaryOnlySet =
      Boolean(activeStudySet) &&
      activeStudySet!.flashcards.length === 0 &&
      activeStudySet!.quiz.length === 0;

    await runStudySetGeneration({
      mode: "full",
      notesText: notesInput,
      notesHtmlSnapshot: notesHtml,
      file: uploadedFile,
      saveToVault: !canUpgradeSummaryOnlySet,
      targetExistingSetId: canUpgradeSummaryOnlySet ? activeStudySet?.id ?? null : null,
    });
  };

  /**
   * Handles uploading a new document:
   * 1. Immediately clears old notes, old uploaded file, and old active summary so nothing overlaps.
   * 2. Saves the uploaded file to the Previous Uploads Vault without auto-creating a subject.
   * 3. Immediately populates Notes (for text files) and triggers synthesis so both Notes and Summary update right away.
   */
  const handleUploadDocument = (payload: {
    textContent: string;
    file: UploadedFilePayload | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }) => {
    // Clear all previous document state immediately so nothing overlaps.
    setActiveSetId(null);
    setGenerationError(null);
    setUploadedFile(payload.file);
    handleReplaceNotesFromSource(payload.textContent, "");

    const vaultSubject =
      selectedSubject !== "All Subjects" ? selectedSubject : "General Study";
    const uploadRecordId = saveRecordToUploadsVault({
      name: payload.fileName,
      subject: vaultSubject,
      kind: payload.file ? "file" : "note",
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      textContent: payload.textContent,
      fileBase64:
        payload.file && payload.file.sizeBytes <= 2 * 1024 * 1024
          ? payload.file.base64
          : undefined,
    });

    void runStudySetGeneration({
      mode: "full",
      notesText: payload.textContent,
      notesHtmlSnapshot: "",
      file: payload.file,
      saveToVault: false,
      uploadRecordId,
    });
  };

  // Clears the current notes composer, uploaded file, and active study set to start a fresh study set in Notes mode.
  const handleStartNewSet = () => {
    generationRequestIdRef.current += 1;
    setGenerationMode(null);
    setActiveMode("notes");
    setActiveSetId(null);
    handleReplaceNotesFromSource("", "");
    setUploadedFile(null);
    setGenerationError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Switches the active study set and loads its editable rich notes into the editor.
  const handleSelectSavedSet = (setId: string) => {
    const found = savedSets.find((s) => s.id === setId);
    if (!found) return;
    setActiveSetId(found.id);
    if (subjects.some((s) => s.toLowerCase() === found.subject.toLowerCase())) {
      setSelectedSubject(found.subject);
    }
    handleReplaceNotesFromSource(found.sourceNotes, found.sourceNotesHtml || "");
    setUploadedFile(null);
    setGenerationError(null);
  };

  // Removes a saved study set and cleans up its stored quiz progress and vault links.
  const handleDeleteSavedSet = (setId: string) => {
    setSavedSets((prev) => prev.filter((s) => s.id !== setId));
    setStoredUploads((prev) =>
      prev.map((u) => (u.studySetId === setId ? { ...u, studySetId: undefined } : u))
    );
    setQuizProgressBySet((prev) => {
      const next = { ...prev };
      delete next[setId];
      return next;
    });
    if (activeSetId === setId) {
      setActiveSetId(null);
    }
  };

  // Updates an individual flashcard's mastery rating and logs daily study activity.
  const handleUpdateCardMastery = (cardId: string, mastery: CardMastery) => {
    if (!activeStudySet) return;
    setSavedSets((prev) =>
      prev.map((set) => {
        if (set.id !== activeStudySet.id) return set;
        return {
          ...set,
          flashcards: set.flashcards.map((card) =>
            card.id === cardId ? { ...card, mastery } : card
          ),
        };
      })
    );
    recordStudyActivity();
  };

  const handleResetDeckMastery = () => {
    if (!activeStudySet) return;
    setSavedSets((prev) =>
      prev.map((set) => {
        if (set.id !== activeStudySet.id) return set;
        return {
          ...set,
          flashcards: set.flashcards.map((card) => ({ ...card, mastery: "new" })),
        };
      })
    );
  };

  const handleShuffleDeck = () => {
    if (!activeStudySet) return;
    setSavedSets((prev) =>
      prev.map((set) => {
        if (set.id !== activeStudySet.id) return set;
        const copy = [...set.flashcards];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return { ...set, flashcards: copy };
      })
    );
  };

  // Active quiz state for the currently selected study set.
  const activeQuizProgress: QuizProgressState = activeStudySet
    ? quizProgressBySet[activeStudySet.id] ?? createDefaultQuizProgress()
    : createDefaultQuizProgress();

  // Live Quiz Timer effect: ticks every second while viewing Quiz mode, unpaused, and not completed.
  useEffect(() => {
    if (
      activeMode !== "quiz" ||
      !activeStudySet ||
      activeQuizProgress.isCompleted ||
      activeQuizProgress.isPaused
    ) {
      return;
    }

    questionStartedAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      setQuizProgressBySet((prev) => {
        const current = prev[activeStudySet.id] ?? createDefaultQuizProgress();
        if (current.isCompleted || current.isPaused) return prev;
        return {
          ...prev,
          [activeStudySet.id]: {
            ...current,
            elapsedSeconds: (current.elapsedSeconds ?? 0) + 1,
          },
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    activeMode,
    activeStudySet?.id,
    activeQuizProgress.isCompleted,
    activeQuizProgress.isPaused,
  ]);

  // Reset per-question timer baseline whenever the active question index changes.
  useEffect(() => {
    questionStartedAtRef.current = Date.now();
  }, [activeQuizProgress.currentIndex, activeStudySet?.id]);

  // Records the learner's selected option and exact time spent on that question.
  const handleSelectQuizOption = (questionIndex: number, optionIndex: number) => {
    if (!activeStudySet) return;
    const spentMs = Math.max(400, Date.now() - questionStartedAtRef.current);

    setQuizProgressBySet((prev) => {
      const current = prev[activeStudySet.id] ?? createDefaultQuizProgress();
      if (current.answers[questionIndex] !== undefined) {
        return prev;
      }
      return {
        ...prev,
        [activeStudySet.id]: {
          ...current,
          answers: {
            ...current.answers,
            [questionIndex]: optionIndex,
          },
          questionTimesMs: {
            ...(current.questionTimesMs ?? {}),
            [questionIndex]: spentMs,
          },
        },
      };
    });
    recordStudyActivity();
  };

  const handleGoToQuestion = (questionIndex: number) => {
    if (!activeStudySet) return;
    questionStartedAtRef.current = Date.now();
    setQuizProgressBySet((prev) => {
      const current = prev[activeStudySet.id] ?? createDefaultQuizProgress();
      return {
        ...prev,
        [activeStudySet.id]: {
          ...current,
          currentIndex: questionIndex,
        },
      };
    });
  };

  const handleTogglePauseTimer = () => {
    if (!activeStudySet) return;
    questionStartedAtRef.current = Date.now();
    setQuizProgressBySet((prev) => {
      const current = prev[activeStudySet.id] ?? createDefaultQuizProgress();
      return {
        ...prev,
        [activeStudySet.id]: {
          ...current,
          isPaused: !current.isPaused,
        },
      };
    });
  };

  const handleCompleteQuiz = () => {
    if (!activeStudySet) return;
    setQuizProgressBySet((prev) => {
      const current = prev[activeStudySet.id] ?? createDefaultQuizProgress();
      return {
        ...prev,
        [activeStudySet.id]: {
          ...current,
          isCompleted: true,
          isPaused: false,
        },
      };
    });
  };

  const handleRetakeQuiz = () => {
    if (!activeStudySet) return;
    questionStartedAtRef.current = Date.now();
    setQuizProgressBySet((prev) => ({
      ...prev,
      [activeStudySet.id]: createDefaultQuizProgress(),
    }));
  };

  // Multi-turn Study Tutor chat handlers.
  const activeChatKey = activeStudySet?.id ?? "general";
  const activeChatMessages = chatHistoryBySet[activeChatKey] ?? [];

  const handleSendChatMessage = async (text: string, fastMode: boolean) => {
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };

    const updatedThread = [...activeChatMessages, userMessage];
    setChatHistoryBySet((prev) => ({
      ...prev,
      [activeChatKey]: updatedThread,
    }));
    setIsSendingChat(true);
    setChatError(null);

    try {
      const response = await fetch("/api/study/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedThread.map((m) => ({ role: m.role, text: m.text })),
          fastMode,
          studyContext: activeStudySet
            ? {
                title: activeStudySet.title,
                subject: activeStudySet.subject,
                summary: activeStudySet.summary,
                sourceNotes: activeStudySet.sourceNotes,
                keyConcepts: activeStudySet.keyConcepts,
                flashcards: activeStudySet.flashcards.map((fc) => ({
                  term: fc.term,
                  definition: fc.definition,
                })),
              }
            : null,
        }),
      });

      const data = await parseApiJsonResponse<{ reply?: string; error?: string }>(
        response,
        "Failed to get a response from Study Tutor."
      );
      if (!data?.reply) {
        throw new Error(data?.error || "Failed to get a response from Study Tutor.");
      }

      const modelMessage: ChatMessage = {
        id: `msg-${Date.now()}-m`,
        role: "model",
        text: data.reply,
        createdAt: new Date().toISOString(),
      };

      setChatHistoryBySet((prev) => ({
        ...prev,
        [activeChatKey]: [...(prev[activeChatKey] ?? updatedThread), modelMessage],
      }));
    } catch (err: any) {
      setChatError(
        err?.message || "Unable to reach Study Tutor right now. Please try again."
      );
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleClearChat = () => {
    setChatHistoryBySet((prev) => ({
      ...prev,
      [activeChatKey]: [],
    }));
    setChatError(null);
  };

  // Opens Study Tutor from the Knowledge Gaps tab with a targeted coaching prompt.
  const handleAskTutorAboutConcept = (
    concept: string,
    missedQuestions: string[]
  ) => {
    setIsChatOpen(true);
    const contextSnippet =
      missedQuestions.length > 0
        ? ` Specifically, help me understand these questions:\n- ${missedQuestions.slice(0, 2).join("\n- ")}`
        : "";
    void handleSendChatMessage(
      `Help me master the concept "${concept}" from my study notes.${contextSnippet}`,
      false
    );
  };

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] flex flex-col">
      <TopBar
        activeMode={activeMode}
        onSelectMode={setActiveMode}
        onStartNewSet={handleStartNewSet}
        hasStudySet={Boolean(activeStudySet)}
      />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-24 md:pb-12">
        {activeMode === "notes" && (
          <NotesWorkspace
            notesInput={notesInput}
            notesHtml={notesHtml}
            editorSyncVersion={editorSyncVersion}
            onChangeNotes={handleChangeNotes}
            onReplaceNotesFromSource={handleReplaceNotesFromSource}
            uploadedFile={uploadedFile}
            onSetUploadedFile={handleSetUploadedFile}
            onUploadDocument={handleUploadDocument}
            subjects={subjects}
            selectedSubject={selectedSubject}
            onSelectSubject={setSelectedSubject}
            onAddSubject={handleAddSubject}
            onAddSubjectFromNotes={handleAddSubjectFromNotes}
            onDeleteSubject={handleDeleteSubject}
            storedUploads={storedUploads}
            onSaveCurrentNotesToVault={handleSaveCurrentNotesToVault}
            onReuseStoredUpload={handleReuseStoredUpload}
            onDeleteStoredUpload={handleDeleteStoredUpload}
            studyStreak={studyStreak}
            isGenerating={isGenerating}
            generationMode={generationMode}
            generationError={generationError}
            flashcardCount={flashcardCount}
            quizCount={quizCount}
            onChangeFlashcardCount={setFlashcardCount}
            onChangeQuizCount={setQuizCount}
            onGenerateSummaryOnly={handleGenerateNotesAndSummary}
            onGenerateStudySet={handleGenerateStudySet}
            activeStudySet={activeStudySet}
            savedSets={savedSets}
            onSelectSavedSet={handleSelectSavedSet}
            onDeleteSavedSet={handleDeleteSavedSet}
            onNavigateMode={setActiveMode}
            quizProgress={activeQuizProgress}
          />
        )}

        {activeMode === "flashcards" && (
          <FlashcardWorkspace
            studySet={activeStudySet}
            onUpdateCardMastery={handleUpdateCardMastery}
            onResetDeckMastery={handleResetDeckMastery}
            onShuffleDeck={handleShuffleDeck}
            onNavigateMode={setActiveMode}
          />
        )}

        {activeMode === "quiz" && (
          <QuizWorkspace
            studySet={activeStudySet}
            quizProgress={activeQuizProgress}
            studyStreak={studyStreak}
            onSelectOption={handleSelectQuizOption}
            onGoToQuestion={handleGoToQuestion}
            onTogglePauseTimer={handleTogglePauseTimer}
            onCompleteQuiz={handleCompleteQuiz}
            onRetakeQuiz={handleRetakeQuiz}
            onNavigateMode={setActiveMode}
            onAskTutorAboutConcept={handleAskTutorAboutConcept}
          />
        )}
      </main>

      <StudyTutorChat
        activeStudySet={activeStudySet}
        messages={activeChatMessages}
        onSendMessage={handleSendChatMessage}
        onClearChat={handleClearChat}
        isSending={isSendingChat}
        chatError={chatError}
        isOpen={isChatOpen}
        onSetOpen={setIsChatOpen}
      />
    </div>
  );
}
