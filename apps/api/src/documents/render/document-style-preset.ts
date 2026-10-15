// Defines the DOCX style presets and sanitizes caller-provided document style overrides.
import { type DocumentStyleSettings } from "@uml-platform/contracts";

export type ResolvedLineSpacing = {
  type: "single" | "multiple";
  value: number;
};

export type ResolvedParagraphStyle = {
  eastAsiaFont: string;
  asciiFont: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  lineSpacing: ResolvedLineSpacing;
  spacingBeforePt: number;
  spacingAfterPt: number;
  firstLineIndentChars: number;
};

export type ResolvedHeadingStyle = ResolvedParagraphStyle & {
  keepNext: boolean;
};

export type ResolvedTableStyle = ResolvedParagraphStyle & {
  headerBold: boolean;
};

export type ResolvedDocumentStyle = {
  presetName: "courseDesign";
  includeTableOfContents: boolean;
  autoNumberHeadings: boolean;
  heading1: ResolvedHeadingStyle;
  heading2: ResolvedHeadingStyle;
  heading3: ResolvedHeadingStyle;
  body: ResolvedParagraphStyle;
  table: ResolvedTableStyle;
  caption: ResolvedParagraphStyle;
  page: {
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
  };
};

export const COURSE_DESIGN_DOCUMENT_STYLE: ResolvedDocumentStyle = {
  presetName: "courseDesign",
  includeTableOfContents: true,
  autoNumberHeadings: true,
  heading1: {
    eastAsiaFont: "SimHei",
    asciiFont: "Times New Roman",
    sizePt: 16,
    bold: true,
    italic: false,
    lineSpacing: { type: "multiple", value: 1.73 },
    spacingBeforePt: 13,
    spacingAfterPt: 13,
    firstLineIndentChars: 0,
    keepNext: true,
  },
  heading2: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 16,
    bold: true,
    italic: false,
    lineSpacing: { type: "multiple", value: 1.73 },
    spacingBeforePt: 13,
    spacingAfterPt: 13,
    firstLineIndentChars: 0,
    keepNext: true,
  },
  heading3: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 14,
    bold: true,
    italic: false,
    lineSpacing: { type: "multiple", value: 1.5 },
    spacingBeforePt: 8,
    spacingAfterPt: 8,
    firstLineIndentChars: 0,
    keepNext: true,
  },
  body: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 10.5,
    bold: false,
    italic: false,
    lineSpacing: { type: "single", value: 1 },
    spacingBeforePt: 0,
    spacingAfterPt: 1,
    firstLineIndentChars: 2,
  },
  table: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 10.5,
    bold: false,
    italic: false,
    lineSpacing: { type: "single", value: 1 },
    spacingBeforePt: 0,
    spacingAfterPt: 0,
    firstLineIndentChars: 0,
    headerBold: true,
  },
  caption: {
    eastAsiaFont: "SimSun",
    asciiFont: "Times New Roman",
    sizePt: 10.5,
    bold: false,
    italic: true,
    lineSpacing: { type: "single", value: 1 },
    spacingBeforePt: 2,
    spacingAfterPt: 8,
    firstLineIndentChars: 0,
  },
  page: {
    marginTop: 1440,
    marginRight: 1440,
    marginBottom: 1440,
    marginLeft: 1440,
  },
};

function mergeParagraphStyle<T extends ResolvedParagraphStyle>(
  base: T,
  override: DocumentStyleSettings["body"] | undefined,
): T {
  return {
    ...base,
    ...override,
    lineSpacing: override?.lineSpacing ?? base.lineSpacing,
  };
}

export function resolveDocumentStyle(
  settings: DocumentStyleSettings | undefined,
): ResolvedDocumentStyle {
  const base = COURSE_DESIGN_DOCUMENT_STYLE;
  return {
    ...base,
    presetName: "courseDesign",
    includeTableOfContents: settings?.includeTableOfContents ?? base.includeTableOfContents,
    autoNumberHeadings: settings?.autoNumberHeadings ?? base.autoNumberHeadings,
    heading1: mergeParagraphStyle(base.heading1, settings?.heading1),
    heading2: mergeParagraphStyle(base.heading2, settings?.heading2),
    heading3: mergeParagraphStyle(base.heading3, settings?.heading3),
    body: mergeParagraphStyle(base.body, settings?.body),
    table: {
      ...mergeParagraphStyle(base.table, settings?.table),
      headerBold: settings?.table?.headerBold ?? base.table.headerBold,
    },
    caption: mergeParagraphStyle(base.caption, settings?.caption),
    page: base.page,
  };
}
