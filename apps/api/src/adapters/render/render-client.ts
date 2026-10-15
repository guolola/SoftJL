// Calls the render service for SVG output; pipelines handle repair decisions.
import type { ModelRenderMapping, UmlDiagramKind } from "@uml-platform/contracts";

export type AnyPlantUmlArtifact = {
  modelId?: string;
  diagramKind: UmlDiagramKind;
  source: string;
  renderMapping?: ModelRenderMapping;
};

export type RenderClient = (artifact: AnyPlantUmlArtifact, abortSignal?: AbortSignal) => Promise<{
  svg: string;
  renderMeta: {
    engine: string;
    generatedAt: string;
    sourceLength: number;
    durationMs: number;
  };
}>;

export async function createRenderClient(
  baseUrl: string,
  artifact: AnyPlantUmlArtifact,
  abortSignal?: AbortSignal,
): Promise<Awaited<ReturnType<RenderClient>>> {
  const response = await fetch(`${baseUrl}/render/svg`, {
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
    let message = `Render service failed with HTTP ${response.status}`;
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

  return (await response.json()) as Awaited<ReturnType<RenderClient>>;
}
