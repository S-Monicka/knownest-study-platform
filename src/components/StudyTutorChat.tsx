import React, { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  X,
  Send,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { ChatMessage, StudySet } from "../types/study";

interface StudyTutorChatProps {
  activeStudySet: StudySet | null;
  messages: ChatMessage[];
  onSendMessage: (text: string, fastMode: boolean) => Promise<void>;
  onClearChat: () => void;
  isSending: boolean;
  chatError: string | null;
  isOpen: boolean;
  onSetOpen: (open: boolean) => void;
}

const STARTER_PROMPTS = [
  "Summarize the hardest concepts simply",
  "Give me memory hooks for these flashcards",
  "Create a real-world analogy for this topic",
];

/**
 * StudyTutorChat provides a persistent multi-turn Gemini study assistant drawer.
 * State logic:
 * - `isOpen` controls whether the chat panel is expanded or collapsed to a compact launcher button.
 * - `draft` holds the controlled textarea/input value before submission.
 * - `fastMode` lets the learner switch between `gemini-4-hydrogen` (Standard) and
 *   `gemini-3.1-flash-lite` (Fast) on the backend.
 * - `messages` is lifted to App.tsx and keyed by activeStudySet.id so conversation
 *   history stays intact when switching between Notes, Flashcards, and Quiz modes.
 */
export function StudyTutorChat({
  activeStudySet,
  messages,
  onSendMessage,
  onClearChat,
  isSending,
  chatError,
  isOpen,
  onSetOpen,
}: StudyTutorChatProps) {
  const [draft, setDraft] = useState("");
  const [fastMode, setFastMode] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the conversation thread whenever a new message arrives or panel opens.
  useEffect(() => {
    if (isOpen) {
      scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isSending, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSending) return;
    setDraft("");
    await onSendMessage(trimmed, fastMode);
  };

  return (
    <>
      {/* Collapsed Floating Launcher (Positioned cleanly above mobile bottom bar) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => onSetOpen(true)}
          aria-label="Open Study Tutor chat"
          className="fixed bottom-18 right-4 md:bottom-6 md:right-6 z-40 inline-flex items-center gap-2 px-4 py-3 min-h-[44px] text-sm font-semibold text-white bg-[#0b1c30] hover:bg-[#213145] rounded-2xl shadow-[0_12px_24px_-6px_rgba(11,28,48,0.3)] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
        >
          <MessageSquare className="w-4 h-4" aria-hidden="true" />
          <span>Study Tutor</span>
          {messages.length > 0 && (
            <span className="font-mono tabular-nums text-xs text-[#b4c5ff]">
              ({messages.length})
            </span>
          )}
        </button>
      )}

      {/* Expanded Multi-Turn Chat Drawer */}
      {isOpen && (
        <section
          aria-label="Study Tutor conversation"
          className="fixed bottom-16 right-3 left-3 sm:left-auto sm:right-6 md:bottom-6 z-40 sm:w-[400px] h-[min(540px,calc(100vh-7rem))] bg-white border border-slate-200 rounded-2xl shadow-[0_20px_25px_-5px_rgba(15,23,42,0.12),0_8px_10px_-6px_rgba(15,23,42,0.06)] flex flex-col overflow-hidden"
        >
          {/* Chat Header */}
          <div className="px-4 py-3 border-b border-slate-200 bg-[#f8f9ff] flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#0b1c30] truncate">
                Study Tutor
              </h2>
              <p className="text-xs text-[#434655] truncate">
                {activeStudySet
                  ? `${activeStudySet.subject} · ${activeStudySet.title}`
                  : "General Study Support"}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setFastMode((prev) => !prev)}
                title={
                  fastMode
                    ? "Using fast lightweight responses"
                    : "Using standard tutor responses"
                }
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  fastMode
                    ? "bg-[#eff6ff] border-[#bfdbfe] text-[#004ac6]"
                    : "bg-white border-slate-200 text-[#434655] hover:text-[#0b1c30]"
                }`}
              >
                {fastMode ? "Fast" : "Standard"}
              </button>

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={onClearChat}
                  aria-label="Clear chat history"
                  title="Clear conversation"
                  className="p-2 text-[#434655] hover:text-[#ba1a1a] hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onSetOpen(false)}
                aria-label="Close Study Tutor chat"
                className="p-2 text-[#434655] hover:text-[#0b1c30] hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Message Thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
            {messages.length === 0 ? (
              <div className="space-y-4 py-2">
                <p className="text-sm text-[#434655] leading-relaxed">
                  {activeStudySet
                    ? `Ask me anything about "${activeStudySet.title}". I can explain tough mechanisms, test your understanding, or share mnemonics.`
                    : "Upload or generate a study set, or ask me any study question to get started."}
                </p>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#434655]">
                    Suggested prompts
                  </p>
                  <div className="flex flex-col gap-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={isSending}
                        onClick={() => void onSendMessage(prompt, fastMode)}
                        className="text-left px-3 py-2 text-xs font-medium text-[#004ac6] bg-[#eff4ff] hover:bg-[#dbeafe] border border-[#bfdbfe]/60 rounded-xl transition-colors cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? "bg-[#2563eb] text-white"
                          : "bg-[#f8f9ff] border border-slate-200 text-[#0b1c30]"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}

            {isSending && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-medium bg-[#f8f9ff] border border-slate-200 text-[#434655]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563eb]" aria-hidden="true" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}

            {chatError && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-xl bg-[#fff1f2] border border-[#fecdd3] text-[#9f1239] text-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{chatError}</span>
              </div>
            )}

            <div ref={scrollAnchorRef} />
          </div>

          {/* Composer Footer */}
          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-slate-200 bg-[#f8f9ff] flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a follow-up question..."
              aria-label="Ask Study Tutor a question"
              className="flex-1 min-w-0 h-10 px-3.5 text-sm bg-white border border-slate-300 rounded-xl text-[#0b1c30] placeholder:text-slate-400 focus:border-[#2563eb] focus:outline-none focus:ring-3 focus:ring-[#2563eb]/15"
            />
            <button
              type="submit"
              disabled={isSending || !draft.trim()}
              aria-label="Send message"
              className="h-10 w-10 inline-flex items-center justify-center bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
