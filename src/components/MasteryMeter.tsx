import { Flashcard } from "../types/study";

interface MasteryMeterProps {
  flashcards: Flashcard[];
  compact?: boolean;
}

/**
 * MasteryMeter renders a segmented progress bar paired with explicit
 * tabular numeric labels so mastery status is never conveyed by color alone.
 */
export function MasteryMeter({ flashcards, compact = false }: MasteryMeterProps) {
  const total = flashcards.length || 1;
  const masteredCount = flashcards.filter((c) => c.mastery === "mastered").length;
  const reviewingCount = flashcards.filter((c) => c.mastery === "reviewing").length;
  const needsReviewCount = flashcards.filter((c) => c.mastery === "needs_review").length;
  const newCount = flashcards.filter((c) => c.mastery === "new").length;

  const masteredPct = (masteredCount / total) * 100;
  const reviewingPct = (reviewingCount / total) * 100;
  const needsReviewPct = (needsReviewCount / total) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold text-[#434655]">
        <span>Deck Mastery</span>
        <span className="font-mono tabular-nums text-[#0b1c30]">
          {masteredCount} / {flashcards.length} Mastered
        </span>
      </div>

      {/* Segmented Bar Rail */}
      <div
        className="w-full h-2.5 bg-[#eff4ff] rounded-full overflow-hidden flex"
        role="img"
        aria-label={`Mastery progress: ${masteredCount} mastered, ${reviewingCount} reviewing, ${needsReviewCount} needs review, ${newCount} unseen`}
      >
        {masteredPct > 0 && (
          <div
            style={{ width: `${masteredPct}%` }}
            className="h-full bg-[#10b981] transition-all duration-300"
          />
        )}
        {reviewingPct > 0 && (
          <div
            style={{ width: `${reviewingPct}%` }}
            className="h-full bg-[#f59e0b] transition-all duration-300"
          />
        )}
        {needsReviewPct > 0 && (
          <div
            style={{ width: `${needsReviewPct}%` }}
            className="h-full bg-[#f43f5e] transition-all duration-300"
          />
        )}
      </div>

      {/* Explicit Text Legend (Tabular Numerals) */}
      {!compact && (
        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#ecfdf5] text-[#005236]">
            <span className="font-medium">Mastered</span>
            <span className="font-mono tabular-nums font-semibold">{masteredCount}</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#fffbeb] text-[#92400e]">
            <span className="font-medium">Reviewing</span>
            <span className="font-mono tabular-nums font-semibold">{reviewingCount}</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#fff1f2] text-[#9f1239]">
            <span className="font-medium">Needs Review</span>
            <span className="font-mono tabular-nums font-semibold">{needsReviewCount}</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#eff4ff] text-[#434655]">
            <span className="font-medium">Unseen</span>
            <span className="font-mono tabular-nums font-semibold">{newCount}</span>
          </div>
        </div>
      )}
    </div>
  );
}
