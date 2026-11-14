import { BookOpen, Layers, CheckSquare, Plus } from "lucide-react";
import { StudyMode } from "../types/study";

interface TopBarProps {
  activeMode: StudyMode;
  onSelectMode: (mode: StudyMode) => void;
  onStartNewSet: () => void;
  hasStudySet: boolean;
}

/**
 * TopBar implements the 3-zone header contract:
 * 1) Brand wordmark ("KnowNest" + "Everything You Need to Learn Better")
 * 2) Clean single-line mode links (Notes, Flashcards, Quiz)
 * 3) Single primary action ("New Study Set")
 *
 * On mobile viewports (< 768px), a compact 56px sticky bottom mode bar
 * provides thumb-friendly switching across the 3 study modes while
 * staying well beneath the 15% mobile sticky viewport cap.
 */
export function TopBar({
  activeMode,
  onSelectMode,
  onStartNewSet,
  hasStudySet,
}: TopBarProps) {
  const navItems: Array<{ id: StudyMode; label: string; icon: typeof BookOpen }> = [
    { id: "notes", label: "Notes", icon: BookOpen },
    { id: "flashcards", label: "Flashcards", icon: Layers },
    { id: "quiz", label: "Quiz", icon: CheckSquare },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#f8f9ff]/95 backdrop-blur-sm border-b border-slate-200/90">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark & Tagline */}
          <button
            type="button"
            onClick={() => onSelectMode("notes")}
            className="text-left flex flex-col leading-tight whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb] rounded cursor-pointer"
          >
            <span className="text-lg font-extrabold tracking-tight text-[#0b1c30]">
              KnowNest
            </span>
            <span className="text-[11px] font-medium text-[#434655] hidden sm:block">
              Everything You Need to Learn Better
            </span>
          </button>

          {/* Zone 2: Desktop Single-Line Mode Navigation Links */}
          <nav
            aria-label="Study modes"
            className="hidden md:flex items-center gap-7"
          >
            {navItems.map((item) => {
              const isActive = activeMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectMode(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative py-2 text-sm font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb] rounded ${
                    isActive
                      ? "text-[#004ac6]"
                      : "text-[#434655] hover:text-[#0b1c30]"
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-[#2563eb]"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onStartNewSet}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.22)] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{hasStudySet ? "New Study Set" : "Upload Notes"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Mode Switcher (56px height, <= 15% mobile viewport cap) */}
      <nav
        aria-label="Mobile study modes"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 backdrop-blur-sm border-t border-slate-200 grid grid-cols-3"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeMode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectMode(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563eb] ${
                isActive ? "text-[#004ac6]" : "text-[#434655]"
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
