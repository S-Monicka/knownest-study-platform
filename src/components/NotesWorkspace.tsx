import React, { useMemo, useRef, useState } from "react";
import {
  Upload,
  FileText,
  X,
  ArrowRight,
  Loader2,
  Trash2,
  Layers,
  CheckSquare,
  AlertCircle,
  BookOpen,
  Download,
  FolderPlus,
  Flame,
  BookmarkCheck,
  FolderOpen,
} from "lucide-react";
import { exportStudySetToPdf } from "../utils/exportStudyPdf";
import { RichNotesEditor } from "./RichNotesEditor";
import {
  QuizProgressState,
  StoredUploadRecord,
  StudyMode,
  StudySet,
  StudyStreakState,
  UploadedFilePayload,
} from "../types/study";
import { MasteryMeter } from "./MasteryMeter";

interface NotesWorkspaceProps {
  notesInput: string;
  notesHtml: string;
  editorSyncVersion: number;
  onChangeNotes: (plainText: string, htmlContent: string) => void;
  onReplaceNotesFromSource: (plainText: string, htmlContent?: string) => void;
  uploadedFile: UploadedFilePayload | null;
  onSetUploadedFile: (file: UploadedFilePayload | null) => void;
  onUploadDocument: (payload: {
    textContent: string;
    file: UploadedFilePayload | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }) => void;
  subjects: string[];
  selectedSubject: string;
  onSelectSubject: (subject: string) => void;
  onAddSubject: (subjectName: string) => void;
  onAddSubjectFromNotes: (subjectName: string) => void;
  onDeleteSubject: (subjectName: string) => void;
  storedUploads: StoredUploadRecord[];
  onSaveCurrentNotesToVault: () => void;
  onReuseStoredUpload: (record: StoredUploadRecord) => void;
  onDeleteStoredUpload: (recordId: string) => void;
  studyStreak: StudyStreakState;
  isGenerating: boolean;
  generationMode: "summary" | "full" | null;
  generationError: string | null;
  flashcardCount: number;
  quizCount: number;
  onChangeFlashcardCount: (count: number) => void;
  onChangeQuizCount: (count: number) => void;
  onGenerateSummaryOnly: () => void;
  onGenerateStudySet: () => void;
  activeStudySet: StudySet | null;
  savedSets: StudySet[];
  onSelectSavedSet: (setId: string) => void;
  onDeleteSavedSet: (setId: string) => void;
  onNavigateMode: (mode: StudyMode) => void;
  quizProgress: QuizProgressState;
}

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".csv", ".pdf", ".png", ".jpg", ".jpeg", ".webp"];

/**
 * NotesWorkspace handles Mode 1 (Notes Section):
 * - Subject Organizer Bar directly above the lecture notes section for grouping & reusing notes by subject
 * - Editable Rich Lecture Notes editor (write, bold, italic, underline, highlight, lists, inline images)
 * - Drag-and-drop / file upload with automatic storage into Previous Uploads Vault
 * - Daily Study Streak + Mastery Meter + Quiz Telemetry + Subject-filtered Saved Study Sets & Previous Uploads
 */
export function NotesWorkspace({
  notesInput,
  notesHtml,
  editorSyncVersion,
  onChangeNotes,
  onReplaceNotesFromSource,
  uploadedFile,
  onSetUploadedFile,
  onUploadDocument,
  subjects,
  selectedSubject,
  onSelectSubject,
  onAddSubject,
  onAddSubjectFromNotes,
  onDeleteSubject,
  storedUploads,
  onSaveCurrentNotesToVault,
  onReuseStoredUpload,
  onDeleteStoredUpload,
  studyStreak,
  isGenerating,
  generationMode,
  generationError,
  flashcardCount,
  quizCount,
  onChangeFlashcardCount,
  onChangeQuizCount,
  onGenerateSummaryOnly,
  onGenerateStudySet,
  activeStudySet,
  savedSets,
  onSelectSavedSet,
  onDeleteSavedSet,
  onNavigateMode,
  quizProgress,
}: NotesWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileReadError, setFileReadError] = useState<string | null>(null);
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [isAddingNoteSubject, setIsAddingNoteSubject] = useState(false);
  const [noteSubjectDraft, setNoteSubjectDraft] = useState("");

  // Filter saved study sets and stored uploads according to the selected subject tab.
  const filteredSavedSets = useMemo(() => {
    if (selectedSubject === "All Subjects") return savedSets;
    return savedSets.filter(
      (s) => s.subject.toLowerCase() === selectedSubject.toLowerCase()
    );
  }, [savedSets, selectedSubject]);

  const filteredUploads = useMemo(() => {
    if (selectedSubject === "All Subjects") return storedUploads;
    return storedUploads.filter(
      (u) => u.subject.toLowerCase() === selectedSubject.toLowerCase()
    );
  }, [storedUploads, selectedSubject]);

  const handleCreateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newSubjectName.trim();
    if (!cleaned) return;
    onAddSubject(cleaned);
    onSelectSubject(cleaned);
    setNewSubjectName("");
    setIsAddingSubject(false);
  };

  /**
   * Reads a user-selected file:
   * - Plain-text files (.txt, .md, .csv) populate the rich lecture notes editor immediately.
   * - PDFs & images are encoded to Base64 for multimodal Gemini analysis.
   */
  const processSelectedFile = async (file: File) => {
    setFileReadError(null);
    const lowerName = file.name.toLowerCase();
    const isTextFile =
      file.type.startsWith("text/") ||
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".csv");

    const isSupportedBinary =
      file.type === "application/pdf" ||
      lowerName.endsWith(".pdf") ||
      file.type.startsWith("image/");

    if (!isTextFile && !isSupportedBinary) {
      setFileReadError(
        "Unsupported file format. Upload .txt, .md, .csv, .pdf, or an image (.png, .jpg, .webp)."
      );
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setFileReadError("File exceeds 15 MB limit. Please upload a smaller document.");
      return;
    }

    if (isTextFile) {
      const text = await file.text();
      onUploadDocument({
        textContent: text,
        file: null,
        fileName: file.name,
        mimeType: file.type || "text/plain",
        sizeBytes: file.size,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : "";
      if (!base64) {
        setFileReadError("Could not read file contents. Please try another file.");
        return;
      }
      const mimeType =
        file.type || (lowerName.endsWith(".pdf") ? "application/pdf" : "image/png");
      onUploadDocument({
        textContent: "",
        file: {
          name: file.name,
          mimeType,
          base64,
          sizeBytes: file.size,
        },
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
      });
    };
    reader.onerror = () => {
      setFileReadError("Failed to read selected file.");
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processSelectedFile(file);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processSelectedFile(file);
    }
  };

  const quizAnsweredCount = Object.keys(quizProgress.answers).length;
  const quizCorrectCount = activeStudySet
    ? activeStudySet.quiz.reduce((acc, q, idx) => {
        return quizProgress.answers[idx] === q.correctIndex ? acc + 1 : acc;
      }, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Subject Organizer Bar Above the Lecture Notes Section */}
      <section
        aria-label="Organize notes by subject"
        className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 sm:px-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex flex-col md:flex-row md:items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#434655] mr-1">
            Subjects:
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            {subjects.map((subject) => {
              const isSelected = selectedSubject === subject;
              const isAllSubjects = subject === "All Subjects";
              const countInSubject = isAllSubjects
                ? savedSets.length + storedUploads.length
                : savedSets.filter(
                    (s) => s.subject.toLowerCase() === subject.toLowerCase()
                  ).length +
                  storedUploads.filter(
                    (u) => u.subject.toLowerCase() === subject.toLowerCase()
                  ).length;

              return (
                <div
                  key={subject}
                  className={`inline-flex items-center rounded-xl border transition-colors whitespace-nowrap shrink-0 overflow-hidden ${
                    isSelected
                      ? "bg-[#2563eb] border-[#2563eb] text-white"
                      : "bg-[#f8f9ff] border-slate-200 text-[#434655] hover:text-[#0b1c30] hover:border-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSubject(subject)}
                    className={`inline-flex items-center gap-1.5 py-1.5 min-h-[36px] text-xs font-semibold cursor-pointer ${
                      isAllSubjects ? "px-3" : "pl-3 pr-1.5"
                    }`}
                  >
                    <span>{subject}</span>
                    {countInSubject > 0 && (
                      <span
                        className={`font-mono tabular-nums text-[11px] ${
                          isSelected ? "text-[#dbeafe]" : "text-[#434655]"
                        }`}
                      >
                        {countInSubject}
                      </span>
                    )}
                  </button>
                  {!isAllSubjects && (
                    <button
                      type="button"
                      onClick={() => onDeleteSubject(subject)}
                      aria-label={`Delete ${subject} subject`}
                      title={`Delete ${subject}`}
                      className={`pr-2 pl-1 py-1.5 min-h-[36px] inline-flex items-center justify-center transition-colors cursor-pointer ${
                        isSelected
                          ? "text-[#dbeafe] hover:text-white"
                          : "text-slate-400 hover:text-[#ba1a1a]"
                      }`}
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}

            {isAddingSubject ? (
              <form
                onSubmit={handleCreateSubject}
                className="inline-flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  placeholder="Subject name..."
                  autoFocus
                  className="h-9 px-3 text-xs bg-white border border-[#2563eb] rounded-xl text-[#0b1c30] focus:outline-none w-36"
                />
                <button
                  type="submit"
                  className="px-3 h-9 text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl cursor-pointer"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingSubject(false);
                    setNewSubjectName("");
                  }}
                  className="px-2 h-9 text-xs font-semibold text-[#434655] hover:text-[#0b1c30] cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingSubject(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-semibold text-[#004ac6] bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>New Subject</span>
              </button>
            )}
          </div>
        </div>

        {/* Daily Study Streak Summary */}
        <div className="flex items-center gap-2.5 text-xs shrink-0 self-start md:self-auto">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#92400e] bg-[#fffbeb] border border-[#fde68a] px-3 py-1.5 rounded-xl">
            <Flame className="w-3.5 h-3.5 text-[#f59e0b]" aria-hidden="true" />
            <span className="font-mono tabular-nums">
              {studyStreak.currentStreakDays} day streak
            </span>
          </span>
          <span className="font-mono tabular-nums text-[#434655]">
            Best {studyStreak.longestStreakDays}d
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8-Column Primary Stage: Upload, Rich Lecture Notes Editor & Synthesized Guide */}
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0b1c30]">
                  Drop Your Notes. Master Anything.
                </h1>
                <p className="text-sm text-[#434655] max-w-2xl">
                  Everything you need to learn better—upload lecture files or craft rich notes with highlights and diagrams, and KnowNest turns them into clear overviews, 10–30 flashcards, and timed quizzes.
                </p>
              </div>
              {selectedSubject !== "All Subjects" && (
                <span className="text-xs font-semibold text-[#004ac6] whitespace-nowrap shrink-0">
                  Active Subject: {selectedSubject}
                </span>
              )}
            </div>

            {/* Editor Clear Action Bar (Quick samples removed; Clear editor kept) */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                disabled={!notesInput.trim() && !uploadedFile}
                onClick={() => {
                  onReplaceNotesFromSource("", "");
                  onSetUploadedFile(null);
                  setFileReadError(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-[#434655] hover:text-[#0b1c30] disabled:opacity-40 disabled:cursor-not-allowed bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Clear editor
              </button>
            </div>

            {/* Drag-and-Drop File Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-xl border border-dashed p-4 sm:p-5 transition-colors ${
                isDragging
                  ? "border-[#2563eb] bg-[#eff4ff]"
                  : "border-slate-300 bg-[#f8f9ff] hover:border-slate-400"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                onChange={handleFileChange}
                className="sr-only"
                id="notes-file-upload"
              />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 text-[#2563eb]">
                    <Upload className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[#0b1c30]">
                      Drag and drop lecture notes or choose a file
                    </p>
                    <p className="text-xs text-[#434655]">
                      Supports .txt, .md, .csv, .pdf, and note photos (.png, .jpg, .webp) up to 15 MB
                    </p>
                  </div>
                </div>
                <label
                  htmlFor="notes-file-upload"
                  className="inline-flex items-center justify-center px-4 py-2 min-h-[40px] text-xs font-semibold text-[#004ac6] bg-white hover:bg-[#eff6ff] border border-[#bfdbfe] rounded-xl cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  Browse File
                </label>
              </div>

              {uploadedFile && (
                <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-[#2563eb] shrink-0" aria-hidden="true" />
                    <span className="text-sm font-medium text-[#0b1c30] truncate">
                      {uploadedFile.name}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-[#434655] shrink-0">
                      {(uploadedFile.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetUploadedFile(null)}
                    aria-label="Remove uploaded file"
                    className="p-1.5 text-[#434655] hover:text-[#ba1a1a] rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Editable Rich-Text Lecture Notes Section */}
            <RichNotesEditor
              plainText={notesInput}
              htmlContent={notesHtml}
              syncVersion={editorSyncVersion}
              onChange={onChangeNotes}
            />

            {/* Optional Subject Assignment Control Below Notes */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {isAddingNoteSubject ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cleaned = noteSubjectDraft.trim();
                    if (!cleaned) return;
                    onAddSubjectFromNotes(cleaned);
                    setNoteSubjectDraft("");
                    setIsAddingNoteSubject(false);
                  }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    value={noteSubjectDraft}
                    onChange={(e) => setNoteSubjectDraft(e.target.value)}
                    placeholder="Enter subject name..."
                    autoFocus
                    className="h-9 px-3 text-xs bg-white border border-[#2563eb] rounded-xl text-[#0b1c30] focus:outline-none w-52"
                  />
                  <button
                    type="submit"
                    className="px-3.5 h-9 text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl transition-colors cursor-pointer"
                  >
                    Add Subject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNoteSubject(false);
                      setNoteSubjectDraft("");
                    }}
                    className="px-2.5 h-9 text-xs font-semibold text-[#434655] hover:text-[#0b1c30] cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const suggested =
                      activeStudySet?.subject &&
                      !subjects.some(
                        (s) => s.toLowerCase() === activeStudySet.subject.toLowerCase()
                      )
                        ? activeStudySet.subject
                        : "";
                    setNoteSubjectDraft(suggested);
                    setIsAddingNoteSubject(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-semibold text-[#004ac6] bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Subject</span>
                </button>
              )}
            </div>

            {/* Flashcard & Quiz Count Configuration (Min 10 - Max 30) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-[#f8f9ff] border border-slate-200/80 p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="flashcard-count-range"
                    className="font-semibold text-[#0b1c30]"
                  >
                    Flashcards to generate
                  </label>
                  <span className="font-mono tabular-nums font-bold text-[#004ac6]">
                    {flashcardCount} cards
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="flashcard-count-range"
                    type="range"
                    min={10}
                    max={30}
                    step={1}
                    value={flashcardCount}
                    onChange={(e) => onChangeFlashcardCount(Number(e.target.value))}
                    className="flex-1 accent-[#2563eb] cursor-pointer"
                  />
                  <input
                    type="number"
                    min={10}
                    max={30}
                    aria-label="Number of flashcards"
                    value={flashcardCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isNaN(val)) {
                        onChangeFlashcardCount(Math.min(30, Math.max(10, val)));
                      }
                    }}
                    className="w-16 h-8 px-2 text-center text-xs font-mono tabular-nums font-semibold bg-white border border-slate-300 rounded-lg text-[#0b1c30] focus:border-[#2563eb] focus:outline-none"
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono tabular-nums text-[#434655]">
                  <span>Min 10</span>
                  <span>Max 30</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="quiz-count-range"
                    className="font-semibold text-[#0b1c30]"
                  >
                    Quiz MCQs to generate
                  </label>
                  <span className="font-mono tabular-nums font-bold text-[#6b38d4]">
                    {quizCount} questions
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="quiz-count-range"
                    type="range"
                    min={10}
                    max={30}
                    step={1}
                    value={quizCount}
                    onChange={(e) => onChangeQuizCount(Number(e.target.value))}
                    className="flex-1 accent-[#6b38d4] cursor-pointer"
                  />
                  <input
                    type="number"
                    min={10}
                    max={30}
                    aria-label="Number of quiz questions"
                    value={quizCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isNaN(val)) {
                        onChangeQuizCount(Math.min(30, Math.max(10, val)));
                      }
                    }}
                    className="w-16 h-8 px-2 text-center text-xs font-mono tabular-nums font-semibold bg-white border border-slate-300 rounded-lg text-[#0b1c30] focus:border-[#6b38d4] focus:outline-none"
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono tabular-nums text-[#434655]">
                  <span>Min 10</span>
                  <span>Max 30</span>
                </div>
              </div>
            </div>

            {(fileReadError || generationError) && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#fff1f2] border border-[#fecdd3] text-[#9f1239] text-sm"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{fileReadError || generationError}</span>
              </div>
            )}

            {/* Primary Action Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
              <button
                type="button"
                disabled={!notesInput.trim() && !uploadedFile}
                onClick={onSaveCurrentNotesToVault}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-xs font-semibold text-[#0b1c30] bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BookmarkCheck className="w-4 h-4 text-[#006242]" aria-hidden="true" />
                <span>
                  Save to{" "}
                  {selectedSubject === "All Subjects"
                    ? "Uploads Vault"
                    : selectedSubject}
                </span>
              </button>

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isGenerating || (!notesInput.trim() && !uploadedFile)}
                  onClick={onGenerateSummaryOnly}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold text-[#004ac6] bg-[#eff6ff] hover:bg-[#dbeafe] disabled:opacity-40 disabled:cursor-not-allowed border border-[#bfdbfe] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                >
                  {generationMode === "summary" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Generating Notes & Summary...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" aria-hidden="true" />
                      <span>Generate Notes & Summary</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isGenerating || (!notesInput.trim() && !uploadedFile)}
                  onClick={onGenerateStudySet}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.22)] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                >
                  {generationMode === "full" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Generating {flashcardCount} Cards & {quizCount} MCQs...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate {flashcardCount} Cards & {quizCount} MCQs</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Synthesized Study Guide Section */}
          {activeStudySet ? (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#434655]">
                    <span className="text-[#004ac6] font-semibold">
                      {activeStudySet.subject}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {activeStudySet.flashcards.length} Flashcards
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {activeStudySet.quiz.length} Questions
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#0b1c30]">
                    {activeStudySet.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => exportStudySetToPdf(activeStudySet)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-semibold text-[#0b1c30] bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Export PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateMode("flashcards")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-semibold text-[#004ac6] bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Study Flashcards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateMode("quiz")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-semibold text-white bg-[#6b38d4] hover:bg-[#5516be] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Take Quiz</span>
                  </button>
                </div>
              </div>

              {activeStudySet.summary && (
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[#0b1c30]">
                    Summary
                  </h3>
                  <p className="text-sm leading-relaxed text-[#434655]">
                    {activeStudySet.summary}
                  </p>
                </div>
              )}

              {activeStudySet.keyConcepts.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-[#0b1c30]">
                    Key Concepts Extracted
                  </h3>
                  <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
                    {activeStudySet.keyConcepts.map((concept, idx) => (
                      <div
                        key={`${concept.heading}-${idx}`}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-4"
                      >
                        <div className="sm:w-56 shrink-0 flex items-baseline gap-2">
                          <span className="font-mono tabular-nums text-xs font-semibold text-[#004ac6]">
                            {String(idx + 1).padStart(2, "0")}.
                          </span>
                          <span className="text-sm font-semibold text-[#0b1c30]">
                            {concept.heading}
                          </span>
                        </div>
                        <p className="text-sm text-[#434655] leading-relaxed">
                          {concept.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : isGenerating ? (
            <section className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-2.5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)]">
              <div className="w-10 h-10 rounded-xl bg-[#eff4ff] text-[#2563eb] mx-auto flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              </div>
              <h2 className="text-base font-bold text-[#0b1c30]">
                Updating Notes & Summary...
              </h2>
              <p className="text-sm text-[#434655] max-w-md mx-auto">
                {generationMode === "summary"
                  ? "Refining your lecture notes and generating an updated summary and key concepts."
                  : "Extracting your document into the lecture notes editor and generating its summary, flashcards, and quiz questions."}
              </p>
            </section>
          ) : (
            <section className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-2 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)]">
              <div className="w-10 h-10 rounded-xl bg-[#eff4ff] text-[#2563eb] mx-auto flex items-center justify-center">
                <BookOpen className="w-5 h-5" aria-hidden="true" />
              </div>
              <h2 className="text-base font-bold text-[#0b1c30]">
                Ready to build your study deck
              </h2>
              <p className="text-sm text-[#434655] max-w-md mx-auto">
                Write formatted notes or upload a file above to automatically update your notes and summary.
              </p>
            </section>
          )}
        </div>

        {/* Right 4-Column Study Telemetry, Previous Uploads Vault & Subject Sets Rail */}
        <aside className="lg:col-span-4 space-y-6">
          {/* Session Telemetry Card */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#0b1c30]">Session Status</h2>
              <span className="text-xs font-mono tabular-nums font-semibold text-[#92400e]">
                {studyStreak.actionsToday} actions today
              </span>
            </div>

            {activeStudySet ? (
              <>
                <MasteryMeter flashcards={activeStudySet.flashcards} />

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#434655]">
                      Quiz Score
                    </p>
                    <p className="text-xs text-[#434655]">
                      {quizAnsweredCount} of {activeStudySet.quiz.length} answered
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold font-mono tabular-nums text-[#0b1c30]">
                      {quizAnsweredCount > 0
                        ? `${quizCorrectCount}/${activeStudySet.quiz.length}`
                        : `--/${activeStudySet.quiz.length}`}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-[#434655]">
                Generate a study set to track flashcard mastery and quiz accuracy here.
              </p>
            )}
          </section>

          {/* Previously Uploaded Files & Saved Notes Vault */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#0b1c30]">
                Previous Uploads
              </h2>
              <span className="text-xs font-mono tabular-nums font-semibold text-[#434655]">
                {filteredUploads.length}
              </span>
            </div>

            {filteredUploads.length === 0 ? (
              <p className="text-sm text-[#434655] py-2">
                {selectedSubject === "All Subjects"
                  ? "Uploaded files and saved notes appear here so you can reuse them anytime."
                  : `No saved uploads under ${selectedSubject} yet.`}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
                {filteredUploads.map((record) => (
                  <li
                    key={record.id}
                    className="py-2.5 flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => onReuseStoredUpload(record)}
                      className="text-left min-w-0 flex-1 rounded-lg px-2 py-1.5 hover:bg-[#eff4ff] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FolderOpen
                          className="w-3.5 h-3.5 text-[#2563eb] shrink-0"
                          aria-hidden="true"
                        />
                        <p className="text-sm font-semibold text-[#0b1c30] truncate">
                          {record.name}
                        </p>
                      </div>
                      <p className="text-xs text-[#434655] truncate pl-5">
                        {record.subject} ·{" "}
                        {new Date(record.uploadedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteStoredUpload(record.id)}
                      aria-label={`Delete ${record.name}`}
                      className="p-2 text-slate-400 hover:text-[#ba1a1a] hover:bg-rose-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Saved Study Sets Rail (Filtered by Subject) */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#0b1c30]">
                Study Sets
              </h2>
              <span className="text-xs font-mono tabular-nums font-semibold text-[#434655]">
                {filteredSavedSets.length}
              </span>
            </div>

            {filteredSavedSets.length === 0 ? (
              <p className="text-sm text-[#434655] py-2">
                {selectedSubject === "All Subjects"
                  ? "Generated study sets are saved automatically for quick switching."
                  : `No generated study sets under ${selectedSubject} yet.`}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
                {filteredSavedSets.map((set) => {
                  const isSelected = activeStudySet?.id === set.id;
                  const mastered = set.flashcards.filter(
                    (c) => c.mastery === "mastered"
                  ).length;

                  return (
                    <li
                      key={set.id}
                      className="py-2.5 flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSavedSet(set.id)}
                        className={`text-left min-w-0 flex-1 rounded-lg px-2 py-1.5 transition-colors cursor-pointer ${
                          isSelected ? "bg-[#eff4ff]" : "hover:bg-slate-50"
                        }`}
                      >
                        <p
                          className={`text-sm font-semibold truncate ${
                            isSelected ? "text-[#004ac6]" : "text-[#0b1c30]"
                          }`}
                        >
                          {set.title}
                        </p>
                        <p className="text-xs text-[#434655] truncate">
                          {set.subject} ·{" "}
                          <span className="font-mono tabular-nums">
                            {mastered}/{set.flashcards.length} mastered
                          </span>
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSavedSet(set.id)}
                        aria-label={`Delete ${set.title}`}
                        className="p-2 text-slate-400 hover:text-[#ba1a1a] hover:bg-rose-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
