// Defines document library, OnlyOffice editor config, document style, and generated content section schemas.
import { z } from "zod";

export const documentKindSchema = z.enum([
  "requirementsSpec",
  "softwareDesignSpec",
  "feasibilityStudy",
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const documentStatusSchema = z.enum(["active", "deleted"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentLibraryItemSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).nullable().optional(),
  createdByUserId: z.string().min(1).nullable().optional(),
  documentKind: documentKindSchema,
  title: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  byteLength: z.number().int().min(0),
  version: z.number().int().min(1),
  status: documentStatusSchema.default("active"),
  sourceRunId: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type DocumentLibraryItem = z.infer<typeof documentLibraryItemSchema>;

export const documentLibraryListResponseSchema = z.object({
  documents: z.array(documentLibraryItemSchema),
});
export type DocumentLibraryListResponse = z.infer<
  typeof documentLibraryListResponseSchema
>;

export const documentLibraryVersionItemSchema = z.object({
  documentId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  createdByUserId: z.string().min(1).nullable(),
  version: z.number().int().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  byteLength: z.number().int().min(0),
  sourceRunId: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
});
export type DocumentLibraryVersionItem = z.infer<
  typeof documentLibraryVersionItemSchema
>;

export const documentLibraryVersionsResponseSchema = z.object({
  versions: z.array(documentLibraryVersionItemSchema),
});
export type DocumentLibraryVersionsResponse = z.infer<
  typeof documentLibraryVersionsResponseSchema
>;

export const onlyOfficeEditorConfigResponseSchema = z.object({
  document: documentLibraryItemSchema,
  documentServerUrl: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});
export type OnlyOfficeEditorConfigResponse = z.infer<
  typeof onlyOfficeEditorConfigResponseSchema
>;

export const onlyOfficeUiThemeSchema = z.enum([
  "theme-classic-light",
  "theme-dark",
]);
export type OnlyOfficeUiTheme = z.infer<typeof onlyOfficeUiThemeSchema>;

export const documentStylePresetNameSchema = z.enum(["courseDesign"]);
export type DocumentStylePresetName = z.infer<typeof documentStylePresetNameSchema>;

const documentFontSchema = z.string().trim().min(1).max(64);
const documentPointSizeSchema = z.number().min(6).max(72);
const documentSpacingPtSchema = z.number().min(0).max(72);

export const documentLineSpacingSchema = z.object({
  type: z.enum(["single", "multiple"]),
  value: z.number().min(1).max(3),
});
export type DocumentLineSpacing = z.infer<typeof documentLineSpacingSchema>;

export const documentParagraphStyleSchema = z.object({
  eastAsiaFont: documentFontSchema.optional(),
  asciiFont: documentFontSchema.optional(),
  sizePt: documentPointSizeSchema.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  lineSpacing: documentLineSpacingSchema.optional(),
  spacingBeforePt: documentSpacingPtSchema.optional(),
  spacingAfterPt: documentSpacingPtSchema.optional(),
  firstLineIndentChars: z.number().min(0).max(4).optional(),
});
export type DocumentParagraphStyle = z.infer<typeof documentParagraphStyleSchema>;

export const documentHeadingStyleSchema = documentParagraphStyleSchema.extend({
  keepNext: z.boolean().optional(),
});
export type DocumentHeadingStyle = z.infer<typeof documentHeadingStyleSchema>;

export const documentTableStyleSchema = documentParagraphStyleSchema.extend({
  headerBold: z.boolean().optional(),
});
export type DocumentTableStyle = z.infer<typeof documentTableStyleSchema>;

export const documentStyleSettingsSchema = z.object({
  presetName: documentStylePresetNameSchema.default("courseDesign"),
  includeTableOfContents: z.boolean().default(true),
  autoNumberHeadings: z.boolean().default(true),
  heading1: documentHeadingStyleSchema.optional(),
  heading2: documentHeadingStyleSchema.optional(),
  heading3: documentHeadingStyleSchema.optional(),
  body: documentParagraphStyleSchema.optional(),
  table: documentTableStyleSchema.optional(),
  caption: documentParagraphStyleSchema.optional(),
});
export type DocumentStyleSettings = z.infer<typeof documentStyleSettingsSchema>;

export const documentSectionTableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});
export type DocumentSectionTable = z.infer<typeof documentSectionTableSchema>;

export const documentSectionSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string().min(1),
  body: z.array(z.string()).default([]),
  table: documentSectionTableSchema.optional(),
  diagramKind: z.string().optional(),
  diagramModelId: z.string().min(1).optional(),
});
export type DocumentSection = z.infer<typeof documentSectionSchema>;

export const documentContentResultSchema = z.object({
  sections: z.array(documentSectionSchema).min(1),
});
export type DocumentContentResult = z.infer<typeof documentContentResultSchema>;
