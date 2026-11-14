import React, { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  Highlighter,
  Heading2,
  List,
  ListOrdered,
  ImagePlus,
  RemoveFormatting,
} from "lucide-react";

interface RichNotesEditorProps {
  plainText: string;
  htmlContent: string;
  syncVersion: number;
  onChange: (plainText: string, htmlContent: string) => void;
}

/**
 * Converts plain text (e.g. from sample templates or .txt uploads) into clean
 * HTML paragraphs so it renders naturally inside the rich contentEditable editor.
 */
export function plainTextToHtml(text: string): string {
  if (!text.trim()) return "";
  return text
    .split(/\n/)
    .map((line) => {
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return escaped.trim() ? `<div>${escaped}</div>` : `<div><br></div>`;
    })
    .join("");
}

/**
 * Resizes uploaded inline note images to a reasonable width (max 900px)
 * so embedded diagrams stay sharp while remaining compact in localStorage.
 */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 900;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

/**
 * RichNotesEditor provides an editable lecture notes canvas where students can
 * write, format text (bold, italic, underline, heading, lists), highlight key
 * passages, and embed images inline.
 *
 * State synchronization note:
 * `syncVersion` only increments when notes are replaced externally (e.g. loading a
 * sample, switching study sets, or opening a previous upload). During normal typing,
 * React leaves `editorRef.current.innerHTML` untouched so caret selection never jumps.
 */
export function RichNotesEditor({
  plainText,
  htmlContent,
  syncVersion,
  onChange,
}: RichNotesEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    const nextHtml = htmlContent || plainTextToHtml(plainText);
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [syncVersion]);

  const emitChange = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const text = editorRef.current.innerText || "";
    onChange(text, html);
  };

  const execFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    emitChange();
  };

  // Toggles a soft yellow highlight marker on the active text selection.
  const toggleHighlight = () => {
    editorRef.current?.focus();
    const currentBg = document.queryCommandValue("hiliteColor");
    const isAlreadyHighlighted =
      typeof currentBg === "string" &&
      (currentBg.includes("254, 240, 138") || currentBg.toLowerCase() === "#fef08a");
    document.execCommand(
      "hiliteColor",
      false,
      isAlreadyHighlighted ? "transparent" : "#fef08a"
    );
    emitChange();
  };

  const handleInsertImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;

    try {
      const dataUrl = await resizeImageToDataUrl(file);
      editorRef.current?.focus();
      document.execCommand(
        "insertHTML",
        false,
        `<img src="${dataUrl}" alt="${file.name.replace(/"/g, "")}" /><div><br></div>`
      );
      emitChange();
    } catch {
      // Ignore invalid image files gracefully.
    }
  };

  const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
  const charCount = plainText.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#434655]">
          Editable Lecture Notes
        </span>
        <span className="text-xs font-mono tabular-nums text-[#434655]">
          {wordCount} words · {charCount} chars
        </span>
      </div>

      <div className="rounded-xl border border-slate-300 bg-white overflow-hidden focus-within:border-[#2563eb] focus-within:ring-3 focus-within:ring-[#2563eb]/15 transition-shadow">
        {/* Rich Formatting Toolbar */}
        <div
          role="toolbar"
          aria-label="Lecture notes formatting tools"
          className="flex flex-wrap items-center gap-1 px-2.5 py-2 bg-[#f8f9ff] border-b border-slate-200"
        >
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat("bold");
            }}
            title="Bold"
            aria-label="Bold"
            className="p-2 min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#0b1c30] hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            <Bold className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat("italic");
            }}
            title="Italic"
            aria-label="Italic"
            className="p-2 min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#0b1c30] hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            <Italic className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat("underline");
            }}
            title="Underline"
            aria-label="Underline"
            className="p-2 min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#0b1c30] hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            <Underline className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              toggleHighlight();
            }}
            title="Highlight selection"
            aria-label="Highlight selection"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] text-xs font-semibold text-[#92400e] bg-[#fef9c3] hover:bg-[#fef08a] border border-[#fde68a] rounded-lg transition-colors cursor-pointer"
          >
            <Highlighter className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Highlight</span>
          </button>

          <span className="h-5 w-px bg-slate-200 mx-1" aria-hidden="true" />

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat("formatBlock", "H2");
            }}
            title="Section Heading"
            aria-label="Section Heading"
            className="p-2 min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#0b1c30] hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            <Heading2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat("insertUnorderedList");
            }}
            title="Bullet List"
            aria-label="Bullet List"
            className="p-2 min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#0b1c30] hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            <List className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat("insertOrderedList");
            }}
            title="Numbered List"
            aria-label="Numbered List"
            className="p-2 min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#0b1c30] hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <span className="h-5 w-px bg-slate-200 mx-1" aria-hidden="true" />

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleInsertImage}
            className="sr-only"
            id="inline-note-image-upload"
          />
          <label
            htmlFor="inline-note-image-upload"
            title="Insert image into lecture notes"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-semibold text-[#004ac6] hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add Image</span>
          </label>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat("removeFormat");
              execFormat("formatBlock", "DIV");
            }}
            title="Clear formatting"
            aria-label="Clear formatting"
            className="p-2 min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#434655] hover:text-[#0b1c30] hover:bg-white rounded-lg transition-colors ml-auto cursor-pointer"
          >
            <RemoveFormatting className="w-4 h-4" />
          </button>
        </div>

        {/* Editable Content Area */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Lecture notes editor"
          data-placeholder="Write or paste your lecture notes here. Highlight key terms, format headings, or insert diagrams..."
          onInput={emitChange}
          className="rich-notes-editor min-h-[240px] max-h-[520px] overflow-y-auto px-4 py-3.5 text-sm leading-relaxed text-[#0b1c30] focus:outline-none"
        />
      </div>
    </div>
  );
}
