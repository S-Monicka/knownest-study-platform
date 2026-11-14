import { useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Layers,
  BookOpen,
  Award,
  Clock,
  Pause,
  Play,
  Flame,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import {
  QuizProgressState,
  StudyMode,
  StudySet,
  StudyStreakState,
} from "../types/study";

interface QuizWorkspaceProps {
  studySet: StudySet | null;
  quizProgress: QuizProgressState;
  studyStreak: StudyStreakState;
  onSelectOption: (questionIndex: number, optionIndex: number) => void;
  onGoToQuestion: (questionIndex: number) => void;
  onTogglePauseTimer: () => void;
  onCompleteQuiz: () => void;
  onRetakeQuiz: () => void;
  onNavigateMode: (mode: StudyMode) => void;
  onAskTutorAboutConcept: (concept: string, missedQuestions: string[]) => void;
}

type QuizSubTab = "quiz" | "knowledge_gaps";

interface ConceptQuestionDetail {
  index: number;
  question: string;
  chosenText: string;
  correctText: string;
  explanation: string;
  isCorrect: boolean;
  timeSeconds: number;
  isSlow: boolean;
}

interface ConceptGapAnalysis {
  concept: string;
  totalAnswered: number;
  missedCount: number;
  slowCorrectCount: number;
  avgTimeSeconds: number;
  struggleScore: number;
  severity: "Critical Gap" | "Concept Gap" | "Slow Recall";
  items: ConceptQuestionDetail[];
}

const OPTION_LETTERS = ["A", "B", "C", "D"];

/**
 * Formats seconds as MM:SS in fixed two-digit width for tabular timer alignment.
 */
function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * QuizWorkspace handles Mode 3 (Quiz Section) with two sub-tabs:
 * 1) `Quiz`: 10–30 MCQ assessment with live MM:SS timer, per-question timing,
 *    immediate feedback, and full score breakdown.
 * 2) `Knowledge Gaps`: Ranks the specific concepts the learner is struggling with
 *    most by combining quiz accuracy (missed answers) and question response timing
 *    (slow recall compared to overall average pace).
 */
export function QuizWorkspace({
  studySet,
  quizProgress,
  studyStreak,
  onSelectOption,
  onGoToQuestion,
  onTogglePauseTimer,
  onCompleteQuiz,
  onRetakeQuiz,
  onNavigateMode,
  onAskTutorAboutConcept,
}: QuizWorkspaceProps) {
  const [activeSubTab, setActiveSubTab] = useState<QuizSubTab>("quiz");

  const totalQuestions = studySet?.quiz.length ?? 0;
  const {
    currentIndex,
    answers,
    questionTimesMs,
    elapsedSeconds,
    isPaused,
    isCompleted,
  } = quizProgress;

  const answeredIndices = Object.keys(answers).map(Number);
  const answeredCount = answeredIndices.length;

  const correctCount = studySet
    ? studySet.quiz.reduce((acc, q, idx) => {
        return answers[idx] === q.correctIndex ? acc + 1 : acc;
      }, 0)
    : 0;

  const accuracyPct =
    answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const finalPct =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Compute overall average seconds per answered question.
  const recordedTimes = Object.values(questionTimesMs || {});
  const avgSeconds =
    answeredCount > 0
      ? recordedTimes.length > 0
        ? recordedTimes.reduce((sum, ms) => sum + ms, 0) /
          recordedTimes.length /
          1000
        : elapsedSeconds / answeredCount
      : 0;

  // Build ranked Knowledge Gaps analysis combining accuracy + response time per concept.
  const knowledgeGaps: ConceptGapAnalysis[] = useMemo(() => {
    if (!studySet || answeredCount === 0) return [];

    const slowThresholdSec = Math.max(10, avgSeconds * 1.35);
    const grouped = new Map<string, ConceptQuestionDetail[]>();

    answeredIndices.forEach((idx) => {
      const q = studySet.quiz[idx];
      if (!q) return;
      const conceptLabel = q.topic?.trim() || studySet.subject;
      const chosenIdx = answers[idx];
      const isCorrect = chosenIdx === q.correctIndex;
      const rawMs = questionTimesMs?.[idx];
      const timeSeconds =
        rawMs !== undefined ? rawMs / 1000 : avgSeconds;
      const isSlow = timeSeconds >= slowThresholdSec;

      const detail: ConceptQuestionDetail = {
        index: idx,
        question: q.question,
        chosenText:
          chosenIdx !== undefined
            ? `${OPTION_LETTERS[chosenIdx]}. ${q.options[chosenIdx]}`
            : "",
        correctText: `${OPTION_LETTERS[q.correctIndex]}. ${q.options[q.correctIndex]}`,
        explanation: q.explanation,
        isCorrect,
        timeSeconds,
        isSlow,
      };

      const existing = grouped.get(conceptLabel) ?? [];
      existing.push(detail);
      grouped.set(conceptLabel, existing);
    });

    const analyzed: ConceptGapAnalysis[] = [];
    grouped.forEach((items, concept) => {
      const missedCount = items.filter((item) => !item.isCorrect).length;
      const slowCorrectCount = items.filter(
        (item) => item.isCorrect && item.isSlow
      ).length;
      const avgTopicSeconds =
        items.reduce((sum, item) => sum + item.timeSeconds, 0) / items.length;

      // Only flag concepts where the user missed at least one question OR showed hesitant/slow recall.
      if (missedCount === 0 && slowCorrectCount === 0) {
        return;
      }

      const struggleScore =
        missedCount * 3 +
        slowCorrectCount * 1.5 +
        (avgTopicSeconds > avgSeconds * 1.2 ? 0.5 : 0);

      let severity: ConceptGapAnalysis["severity"] = "Slow Recall";
      if (missedCount > 0 && avgTopicSeconds >= slowThresholdSec) {
        severity = "Critical Gap";
      } else if (missedCount > 0) {
        severity = "Concept Gap";
      }

      analyzed.push({
        concept,
        totalAnswered: items.length,
        missedCount,
        slowCorrectCount,
        avgTimeSeconds: avgTopicSeconds,
        struggleScore,
        severity,
        items: items.sort((a, b) => Number(a.isCorrect) - Number(b.isCorrect) || b.timeSeconds - a.timeSeconds),
      });
    });

    return analyzed.sort((a, b) => b.struggleScore - a.struggleScore);
  }, [studySet, answers, questionTimesMs, answeredCount, avgSeconds]);

  if (!studySet || studySet.quiz.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#eff4ff] text-[#2563eb] mx-auto flex items-center justify-center">
          <BookOpen className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0b1c30]">
          No quiz questions generated yet
        </h1>
        <p className="text-sm text-[#434655] max-w-md mx-auto">
          Upload or paste your lecture notes in the Notes section to create a scored quiz.
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

  const safeIndex = Math.min(Math.max(currentIndex, 0), totalQuestions - 1);
  const currentQuestion = studySet.quiz[safeIndex];
  const selectedOption = answers[safeIndex];
  const hasAnsweredCurrent = selectedOption !== undefined;

  // Live Consecutive Streak & Best Quiz Streak
  let currentStreak = 0;
  let bestQuizStreak = 0;
  for (let i = 0; i < totalQuestions; i++) {
    if (answers[i] === undefined) continue;
    if (answers[i] === studySet.quiz[i].correctIndex) {
      currentStreak += 1;
      if (currentStreak > bestQuizStreak) bestQuizStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const getScoreStanding = (pct: number) => {
    if (pct >= 80) return "Strong Mastery";
    if (pct >= 60) return "Good Progress";
    return "Needs Review";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 8-Column Quiz & Knowledge Gaps Stage */}
      <div className="lg:col-span-8 space-y-5">
        {/* Quiz Mode Sub-Tab Switcher: Quiz | Knowledge Gaps */}
        <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#eff4ff] rounded-xl">
            <button
              type="button"
              onClick={() => setActiveSubTab("quiz")}
              className={`px-4 py-2 min-h-[38px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === "quiz"
                  ? "bg-white text-[#0b1c30] shadow-xs"
                  : "text-[#434655] hover:text-[#0b1c30]"
              }`}
            >
              Quiz ({totalQuestions})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("knowledge_gaps")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 min-h-[38px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === "knowledge_gaps"
                  ? "bg-white text-[#0b1c30] shadow-xs"
                  : "text-[#434655] hover:text-[#0b1c30]"
              }`}
            >
              <span>Knowledge Gaps</span>
              {knowledgeGaps.length > 0 && (
                <span className="font-mono tabular-nums text-[11px] font-bold text-[#ba1a1a]">
                  ({knowledgeGaps.length})
                </span>
              )}
            </button>
          </div>

          <span className="hidden sm:inline text-xs text-[#434655] pr-2 truncate">
            {studySet.subject} · {studySet.title}
          </span>
        </div>

        {activeSubTab === "knowledge_gaps" ? (
          /* KNOWLEDGE GAPS ANALYTICS TAB */
          <div className="space-y-5">
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <h1 className="text-xl sm:text-2xl font-bold text-[#0b1c30]">
                    Knowledge Gaps
                  </h1>
                  <p className="text-sm text-[#434655]">
                    Ranks the concepts you are struggling with most using missed answers and slow question response times.
                  </p>
                </div>
                {answeredCount > 0 && (
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-xs font-semibold text-[#434655]">
                      Baseline Pace
                    </p>
                    <p className="text-lg font-extrabold font-mono tabular-nums text-[#004ac6]">
                      {avgSeconds.toFixed(1)}s / question
                    </p>
                  </div>
                )}
              </div>

              {answeredCount === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <div className="w-11 h-11 rounded-xl bg-[#eff4ff] text-[#2563eb] mx-auto flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h2 className="text-base font-bold text-[#0b1c30]">
                    No quiz responses recorded yet
                  </h2>
                  <p className="text-sm text-[#434655] max-w-md mx-auto">
                    Answer questions in the Quiz tab so KnowNest can analyze your accuracy and response timing by concept.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab("quiz")}
                    className="inline-flex items-center justify-center px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl cursor-pointer"
                  >
                    Start Answering Quiz
                  </button>
                </div>
              ) : knowledgeGaps.length === 0 ? (
                <div className="py-8 text-center space-y-3 bg-[#ecfdf5] border border-[#a7f3d0] rounded-xl p-6">
                  <CheckCircle2
                    className="w-8 h-8 text-[#006242] mx-auto"
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-bold text-[#002113]">
                    No knowledge gaps detected across {answeredCount} answered question
                    {answeredCount === 1 ? "" : "s"}
                  </h2>
                  <p className="text-sm text-[#005236] max-w-md mx-auto">
                    Your answers are accurate and within a steady response pace. Complete any remaining questions or review flashcards to lock in mastery.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {knowledgeGaps.map((gap, rankIdx) => {
                    const isCritical = gap.severity === "Critical Gap";
                    const isConceptGap = gap.severity === "Concept Gap";

                    const severityBadgeStyle = isCritical
                      ? "bg-[#fff1f2] border-[#fecdd3] text-[#9f1239]"
                      : isConceptGap
                        ? "bg-[#fff1f2] border-[#fecdd3] text-[#9f1239]"
                        : "bg-[#fffbeb] border-[#fde68a] text-[#92400e]";

                    const missedQuestionsList = gap.items
                      .filter((i) => !i.isCorrect || i.isSlow)
                      .map((i) => i.question);

                    return (
                      <article
                        key={gap.concept}
                        className="border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 bg-[#f8f9ff]/50"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono tabular-nums font-bold text-[#004ac6]">
                                #{rankIdx + 1} Priority
                              </span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border font-semibold ${severityBadgeStyle}`}
                              >
                                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{gap.severity}</span>
                              </span>
                            </div>
                            <h2 className="text-lg font-bold text-[#0b1c30]">
                              {gap.concept}
                            </h2>
                            <p className="text-xs text-[#434655] font-mono tabular-nums">
                              {gap.missedCount}/{gap.totalAnswered} missed ·{" "}
                              {gap.slowCorrectCount} slow recall · Avg{" "}
                              {gap.avgTimeSeconds.toFixed(1)}s (vs{" "}
                              {avgSeconds.toFixed(1)}s overall)
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onNavigateMode("flashcards")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-semibold text-[#004ac6] bg-white hover:bg-[#eff6ff] border border-[#bfdbfe] rounded-xl transition-colors cursor-pointer"
                            >
                              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Flashcards</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onAskTutorAboutConcept(
                                  gap.concept,
                                  missedQuestionsList
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Ask Tutor</span>
                            </button>
                          </div>
                        </div>

                        {/* Specific Struggling Questions Under This Concept */}
                        <div className="divide-y divide-slate-200/80 border-t border-slate-200/80 bg-white rounded-xl px-4">
                          {gap.items
                            .filter((item) => !item.isCorrect || item.isSlow)
                            .map((item) => (
                              <div key={item.index} className="py-3 space-y-1.5">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm font-semibold text-[#0b1c30]">
                                    <span className="font-mono tabular-nums text-[#434655] mr-1.5">
                                      Q{item.index + 1}.
                                    </span>
                                    {item.question}
                                  </p>
                                  <span className="text-xs font-mono tabular-nums font-semibold text-[#434655] whitespace-nowrap shrink-0">
                                    {item.timeSeconds.toFixed(1)}s
                                    {item.isSlow ? " (Slow)" : ""}
                                  </span>
                                </div>

                                <div className="text-xs space-y-1">
                                  {!item.isCorrect ? (
                                    <p className="text-[#9f1239]">
                                      Your answer: {item.chosenText}
                                    </p>
                                  ) : (
                                    <p className="text-[#92400e]">
                                      Answered correctly, but took{" "}
                                      {item.timeSeconds.toFixed(1)}s — review to improve recall speed.
                                    </p>
                                  )}
                                  <p className="text-[#005236] font-medium">
                                    Correct answer: {item.correctText}
                                  </p>
                                  {item.explanation && (
                                    <p className="text-[#434655] leading-relaxed">
                                      {item.explanation}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : isCompleted ? (
          /* QUIZ COMPLETION & FULL REVIEW SCREEN */
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-[#434655]">
                    {studySet.subject} · {studySet.title}
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-bold text-[#0b1c30]">
                    Quiz Completed
                  </h1>
                </div>
                <div
                  className={`inline-flex items-center gap-2 text-sm font-semibold self-start sm:self-auto ${
                    finalPct >= 80
                      ? "text-[#005236]"
                      : finalPct >= 60
                        ? "text-[#004ac6]"
                        : "text-[#9f1239]"
                  }`}
                >
                  <Award className="w-4 h-4" aria-hidden="true" />
                  <span>{getScoreStanding(finalPct)}</span>
                </div>
              </div>

              {/* Score & Timing Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-[#f8f9ff] border border-slate-200/80 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-semibold text-[#434655]">Final Score</p>
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#0b1c30]">
                    {correctCount}/{totalQuestions}
                  </p>
                </div>
                <div className="bg-[#f8f9ff] border border-slate-200/80 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-semibold text-[#434655]">Accuracy</p>
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#004ac6]">
                    {finalPct}%
                  </p>
                </div>
                <div className="bg-[#f8f9ff] border border-slate-200/80 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-semibold text-[#434655]">Total Time</p>
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#0b1c30]">
                    {formatTimer(elapsedSeconds)}
                  </p>
                </div>
                <div className="bg-[#f8f9ff] border border-slate-200/80 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-semibold text-[#434655]">Avg / Question</p>
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#6b38d4]">
                    {avgSeconds.toFixed(1)}s
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onRetakeQuiz}
                  className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.22)] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  <span>Retake Quiz</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("knowledge_gaps")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold text-[#9f1239] bg-[#fff1f2] hover:bg-[#ffe4e6] border border-[#fecdd3] rounded-xl transition-colors cursor-pointer"
                >
                  <TrendingUp className="w-4 h-4" aria-hidden="true" />
                  <span>View Knowledge Gaps</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateMode("flashcards")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold text-[#004ac6] bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] rounded-xl transition-colors cursor-pointer"
                >
                  <Layers className="w-4 h-4" aria-hidden="true" />
                  <span>Review Flashcards</span>
                </button>
              </div>
            </section>

            {/* Question-by-Question Answer Breakdown */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-4">
              <h2 className="text-lg font-bold text-[#0b1c30] border-b border-slate-100 pb-3">
                Answer Breakdown
              </h2>

              <div className="divide-y divide-slate-100">
                {studySet.quiz.map((q, idx) => {
                  const chosen = answers[idx];
                  const isCorrect = chosen === q.correctIndex;
                  const timeSec =
                    questionTimesMs?.[idx] !== undefined
                      ? `${(questionTimesMs[idx] / 1000).toFixed(1)}s`
                      : null;

                  return (
                    <div key={q.id} className="py-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-[#0b1c30] leading-snug">
                          <span className="font-mono tabular-nums text-[#434655] mr-2">
                            {String(idx + 1).padStart(2, "0")}.
                          </span>
                          {q.question}
                        </p>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {timeSec && (
                            <span className="text-xs font-mono tabular-nums text-[#434655]">
                              {timeSec}
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap ${
                              isCorrect ? "text-[#005236]" : "text-[#9f1239]"
                            }`}
                          >
                            {isCorrect ? (
                              <>
                                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                <span>Correct</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-4 h-4" aria-hidden="true" />
                                <span>Incorrect</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs space-y-1 pl-6">
                        {!isCorrect && chosen !== undefined && (
                          <p className="text-[#9f1239]">
                            Your answer: {OPTION_LETTERS[chosen]}. {q.options[chosen]}
                          </p>
                        )}
                        <p className="text-[#005236] font-medium">
                          Correct answer: {OPTION_LETTERS[q.correctIndex]}.{" "}
                          {q.options[q.correctIndex]}
                        </p>
                        {q.explanation && (
                          <p className="text-[#434655] leading-relaxed pt-0.5">
                            {q.explanation}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          /* ACTIVE QUESTION STAGE */
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-6">
            {/* Progress Header, Quiz Timer & Dynamic Segmented Bar */}
            <div className="space-y-3 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#434655] truncate">
                    {studySet.subject} · {currentQuestion.topic || studySet.title}
                  </p>
                  <h1 className="text-base sm:text-lg font-bold text-[#0b1c30] font-mono tabular-nums">
                    Question {String(safeIndex + 1).padStart(2, "0")} of{" "}
                    {String(totalQuestions).padStart(2, "0")}
                  </h1>
                </div>

                {/* Live Quiz Timer + Score */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-2 bg-[#f8f9ff] border border-slate-200 rounded-xl px-3 py-1.5">
                    <Clock className="w-4 h-4 text-[#2563eb]" aria-hidden="true" />
                    <span
                      aria-label="Quiz elapsed timer"
                      className="font-mono tabular-nums text-sm font-bold text-[#0b1c30]"
                    >
                      {formatTimer(elapsedSeconds)}
                    </span>
                    <button
                      type="button"
                      onClick={onTogglePauseTimer}
                      aria-label={isPaused ? "Resume quiz timer" : "Pause quiz timer"}
                      title={isPaused ? "Resume timer" : "Pause timer"}
                      className="p-1 text-[#434655] hover:text-[#0b1c30] rounded-md cursor-pointer"
                    >
                      {isPaused ? (
                        <Play className="w-3.5 h-3.5" />
                      ) : (
                        <Pause className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-semibold text-[#434655]">Score</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-[#004ac6]">
                      {correctCount} / {answeredCount}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1" aria-hidden="true">
                {studySet.quiz.map((q, idx) => {
                  const ans = answers[idx];
                  let barColor = "bg-[#eff4ff]";
                  if (ans !== undefined) {
                    barColor =
                      ans === q.correctIndex ? "bg-[#10b981]" : "bg-[#f43f5e]";
                  } else if (idx === safeIndex) {
                    barColor = "bg-[#2563eb]";
                  }
                  return (
                    <div
                      key={q.id}
                      className={`flex-1 h-2 rounded-full transition-colors ${barColor}`}
                    />
                  );
                })}
              </div>
            </div>

            {isPaused ? (
              <div className="py-12 text-center space-y-4">
                <p className="text-base font-bold text-[#0b1c30]">
                  Quiz timer paused at {formatTimer(elapsedSeconds)}
                </p>
                <button
                  type="button"
                  onClick={onTogglePauseTimer}
                  className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl cursor-pointer"
                >
                  <Play className="w-4 h-4" aria-hidden="true" />
                  <span>Resume Quiz</span>
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-lg sm:text-xl font-bold text-[#0b1c30] leading-snug">
                  {currentQuestion.question}
                </h2>

                <div className="space-y-3" role="radiogroup" aria-label="Answer choices">
                  {currentQuestion.options.map((optionText, optIdx) => {
                    const isChosen = selectedOption === optIdx;
                    const isCorrectOption = currentQuestion.correctIndex === optIdx;

                    let containerStyle =
                      "border-slate-200 bg-white hover:border-[#2563eb] hover:bg-[#f8f9ff] text-[#0b1c30]";
                    let badgeStyle = "bg-[#eff4ff] text-[#004ac6]";
                    let statusTag: string | null = null;

                    if (hasAnsweredCurrent) {
                      if (isCorrectOption) {
                        containerStyle =
                          "border-[#10b981] bg-[#ecfdf5] text-[#002113]";
                        badgeStyle = "bg-[#10b981] text-white";
                        statusTag = "Correct";
                      } else if (isChosen && !isCorrectOption) {
                        containerStyle =
                          "border-[#f43f5e] bg-[#fff1f2] text-[#93000a]";
                        badgeStyle = "bg-[#f43f5e] text-white";
                        statusTag = "Your Answer";
                      } else {
                        containerStyle =
                          "border-slate-200 bg-slate-50/70 text-[#434655] opacity-75";
                        badgeStyle = "bg-slate-200 text-slate-600";
                      }
                    }

                    return (
                      <button
                        key={optIdx}
                        type="button"
                        disabled={hasAnsweredCurrent}
                        onClick={() => onSelectOption(safeIndex, optIdx)}
                        className={`w-full text-left p-3.5 sm:p-4 min-h-[52px] rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                          hasAnsweredCurrent ? "cursor-default" : "cursor-pointer"
                        } ${containerStyle} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <span
                            className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${badgeStyle}`}
                          >
                            {OPTION_LETTERS[optIdx]}
                          </span>
                          <span className="text-sm sm:text-base font-medium leading-snug">
                            {optionText}
                          </span>
                        </div>

                        {statusTag && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap shrink-0">
                            {isCorrectOption ? (
                              <CheckCircle2 className="w-4 h-4 text-[#006242]" aria-hidden="true" />
                            ) : (
                              <XCircle className="w-4 h-4 text-[#ba1a1a]" aria-hidden="true" />
                            )}
                            <span>{statusTag}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {hasAnsweredCurrent && (
                  <div
                    className={`rounded-xl p-4 border space-y-2 ${
                      selectedOption === currentQuestion.correctIndex
                        ? "bg-[#ecfdf5] border-[#a7f3d0] text-[#002113]"
                        : "bg-[#fff1f2] border-[#fecdd3] text-[#93000a]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm font-bold">
                      <div className="flex items-center gap-2">
                        {selectedOption === currentQuestion.correctIndex ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-[#006242]" aria-hidden="true" />
                            <span>Correct answer</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-[#ba1a1a]" aria-hidden="true" />
                            <span>
                              Incorrect — the correct option is{" "}
                              {OPTION_LETTERS[currentQuestion.correctIndex]}
                            </span>
                          </>
                        )}
                      </div>
                      {questionTimesMs?.[safeIndex] !== undefined && (
                        <span className="text-xs font-mono tabular-nums opacity-80">
                          {(questionTimesMs[safeIndex] / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                    {currentQuestion.explanation && (
                      <p className="text-sm leading-relaxed opacity-90">
                        {currentQuestion.explanation}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onRetakeQuiz}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-semibold text-[#434655] hover:text-[#0b1c30] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Restart</span>
                  </button>

                  {safeIndex < totalQuestions - 1 ? (
                    <button
                      type="button"
                      disabled={!hasAnsweredCurrent}
                      onClick={() => onGoToQuestion(safeIndex + 1)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.22)] transition-colors cursor-pointer"
                    >
                      <span>Next Question</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={answeredCount < totalQuestions}
                      onClick={onCompleteQuiz}
                      className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[#006242] hover:bg-[#005236] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer"
                    >
                      <span>
                        {answeredCount < totalQuestions
                          ? `Answer ${totalQuestions - answeredCount} remaining`
                          : "Finish & View Score"}
                      </span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* Right 4-Column Live Streak, Average Time, Score & Area of Improvement Rail */}
      <aside className="lg:col-span-4 space-y-6">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[#0b1c30]">Live Streak</h2>
            </div>
            <span className="text-xs font-mono tabular-nums font-semibold text-[#92400e]">
              {studyStreak.currentStreakDays}d study streak
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-[#eff4ff] rounded-xl p-3">
              <p className="text-xs font-medium text-[#434655]">Current Score</p>
              <p className="text-xl font-extrabold font-mono tabular-nums text-[#0b1c30]">
                {correctCount} / {totalQuestions}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-[#434655]">
                {accuracyPct}% accuracy
              </p>
            </div>

            <div className="bg-[#eff4ff] rounded-xl p-3">
              <p className="text-xs font-medium text-[#434655]">Average Time</p>
              <p className="text-xl font-extrabold font-mono tabular-nums text-[#004ac6]">
                {answeredCount > 0 ? `${avgSeconds.toFixed(1)}s` : "--"}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-[#434655]">
                Total {formatTimer(elapsedSeconds)}
              </p>
            </div>

            <div className="bg-[#fffbeb] border border-[#fde68a]/70 rounded-xl p-3">
              <p className="text-xs font-medium text-[#92400e]">Answer Streak</p>
              <p className="text-xl font-extrabold font-mono tabular-nums text-[#92400e]">
                {currentStreak}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-[#92400e]/80">
                Best run: {bestQuizStreak}
              </p>
            </div>

            <div className="bg-[#f8f9ff] border border-slate-200 rounded-xl p-3">
              <p className="text-xs font-medium text-[#434655]">Progress</p>
              <p className="text-xl font-extrabold font-mono tabular-nums text-[#6b38d4]">
                {answeredCount}/{totalQuestions}
              </p>
              <p className="text-[11px] text-[#434655]">answered</p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0b1c30]">
                <TrendingUp className="w-3.5 h-3.5 text-[#ba1a1a]" aria-hidden="true" />
                <span>Area of Improvement</span>
              </div>
              {knowledgeGaps.length > 0 && activeSubTab !== "knowledge_gaps" && (
                <button
                  type="button"
                  onClick={() => setActiveSubTab("knowledge_gaps")}
                  className="text-xs font-semibold text-[#004ac6] hover:underline cursor-pointer"
                >
                  Open tab
                </button>
              )}
            </div>

            {answeredCount === 0 ? (
              <p className="text-xs text-[#434655] leading-relaxed">
                Answer questions to detect weak concepts and slow recall areas in real time.
              </p>
            ) : knowledgeGaps.length === 0 ? (
              <p className="text-xs font-medium text-[#005236] bg-[#ecfdf5] border border-[#a7f3d0] rounded-xl p-3">
                100% accurate and steady pace across {answeredCount} question
                {answeredCount === 1 ? "" : "s"}.
              </p>
            ) : (
              <ul className="space-y-2">
                {knowledgeGaps.slice(0, 4).map((item) => (
                  <li
                    key={item.concept}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#fff1f2] border border-[#fecdd3] text-xs"
                  >
                    <span className="font-semibold text-[#93000a] truncate">
                      {item.concept}
                    </span>
                    <span className="font-mono tabular-nums font-bold text-[#ba1a1a] whitespace-nowrap shrink-0">
                      {item.missedCount > 0
                        ? `${item.missedCount}/${item.totalAnswered} missed`
                        : `${item.avgTimeSeconds.toFixed(1)}s slow`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Question Navigator Grid */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-[#0b1c30]">
              Question Navigator
            </h2>
            <span className="text-xs font-mono tabular-nums text-[#434655]">
              1–{totalQuestions}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {studySet.quiz.map((q, idx) => {
              const ans = answers[idx];
              const isCurrent =
                activeSubTab === "quiz" && !isCompleted && idx === safeIndex;

              let tileClass =
                "bg-white border-slate-200 text-[#434655] hover:border-[#2563eb]";
              if (ans !== undefined) {
                tileClass =
                  ans === q.correctIndex
                    ? "bg-[#ecfdf5] border-[#a7f3d0] text-[#005236]"
                    : "bg-[#fff1f2] border-[#fecdd3] text-[#9f1239]";
              }
              if (isCurrent) {
                tileClass += " ring-2 ring-[#2563eb] ring-offset-1 font-bold";
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={isCompleted}
                  onClick={() => {
                    setActiveSubTab("quiz");
                    onGoToQuestion(idx);
                  }}
                  aria-label={`Jump to question ${idx + 1}`}
                  className={`h-10 rounded-xl border text-xs font-mono tabular-nums font-semibold transition-all cursor-pointer disabled:cursor-default ${tileClass}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
  );
}
