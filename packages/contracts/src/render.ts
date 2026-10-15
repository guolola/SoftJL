// Owns render service request and response contracts shared by API and clients.
import { z } from "zod";
import {
  designDiagramModelSpecSchema,
  diagramModelSpecSchema,
  svgArtifactSchema,
} from "./models.js";
import { umlDiagramKindSchema } from "./requirements.js";

export const renderSvgRequestSchema = z.object({
  diagramKind: umlDiagramKindSchema,
  plantUmlSource: z.string().min(1),
});
export type RenderSvgRequest = z.infer<typeof renderSvgRequestSchema>;

export const renderSvgResponseSchema = z.object({
  svg: z.string().min(1),
  renderMeta: svgArtifactSchema.shape.renderMeta,
});
export type RenderSvgResponse = z.infer<typeof renderSvgResponseSchema>;

export const renderStructuredModelRequestSchema = z.object({
  stage: z.enum(["feasibility", "requirements", "design"]),
  model: z.record(z.unknown()),
});
export type RenderStructuredModelRequest = z.infer<
  typeof renderStructuredModelRequestSchema
>;

export const renderStructuredModelResponseSchema = renderSvgResponseSchema.extend({
  plantUmlSource: z.string().min(1),
});
export type RenderStructuredModelResponse = z.infer<
  typeof renderStructuredModelResponseSchema
>;

export const renderPngRequestSchema = renderSvgRequestSchema;
export type RenderPngRequest = z.infer<typeof renderPngRequestSchema>;

export const renderPngResponseSchema = z.object({
  pngBase64: z.string().min(1),
  renderMeta: svgArtifactSchema.shape.renderMeta,
});
export type RenderPngResponse = z.infer<typeof renderPngResponseSchema>;

export const renderPdfRequestSchema = renderSvgRequestSchema;
export type RenderPdfRequest = z.infer<typeof renderPdfRequestSchema>;
export const renderPdfResponseSchema = z.object({
  pdfBase64: z.string().min(1),
  renderMeta: svgArtifactSchema.shape.renderMeta,
});
export type RenderPdfResponse = z.infer<typeof renderPdfResponseSchema>;
