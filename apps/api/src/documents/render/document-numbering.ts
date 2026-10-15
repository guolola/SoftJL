// Normalizes generated document section headings into a stable Word-style hierarchy.
import { type DocumentSection } from "@uml-platform/contracts";

const LEADING_NUMBER_PATTERN =
  /^\s*(?:A\.)?(?:第\s*)?\d+(?:\.\d+){0,3}(?:\s*[章节]\s*)?[\s.、：:-]*/i;

export function stripDocumentHeadingNumber(title: string) {
  return title.replace(LEADING_NUMBER_PATTERN, "").trim() || title.trim();
}

export function numberDocumentSections(
  sections: DocumentSection[],
  options: { prefix?: string } = {},
) {
  let heading1 = 0;
  let heading2 = 0;
  let heading3 = 0;
  let inAppendix = false;

  return sections.map((section) => {
    const cleanTitle = stripDocumentHeadingNumber(section.title);
    if (section.level === 1 && /^附录(?:\s|$|[A-ZＡ-Ｚ一二三四五六七八九十]|[:：])/.test(cleanTitle)) {
      inAppendix = true;
      return { ...section, title: cleanTitle };
    }
    if (inAppendix) {
      return { ...section, title: cleanTitle };
    }

    if (section.level === 1) {
      heading1 += 1;
      heading2 = 0;
      heading3 = 0;
      return { ...section, title: `${options.prefix ?? ""}${heading1} ${cleanTitle}` };
    }

    if (section.level === 2) {
      if (heading1 === 0) {
        heading1 = 1;
      }
      heading2 += 1;
      heading3 = 0;
      return { ...section, title: `${options.prefix ?? ""}${heading1}.${heading2} ${cleanTitle}` };
    }

    if (heading1 === 0) {
      heading1 = 1;
    }
    if (heading2 === 0) {
      heading2 = 1;
    }
    heading3 += 1;
    return { ...section, title: `${options.prefix ?? ""}${heading1}.${heading2}.${heading3} ${cleanTitle}` };
  });
}
