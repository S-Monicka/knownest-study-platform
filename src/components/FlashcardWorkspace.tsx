import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Shuffle,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Download,
} from "lucide-react";
import { exportStudySetToPdf } from "../utils/exportStudyPdf";
import {
  CardMastery,
  Flashcard,
  FlashcardFilter,
  StudyMode,
  StudySet,
} from "../types/study";
import { MasteryMeter } from "./MasteryMeter";

interface FlashcardWorkspaceProps {
  studySet: StudySet | null;
  onUpdateCardMastery: (cardId: string, mastery: CardMastery) => void;
  onResetDeckMastery: () => void;
  onShuffleDeck: () => void;
  onNavigateMode: (mode: StudyMode) => void;
}

const MASTERY_LABEL: Record<CardMastery, string> = {
  new: "New",
  needs_review: "Needs Review",
  reviewing: "Reviewing",
  mastered: "Mastered",
};

const MASTERY_TEXT_COLOR: Record<CardMastery, string> = {
  new: "text-[#434655]",
  needs_review: "text-[#9f1239]",
  reviewing: "text-[#92400e]",
  mastered: "text-[#005236]",
};

/**
 * FlashcardWorkspace handles Mode 2 (Flashcard Section):
 * - Manages local card presentation state:
 *   1) filter: active deck filter ('all' | 'needs_review' | 'mastered')
 *   2) currentIndex: index within the filteredCards array
 *   3) isFlipped: controls 3D CSS rotateY(180deg) flip on click
 *   4) showHint: toggles the 1-line memory cue on the front face
 */
export function FlashcardWorkspace({
  studySet,
  onUpdateCardMastery,
  onResetDeckMastery,
  onShuffleDeck,
  onNavigateMode,
}: FlashcardWorkspaceProps) {
  const [filter, setFilter] = useState<FlashcardFilter>("all");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Derive the visible deck based on the selected filter tab.
  const filteredCards: Flashcard[] = useMemo(() => {
    if (!studySet) return [];
    if (filter === "needs_review") {
      return studySet.flashcards.filter(
        (c) => c.mastery === "needs_review" || c.mastery === "reviewing"
      );
    }
    if (filter === "mastered") {
      return studySet.flashcards.filter((c) => c.mastery === "mastered");
    }
    return studySet.flashcards;
  }, [studySet, filter]);

  // Clamp currentIndex whenever the study set changes or a filter shrinks the deck.
  const safeIndex =
    filteredCards.length > 0 ? Math.min(currentIndex, filteredCards.length - 1) : 0;
  const activeCard = filteredCards[safeIndex] ?? null;

  // Reset flip & hint state whenever the active study set changes.
  useEffect(() => {
    setFilter("all");
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
  }, [studySet?.id]);

  // Advance or retreat through the filtered deck while resetting the card face to front.
  const goToIndex = (nextIdx: number) => {
    if (filteredCards.length === 0) return;
    const bounded = (nextIdx + filteredCards.length) % filteredCards.length;
    setCurrentIndex(bounded);
    setIsFlipped(false);
    setShowHint(false);
  };

  // Grade the current card's mastery, persist to parent state, and advance smoothly.
  const handleGradeCard = (mastery: CardMastery) => {
    if (!activeCard) return;
    onUpdateCardMastery(activeCard.id, mastery);
    setIsFlipped(false);
    setShowHint(false);

    // If grading removes the card from the current filter, keep safeIndex in bounds;
    // otherwise advance to the next card in the sequence.
    if (filteredCards.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % filteredCards.length);
    }
  };

  // Keyboard shortcuts for fast desktop study:
  // Space / Enter -> Flip card | Left / Right -> Navigate | 1-4 -> Grade mastery
  useEffect(() => {
    if (!activeCard) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToIndex(safeIndex + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToIndex(safeIndex - 1);
      } else if (isFlipped && e.key === "1") {
        handleGradeCard("needs_review");
      } else if (isFlipped && e.key === "2") {
        handleGradeCard("reviewing");
      } else if (isFlipped && e.key === "3") {
        handleGradeCard("mastered");
      } else if (isFlipped && e.key === "4") {
        handleGradeCard("mastered");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!studySet || studySet.flashcards.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#eff4ff] text-[#2563eb] mx-auto flex items-center justify-center">
          <BookOpen className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0b1c30]">
          No flashcard deck generated yet
        </h1>
        <p className="text-sm text-[#434655] max-w-md mx-auto">
          Upload or paste your lecture notes in the Notes section to synthesize 10 interactive flashcards.
        </p>
        <button
          type="button"
          onClick={() => onNavigateMode("notes")}
          className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.22)] transition-colors cursor-pointer"
        >
          Go to Notes
        </button>
      </div>
    );
  }

  const needsReviewCount = studySet.flashcards.filter(
    (c) => c.mastery === "needs_review" || c.mastery === "reviewing"
  ).length;
  const masteredCount = studySet.flashcards.filter(
    (c) => c.mastery === "mastered"
  ).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 8-Column Interactive Flashcard Stage */}
      <div className="lg:col-span-8 space-y-5">
        {/* Deck Toolbar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#434655] truncate">
              {studySet.subject} · {studySet.title}
            </p>
            <h1 className="text-lg sm:text-xl font-bold text-[#0b1c30]">
              Flashcard Deck
            </h1>
          </div>

          {/* Filter & Deck Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#eff4ff] rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setCurrentIndex(0);
                  setIsFlipped(false);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === "all"
                    ? "bg-white text-[#0b1c30] shadow-xs"
                    : "text-[#434655] hover:text-[#0b1c30]"
                }`}
              >
                All ({studySet.flashcards.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilter("needs_review");
                  setCurrentIndex(0);
                  setIsFlipped(false);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === "needs_review"
                    ? "bg-white text-[#0b1c30] shadow-xs"
                    : "text-[#434655] hover:text-[#0b1c30]"
                }`}
              >
                Review ({needsReviewCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilter("mastered");
                  setCurrentIndex(0);
                  setIsFlipped(false);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === "mastered"
                    ? "bg-white text-[#0b1c30] shadow-xs"
                    : "text-[#434655] hover:text-[#0b1c30]"
                }`}
              >
                Mastered ({masteredCount})
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onShuffleDeck();
                setCurrentIndex(0);
                setIsFlipped(false);
                setShowHint(false);
              }}
              aria-label="Shuffle flashcards"
              title="Shuffle deck"
              className="p-2.5 min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-[#434655] hover:text-[#0b1c30] bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                onResetDeckMastery();
                setFilter("all");
                setCurrentIndex(0);
                setIsFlipped(false);
                setShowHint(false);
              }}
              aria-label="Reset deck mastery"
              title="Reset progress"
              className="p-2.5 min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-[#434655] hover:text-[#0b1c30] bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => exportStudySetToPdf(studySet)}
              aria-label="Export summary and flashcards as PDF"
              title="Export PDF"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-semibold text-[#0b1c30] bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {/* Interactive 3D Flip Card */}
        {activeCard ? (
          <div className="space-y-4">
            <div className="card-perspective">
              <div
                role="button"
                tabIndex={0}
                aria-pressed={isFlipped}
                aria-label={
                  isFlipped
                    ? `Flashcard back: ${activeCard.definition}. Click to show term.`
                    : `Flashcard front: ${activeCard.term}. Click to reveal definition.`
                }
                onClick={() => setIsFlipped((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsFlipped((prev) => !prev);
                  }
                }}
                className={`card-preserve-3d relative w-full min-h-[320px] sm:min-h-[360px] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb] rounded-3xl ${
                  isFlipped ? "card-flipped" : ""
                }`}
              >
                {/* FRONT FACE (Term / Prompt) */}
                <div className="card-face absolute inset-0 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] hover:shadow-[0_10px_15px_-3px_rgba(37,99,235,0.06),0_4px_6px_-4px_rgba(15,23,42,0.04)] transition-shadow flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-[#434655] truncate">
                      {activeCard.topic} ·{" "}
                      <span className={MASTERY_TEXT_COLOR[activeCard.mastery]}>
                        {MASTERY_LABEL[activeCard.mastery]}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-[#434655] shrink-0">
                      {String(safeIndex + 1).padStart(2, "0")} /{" "}
                      {String(filteredCards.length).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="my-auto py-6 text-center space-y-4">
                    <p className="text-xs font-semibold text-[#004ac6]">Term</p>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0b1c30] max-w-xl mx-auto leading-snug">
                      {activeCard.term}
                    </h2>

                    {showHint && (
                      <p className="text-sm text-[#434655] bg-[#eff4ff] rounded-xl px-4 py-2.5 max-w-md mx-auto">
                        Hint: {activeCard.hint}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowHint((prev) => !prev);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-semibold text-[#434655] hover:text-[#004ac6] hover:bg-[#eff4ff] rounded-lg transition-colors cursor-pointer"
                    >
                      <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{showHint ? "Hide Hint" : "Show Hint"}</span>
                    </button>

                    <span className="text-xs font-medium text-[#434655]">
                      Click card to flip
                    </span>
                  </div>
                </div>

                {/* BACK FACE (Definition / Explanation) */}
                <div className="card-face card-face-back absolute inset-0 bg-[#f8f9ff] border border-[#bfdbfe] rounded-3xl p-6 sm:p-8 shadow-[0_10px_15px_-3px_rgba(37,99,235,0.06),0_4px_6px_-4px_rgba(15,23,42,0.04)] flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-[#004ac6] truncate">
                      {activeCard.term}
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-[#434655] shrink-0">
                      {String(safeIndex + 1).padStart(2, "0")} /{" "}
                      {String(filteredCards.length).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="my-auto py-6 text-center space-y-3">
                    <p className="text-xs font-semibold text-[#006242]">Answer</p>
                    <p className="text-lg sm:text-xl font-medium text-[#0b1c30] max-w-xl mx-auto leading-relaxed">
                      {activeCard.definition}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/70 text-xs text-[#434655]">
                    <span>Rate recall below or click to flip back</span>
                    <span className="font-medium text-[#004ac6]">Front</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Spaced-Repetition Quick-Grade Controls */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-3">
              <div className="flex items-center justify-between text-xs text-[#434655]">
                <span className="font-semibold">Rate your recall</span>
                <span className="hidden sm:inline">
                  Space to flip · Arrows to navigate
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleGradeCard("needs_review")}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-[#9f1239] bg-[#fff1f2] hover:bg-[#ffe4e6] border border-[#fecdd3] rounded-xl transition-colors cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Again</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGradeCard("reviewing")}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-[#92400e] bg-[#fffbeb] hover:bg-[#fef3c7] border border-[#fde68a] rounded-xl transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Hard</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGradeCard("mastered")}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-[#004ac6] bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] rounded-xl transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Good</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGradeCard("mastered")}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-[#005236] bg-[#ecfdf5] hover:bg-[#d1fae5] border border-[#a7f3d0] rounded-xl transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Easy</span>
                </button>
              </div>
            </div>

            {/* Previous / Next Navigation Bar */}
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => goToIndex(safeIndex - 1)}
                disabled={filteredCards.length <= 1}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold text-[#0b1c30] bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                <span>Previous</span>
              </button>

              <span className="text-sm font-mono tabular-nums font-semibold text-[#434655]">
                Card {safeIndex + 1} of {filteredCards.length}
              </span>

              <button
                type="button"
                onClick={() => goToIndex(safeIndex + 1)}
                disabled={filteredCards.length <= 1}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold text-[#0b1c30] bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)]">
            <h2 className="text-lg font-bold text-[#0b1c30]">
              No cards match this filter
            </h2>
            <p className="text-sm text-[#434655]">
              {filter === "needs_review"
                ? "Great work — you have no cards flagged for review right now."
                : "Flip cards and rate them Good or Easy to build your mastered list."}
            </p>
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setCurrentIndex(0);
              }}
              className="px-4 py-2 min-h-[40px] text-sm font-semibold text-[#004ac6] bg-[#eff6ff] hover:bg-[#dbeafe] rounded-xl transition-colors cursor-pointer"
            >
              Show All Cards
            </button>
          </div>
        )}
      </div>

      {/* Right 4-Column Mastery Meter & Card Queue Rail */}
      <aside className="lg:col-span-4 space-y-6">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)]">
          <MasteryMeter flashcards={studySet.flashcards} />
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-[#0b1c30]">Deck Queue</h2>
            <span className="text-xs font-mono tabular-nums font-semibold text-[#434655]">
              {filteredCards.length} cards
            </span>
          </div>

          <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto pr-1">
            {filteredCards.map((card, idx) => {
              const isCurrent = activeCard?.id === card.id;
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setIsFlipped(false);
                      setShowHint(false);
                    }}
                    className={`w-full text-left py-2.5 px-2.5 rounded-xl flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                      isCurrent ? "bg-[#eff4ff]" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold truncate ${
                          isCurrent ? "text-[#004ac6]" : "text-[#0b1c30]"
                        }`}
                      >
                        <span className="font-mono tabular-nums text-xs mr-1.5 text-[#434655]">
                          {String(idx + 1).padStart(2, "0")}.
                        </span>
                        {card.term}
                      </p>
                      <p className="text-xs text-[#434655] truncate">
                        {card.topic}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                        MASTERY_TEXT_COLOR[card.mastery]
                      }`}
                    >
                      {MASTERY_LABEL[card.mastery]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </aside>
    </div>
  );
}
