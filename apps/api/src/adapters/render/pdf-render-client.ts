// Calls the render service for vector PDF output without changing project artifacts.
import { renderPdfResponseSchema, type RenderPdfResponse } from "@uml-platform/contracts";
import type { AnyPlantUmlArtifact } from "./render-client.js";

export type PdfRenderClient = (artifact: AnyPlantUmlArtifact, abortSignal?: AbortSignal) => Promise<{
  pdf: Buffer;
  renderMeta: RenderPdfResponse["renderMeta"];
}>;

export async function createPdfRenderClient(baseUrl: string, artifact: AnyPlantUmlArtifact, abortSignal?: AbortSignal): Promise<Awaited<ReturnType<PdfRenderClient>>> {
  const response = await fetch(`${baseUrl}/render/pdf`, {
    method: "POST", signal: abortSignal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diagramKind: artifact.diagramKind, plantUmlSource: artifact.source }),
  });
  if (!response.ok) {
    let message = `Render service PDF failed with HTTP ${response.status}`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload.message) message = payload.message;
    } catch { /* Preserve the HTTP error if the response has no JSON body. */ }
    throw new Error(message);
  }
  const payload = renderPdfResponseSchema.parse(await response.json());
  const pdf = Buffer.from(payload.pdfBase64, "base64");
  if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Render service returned invalid PDF content");
  return { pdf, renderMeta: payload.renderMeta };
}
