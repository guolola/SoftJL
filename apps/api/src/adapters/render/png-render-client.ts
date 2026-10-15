// Calls the render service for embeddable PNG output used by DOCX generation.
import {
  renderPngResponseSchema,
  type RenderPngResponse,
} from "@uml-platform/contracts";
import type { AnyPlantUmlArtifact } from "./render-client.js";

export type PngRenderClient = (artifact: AnyPlantUmlArtifact, abortSignal?: AbortSignal) => Promise<{
  png: Buffer;
  renderMeta: RenderPngResponse["renderMeta"];
}>;

export async function createPngRenderClient(
  baseUrl: string,
  artifact: AnyPlantUmlArtifact,
  abortSignal?: AbortSignal,
): Promise<Awaited<ReturnType<PngRenderClient>>> {
  const response = await fetch(`${baseUrl}/render/png`, {
    method: "POST",
    signal: abortSignal,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      diagramKind: artifact.diagramKind,
      plantUmlSource: artifact.source,
    }),
  });

  if (!response.ok) {
    let message = `Render service PNG failed with HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep the status-based message when the render service returns non-JSON.
    }
    throw new Error(message);
  }

  const payload = renderPngResponseSchema.parse(await response.json());
  return {
    png: Buffer.from(payload.pngBase64, "base64"),
    renderMeta: payload.renderMeta,
  };
}
