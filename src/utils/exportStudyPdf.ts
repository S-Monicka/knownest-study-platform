import { jsPDF } from "jspdf";
import { CardMastery, StudySet } from "../types/study";

const MASTERY_LABELS: Record<CardMastery, string> = {
  new: "New",
  needs_review: "Needs Review",
  reviewing: "Reviewing",
  mastered: "Mastered",
};

/**
 * Generates and downloads a formatted multi-page PDF document containing
 * the active study set's title, subject metadata, synthesis summary,
 * numbered key concepts, and all flashcards.
 */
export function exportStudySetToPdf(studySet: StudySet): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const marginBottom = 56;
  const contentWidth = pageWidth - marginX * 2;
  let y = 52;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = 52;
    }
  };

  // Top Header Metadata
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(37, 99, 235); // #2563eb
  doc.text(
    `KNOWNEST  |  ${studySet.subject.toUpperCase()}`,
    marginX,
    y
  );
  y += 20;

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(11, 28, 48); // #0b1c30
  const titleLines = doc.splitTextToSize(studySet.title, contentWidth);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 24 + 4;

  // Date & Deck Counts Metadata
  const exportedDate = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const masteredCount = studySet.flashcards.filter(
    (c) => c.mastery === "mastered"
  ).length;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(67, 70, 85); // #434655
  doc.text(
    `Exported ${exportedDate}  ·  ${studySet.flashcards.length} Flashcards (${masteredCount} Mastered)  ·  ${studySet.keyConcepts.length} Key Concepts`,
    marginX,
    y
  );
  y += 14;

  // Accent Divider Rule
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1.5);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;

  // Summary Section
  if (studySet.summary?.trim()) {
    ensureSpace(64);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(11, 28, 48);
    doc.text("Summary", marginX, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);
    const summaryLines = doc.splitTextToSize(studySet.summary.trim(), contentWidth);
    doc.text(summaryLines, marginX, y, { lineHeightFactor: 1.45 });
    y += summaryLines.length * 15 + 18;
  }

  // Key Concepts Section
  if (studySet.keyConcepts.length > 0) {
    ensureSpace(50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(11, 28, 48);
    doc.text("Key Concepts", marginX, y);
    y += 16;

    studySet.keyConcepts.forEach((concept, idx) => {
      const headingText = `${String(idx + 1).padStart(2, "0")}. ${concept.heading}`;
      const headingLines = doc.splitTextToSize(headingText, contentWidth);
      const detailLines = doc.splitTextToSize(concept.detail, contentWidth - 18);
      const blockHeight = headingLines.length * 14 + detailLines.length * 14 + 12;

      ensureSpace(blockHeight);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(0, 74, 198);
      doc.text(headingLines, marginX, y);
      y += headingLines.length * 14 + 2;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(67, 70, 85);
      doc.text(detailLines, marginX + 18, y, { lineHeightFactor: 1.4 });
      y += detailLines.length * 14 + 10;
    });

    y += 10;
  }

  // Flashcards Section
  if (studySet.flashcards.length > 0) {
    ensureSpace(64);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(11, 28, 48);
    doc.text(`Flashcards (${studySet.flashcards.length})`, marginX, y);
    y += 16;

    studySet.flashcards.forEach((card, idx) => {
      const innerWidth = contentWidth - 28;
      const termLines = doc.splitTextToSize(card.term, innerWidth);
      const defLines = doc.splitTextToSize(card.definition, innerWidth);
      const hintLines = card.hint
        ? doc.splitTextToSize(`Hint: ${card.hint}`, innerWidth)
        : [];

      const cardHeight =
        24 + // top metadata row
        termLines.length * 14 +
        8 +
        defLines.length * 14 +
        (hintLines.length > 0 ? hintLines.length * 12 + 6 : 0) +
        14;

      ensureSpace(cardHeight + 10);

      // Card container background and border
      doc.setFillColor(248, 249, 255);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.75);
      doc.roundedRect(marginX, y, contentWidth, cardHeight, 6, 6, "FD");

      let cardY = y + 18;

      // Card Index, Topic & Mastery Label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(67, 70, 85);
      doc.text(
        `CARD ${String(idx + 1).padStart(2, "0")}  ·  ${card.topic.toUpperCase()}`,
        marginX + 14,
        cardY
      );
      doc.text(
        MASTERY_LABELS[card.mastery],
        pageWidth - marginX - 14,
        cardY,
        { align: "right" }
      );
      cardY += 16;

      // Term (Front)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(11, 28, 48);
      doc.text(termLines, marginX + 14, cardY);
      cardY += termLines.length * 14 + 4;

      // Definition (Back)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(defLines, marginX + 14, cardY, { lineHeightFactor: 1.38 });
      cardY += defLines.length * 14;

      // Hint
      if (hintLines.length > 0) {
        cardY += 4;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(hintLines, marginX + 14, cardY);
      }

      y += cardHeight + 10;
    });
  }

  // Stamp footer page numbers on every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `KnowNest · ${studySet.title}`,
      marginX,
      pageHeight - 28
    );
    doc.text(
      `Page ${p} of ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 28,
      { align: "right" }
    );
  }

  const safeSlug =
    studySet.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "study-set";

  doc.save(`${safeSlug}-study-guide.pdf`);
}
