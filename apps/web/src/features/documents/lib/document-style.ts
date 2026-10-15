// Provides default DOCX style settings for generated instruction documents.
import type { DocumentStyleSettings } from "@uml-platform/contracts";

export const DEFAULT_DOCUMENT_STYLE: DocumentStyleSettings = {
  presetName: "courseDesign",
  includeTableOfContents: true,
  autoNumberHeadings: true,
  heading1: {
    eastAsiaFont: "SimHei",
    asciiFont: "Times New Roman",
    sizePt: 16,
    bold: true,
    lineSpacing: { type: "multiple", value: 1.73 },
    spacingBeforePt: 13,
    spacingAfterPt: 13,
  },
  heading2: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 16,
    bold: true,
    lineSpacing: { type: "multiple", value: 1.73 },
    spacingBeforePt: 13,
    spacingAfterPt: 13,
  },
  heading3: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 14,
    bold: true,
    lineSpacing: { type: "multiple", value: 1.5 },
    spacingBeforePt: 8,
    spacingAfterPt: 8,
  },
  body: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 10.5,
    lineSpacing: { type: "single", value: 1 },
    spacingAfterPt: 1,
    firstLineIndentChars: 2,
  },
  table: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 10.5,
    lineSpacing: { type: "single", value: 1 },
    headerBold: true,
  },
  caption: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 10.5,
    italic: true,
    lineSpacing: { type: "single", value: 1 },
    spacingBeforePt: 2,
    spacingAfterPt: 8,
  },
};

export function cloneDefaultDocumentStyle(): DocumentStyleSettings {
  return structuredClone(DEFAULT_DOCUMENT_STYLE);
}
