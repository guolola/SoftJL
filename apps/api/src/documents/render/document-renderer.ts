// Owns DOCX assembly and PlantUML image embedding for generated document artifacts.
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type IStylesOptions,
} from "docx";
import {
  type DocumentKind,
  type DocumentSection,
  type UmlDiagramKind,
  type FeasibilityInputs,
} from "@uml-platform/contracts";
import { documentDiagramLabel, documentTitle } from "../context/document-context.js";
import { type PngRenderClient } from "../../adapters/render/png-render-client.js";
import { numberDocumentSections } from "./document-numbering.js";
import {
  resolveDocumentStyle,
  type ResolvedDocumentStyle,
  type ResolvedParagraphStyle,
} from "./document-style-preset.js";

const DEFAULT_DOCUMENT_PLANTUML_DPI = 200;
const DOCUMENT_PLANTUML_FONT_ENV = "UML_DOCUMENT_PLANTUML_FONT_NAME";
const DOCUMENT_PLANTUML_DPI_ENV = "UML_DOCUMENT_PLANTUML_DPI";

function ptToHalfPoints(value: number) {
  return Math.round(value * 2);
}

function ptToTwips(value: number) {
  return Math.round(value * 20);
}

function lineSpacingToTwips(style: ResolvedParagraphStyle) {
  return Math.round(240 * style.lineSpacing.value);
}

function firstLineIndentToTwips(style: ResolvedParagraphStyle) {
  return Math.round(style.sizePt * style.firstLineIndentChars * 20);
}

function fontForStyle(style: ResolvedParagraphStyle) {
  return {
    ascii: style.asciiFont,
    hAnsi: style.asciiFont,
    eastAsia: style.eastAsiaFont,
  };
}

function spacingForStyle(style: ResolvedParagraphStyle) {
  return {
    before: ptToTwips(style.spacingBeforePt),
    after: ptToTwips(style.spacingAfterPt),
    line: lineSpacingToTwips(style),
    lineRule: LineRuleType.AUTO,
  };
}

function createTextRun(text: string, style: ResolvedParagraphStyle, bold = style.bold) {
  return new TextRun({
    text,
    bold,
    italics: style.italic,
    font: fontForStyle(style),
    size: ptToHalfPoints(style.sizePt),
  });
}

function createDocumentStyles(style: ResolvedDocumentStyle): IStylesOptions {
  const headingStyle = (heading: ResolvedDocumentStyle["heading1"]) => ({
    run: {
      bold: heading.bold,
      italics: heading.italic,
      font: fontForStyle(heading),
      size: ptToHalfPoints(heading.sizePt),
    },
    paragraph: {
      spacing: spacingForStyle(heading),
      keepNext: heading.keepNext,
    },
  });

  return {
    default: {
      document: {
        run: {
          font: fontForStyle(style.body),
          size: ptToHalfPoints(style.body.sizePt),
        },
        paragraph: {
          spacing: spacingForStyle(style.body),
        },
      },
      heading1: headingStyle(style.heading1),
      heading2: headingStyle(style.heading2),
      heading3: headingStyle(style.heading3),
    },
  };
}

function createTextParagraph(text: string, style: ResolvedParagraphStyle) {
  return new Paragraph({
    children: [createTextRun(text, style)],
    indent: { firstLine: firstLineIndentToTwips(style) },
    spacing: spacingForStyle(style),
  });
}

function createHeadingParagraph(
  section: DocumentSection,
  style: ResolvedDocumentStyle,
  pageBreakBefore = false,
) {
  const heading =
    section.level === 1
      ? HeadingLevel.HEADING_1
      : section.level === 2
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3;
  const headingStyle =
    section.level === 1 ? style.heading1 : section.level === 2 ? style.heading2 : style.heading3;
  return new Paragraph({
    children: [createTextRun(section.title, headingStyle)],
    heading,
    pageBreakBefore,
    spacing: spacingForStyle(headingStyle),
    keepNext: headingStyle.keepNext,
  });
}

function createSimpleTable(section: DocumentSection, style: ResolvedDocumentStyle) {
  if (!section.table) return null;
  const rows = [section.table.headers, ...section.table.rows].map(
    (cells, rowIndex) =>
      new TableRow({
        children: cells.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    createTextRun(
                      cell || " ",
                      style.table,
                      rowIndex === 0 ? style.table.headerBold : style.table.bold,
                    ),
                  ],
                  spacing: spacingForStyle(style.table),
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function readPngDimensions(png: Buffer) {
  const pngSignature = "89504e470d0a1a0a";
  if (png.length < 24 || png.subarray(0, 8).toString("hex") !== pngSignature) {
    return null;
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

export function resolvePngImageTransformation(
  png: Buffer,
  constraints = { maxWidth: 560, maxHeight: 680, maxUpscale: 1 },
) {
  const dimensions = readPngDimensions(png);
  if (!dimensions) {
    return { width: constraints.maxWidth, height: 320 };
  }
  const scale = Math.min(
    constraints.maxWidth / dimensions.width,
    constraints.maxHeight / dimensions.height,
    constraints.maxUpscale,
  );
  return {
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
  };
}

function createPngImageParagraph(png: Buffer, title: string) {
  const transformation = resolvePngImageTransformation(png);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    children: [
      new ImageRun({
        type: "png",
        data: png,
        transformation,
        altText: {
          title,
          description: title,
          name: title,
        },
      }),
    ],
    spacing: { before: 120, after: 120 },
  });
}

function createFigureCaption(text: string, style: ResolvedDocumentStyle) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [createTextRun(text, style.caption)],
    spacing: spacingForStyle(style.caption),
  });
}

function documentDiagramKey(section: DocumentSection) {
  return section.diagramModelId ?? section.diagramKind;
}

function sanitizePlantUmlQuotedValue(value: string) {
  return value.replace(/["\r\n]/gu, " ").replace(/\s+/gu, " ").trim();
}

function resolveDocumentPlantUmlFontName() {
  const configured = sanitizePlantUmlQuotedValue(
    process.env[DOCUMENT_PLANTUML_FONT_ENV]?.trim() ?? "",
  );
  if (configured) return configured;
  return process.platform === "win32" ? "Microsoft YaHei" : "Noto Sans CJK SC";
}

function resolveDocumentPlantUmlDpi() {
  const parsed = Number.parseInt(process.env[DOCUMENT_PLANTUML_DPI_ENV] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DOCUMENT_PLANTUML_DPI;
}

function withDocumentPlantUmlFont(source: string) {
  const fontName = resolveDocumentPlantUmlFontName();
  const fontSkinparams = [
    `skinparam dpi ${resolveDocumentPlantUmlDpi()}`,
    `skinparam defaultFontName "${fontName}"`,
    `skinparam activityFontName "${fontName}"`,
    `skinparam sequenceParticipantFontName "${fontName}"`,
    `skinparam sequenceMessageFontName "${fontName}"`,
    `skinparam componentFontName "${fontName}"`,
    `skinparam classFontName "${fontName}"`,
  ].join("\n");
  return source.replace(/@(startuml|startwbs|startmindmap)\s*/u, (match) => `${match}${fontSkinparams}\n`);
}

function createCoverParagraph(
  text: string,
  style: ResolvedDocumentStyle,
  options?: { title?: boolean; subtitle?: boolean },
) {
  const baseStyle = options?.title || options?.subtitle ? style.heading1 : style.body;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text,
        bold: Boolean(options?.title || options?.subtitle),
        font: fontForStyle(baseStyle),
        size: ptToHalfPoints(options?.title ? 18 : options?.subtitle ? 15 : style.body.sizePt),
      }),
    ],
    spacing: { before: options?.title ? 1200 : 160, after: options?.title ? 520 : 220 },
  });
}

function coverValue(value: string | number | null | undefined) {
  return value === null || value === undefined || String(value).trim() === ""
    ? "未提供/待确认"
    : String(value);
}

function feasibilityCoverProjectTitle(projectName: string | null | undefined) {
  const normalized = projectName?.trim();
  if (!normalized) return "XXXX系统";
  return normalized.endsWith("系统") ? normalized : `${normalized}系统`;
}

function createFeasibilityCoverTable(inputs: FeasibilityInputs, style: ResolvedDocumentStyle) {
  const rows = [
    ["项目名称", coverValue(inputs.projectName)],
    ["小组编号", coverValue(inputs.groupNumber)],
    ["成员及学号", coverValue(inputs.members)],
    ["年级班级", coverValue(inputs.gradeClass)],
    ["所在学院", coverValue(inputs.college)],
    ["提交日期", coverValue(inputs.submissionDate)],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) => new TableRow({
      children: [
        new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [createTextRun(label, style.table, true)], spacing: spacingForStyle(style.table) })] }),
        new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [createTextRun(value, style.table)], spacing: spacingForStyle(style.table) })] }),
      ],
    })),
  });
}

function createDocumentCover(
  documentKind: DocumentKind,
  style: ResolvedDocumentStyle,
  feasibilityInputs?: FeasibilityInputs,
) {
  const generatedDate = new Date().toISOString().slice(0, 10);
  const documentTemplateVersion = "V1.0";
  if (documentKind === "feasibilityStudy") {
    const inputs = feasibilityInputs ?? {
      projectName: "", school: "", college: "", groupNumber: "", members: "", gradeClass: "", submissionDate: "", proposedBy: "", developedBy: "", expectedUsers: "", targetEnvironment: "", deadline: "", expectedLifetimeYears: null, budgetLimit: null, teamSize: null, teamSkills: "", availableResources: "", legalConstraints: "", references: "", costItems: [], benefitItems: [], analysisYears: null,
    };
    return [
      createCoverParagraph(feasibilityCoverProjectTitle(inputs.projectName), style, { title: true }),
      createCoverParagraph("可行性分析报告", style, { subtitle: true }),
      createCoverParagraph(`学校：${coverValue(inputs.school)}`, style),
      createFeasibilityCoverTable(inputs, style),
      createCoverParagraph(`${coverValue(inputs.school)} ${coverValue(inputs.college)}`, style),
    ];
  }
  return [
    createCoverParagraph("课程设计文档", style, { title: true }),
    createCoverParagraph(documentTitle(documentKind), style, { subtitle: true }),
    createCoverParagraph(
      `项目名称：${coverValue(feasibilityInputs?.projectName)}`,
      style,
    ),
    createCoverParagraph(`文档类型：${documentTitle(documentKind)}`, style),
    createCoverParagraph(`文档版本：${documentTemplateVersion}`, style),
    createCoverParagraph(`生成日期：${generatedDate}`, style),
  ];
}

function estimateTocEntries(sections: DocumentSection[]) {
  let page = 1;
  let pageUnits = 0;
  const entries: Array<{ title: string; level: number; page: number }> = [];

  for (const section of sections) {
    entries.push({ title: section.title, level: section.level, page });
    pageUnits += section.level === 1 ? 4 : section.level === 2 ? 3 : 2;
    pageUnits += Math.max(section.body.length, 1) * 2;
    if (section.table) {
      pageUnits += 3 + section.table.rows.length;
    }
    if (section.diagramKind) {
      pageUnits += 8;
    }
    while (pageUnits >= 18) {
      page += 1;
      pageUnits -= 18;
    }
  }

  return entries;
}

function createTableOfContents(style: ResolvedDocumentStyle, sections: DocumentSection[]) {
  return [
    new Paragraph({
      children: [createTextRun("目录", style.heading1)],
      alignment: AlignmentType.CENTER,
      pageBreakBefore: true,
      spacing: spacingForStyle(style.heading1),
    }),
    // Cached entries make the TOC visible immediately; Word/WPS can refresh the
    // dirty field later to replace the estimated page numbers with exact ones.
    new TableOfContents("目录", {
      hyperlink: true,
      headingStyleRange: "1-3",
      cachedEntries: estimateTocEntries(sections),
      beginDirty: true,
    }),
  ];
}

export async function renderDocumentBuffer(
  documentKind: DocumentKind,
  sections: DocumentSection[],
  plantUmlMap: Map<string, string>,
  svgKinds: Set<string>,
  pngRenderClient: PngRenderClient,
  missingArtifacts: string[],
  documentStyleSettings?: Parameters<typeof resolveDocumentStyle>[0],
  feasibilityInputs?: FeasibilityInputs,
) {
  // This is the document assembly boundary: callers provide normalized sections
  // and image sources; this module returns a DOCX buffer plus missing-image notes.
  const style = resolveDocumentStyle(documentStyleSettings);
  const pageMargins = documentKind === "feasibilityStudy"
    ? { ...style.page, marginLeft: 1800, marginRight: 1800 }
    : style.page;
  const renderedSections = style.autoNumberHeadings
    ? numberDocumentSections(
        sections,
        documentKind === "feasibilityStudy" ? { prefix: "A." } : undefined,
      )
    : sections;
  const frontMatterChildren: Array<Paragraph | Table | TableOfContents> = createDocumentCover(
    documentKind,
    style,
    feasibilityInputs,
  );

  if (style.includeTableOfContents) {
    frontMatterChildren.push(...createTableOfContents(style, renderedSections));
  }

  const bodyChildren: Array<Paragraph | Table | TableOfContents> = [];
  for (const [index, section] of renderedSections.entries()) {
    bodyChildren.push(createHeadingParagraph(section, style, index === 0));
    for (const paragraph of section.body) {
      bodyChildren.push(createTextParagraph(paragraph, style.body));
    }
    const table = createSimpleTable(section, style);
    if (table) {
      bodyChildren.push(table);
    }
    if (section.diagramKind) {
      const diagramKey = documentDiagramKey(section);
      const source = diagramKey ? plantUmlMap.get(diagramKey) : undefined;
      if (!source) {
        const reason = diagramKey && svgKinds.has(diagramKey)
          ? `${diagramKey}: 缺少可嵌入图片源`
          : (diagramKey ?? section.diagramKind);
        missingArtifacts.push(reason);
        bodyChildren.push(
          createTextParagraph(
            "本节图源未随导出数据提供，正文已依据模型信息展开说明。",
            style.body,
          ),
        );
        continue;
      }

      try {
        const rendered = await pngRenderClient({
          diagramKind: section.diagramKind as UmlDiagramKind,
          modelId: section.diagramModelId,
          source: withDocumentPlantUmlFont(source),
        });
        bodyChildren.push(createPngImageParagraph(rendered.png, section.title));
        bodyChildren.push(
          createFigureCaption(
            `图 ${documentDiagramLabel(section.diagramKind, section.title)}`,
            style,
          ),
        );
      } catch (error) {
        missingArtifacts.push(
        `${section.diagramKind}: ${error instanceof Error ? error.message : "图片渲染失败"}`,
      );
        bodyChildren.push(
          createTextParagraph(
            "本节图源未随导出数据提供，正文已依据模型信息展开说明。",
            style.body,
          ),
        );
      }
    }
  }

  const doc = new Document({
    styles: createDocumentStyles(style),
    features: {
      updateFields: true,
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: pageMargins.marginTop,
              right: pageMargins.marginRight,
              bottom: pageMargins.marginBottom,
              left: pageMargins.marginLeft,
            },
          },
        },
        children: frontMatterChildren,
      },
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: pageMargins.marginTop,
              right: pageMargins.marginRight,
              bottom: pageMargins.marginBottom,
              left: pageMargins.marginLeft,
            },
            pageNumbers: {
              start: 1,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  createTextRun("第 ", style.caption),
                  new TextRun({ children: [PageNumber.CURRENT], font: fontForStyle(style.caption), size: ptToHalfPoints(style.caption.sizePt) }),
                  createTextRun(" 页", style.caption),
                ],
              }),
            ],
          }),
        },
        children: bodyChildren,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
