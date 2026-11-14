/**
 * Core domain types for Luminous Study.
 * Defines the three study modes, flashcard mastery states,
 * quiz timing & streak telemetry, subject-organized note storage,
 * and the Gemini-generated StudySet payload.
 */

export type StudyMode = "notes" | "flashcards" | "quiz";

export type CardMastery = "new" | "needs_review" | "reviewing" | "mastered";

export type FlashcardFilter = "all" | "needs_review" | "mastered";

export interface KeyConcept {
  heading: string;
  detail: string;
}

export interface Flashcard {
  id: string;
  term: string;
  definition: string;
  hint: string;
  topic: string;
  mastery: CardMastery;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic?: string;
}

export interface StudySet {
  id: string;
  title: string;
  subject: string;
  summary: string;
  sourceNotes: string;
  sourceNotesHtml?: string;
  keyConcepts: KeyConcept[];
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  createdAt: string;
}

export interface UploadedFilePayload {
  name: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
}

/**
 * Stored record for previously uploaded files and saved subject notes
 * so the learner can browse, filter by subject, and reuse them anytime.
 */
export interface StoredUploadRecord {
  id: string;
  name: string;
  subject: string;
  kind: "file" | "note";
  mimeType: string;
  sizeBytes: number;
  textContent: string;
  htmlContent?: string;
  fileBase64?: string;
  studySetId?: string;
  uploadedAt: string;
}

/**
 * Tracks daily study streak across consecutive calendar days.
 */
export interface StudyStreakState {
  currentStreakDays: number;
  longestStreakDays: number;
  lastActiveDate: string | null; // YYYY-MM-DD local date
  actionsToday: number;
}

/**
 * Tracks learner progress, elapsed quiz timer, per-question timing,
 * and streak telemetry through the 10-question MCQ quiz.
 * - answers: maps question index (0-9) to selected option index (0-3)
 * - questionTimesMs: maps question index (0-9) to milliseconds spent answering
 * - elapsedSeconds: total running quiz timer in seconds
 * - bestStreak: highest consecutive correct run during this quiz attempt
 */
export interface QuizProgressState {
  currentIndex: number;
  answers: Record<number, number>;
  questionTimesMs: Record<number, number>;
  elapsedSeconds: number;
  isPaused: boolean;
  isCompleted: boolean;
}

/**
 * Represents a single turn in the multi-turn Gemini Study Tutor thread.
 */
export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  createdAt: string;
}
