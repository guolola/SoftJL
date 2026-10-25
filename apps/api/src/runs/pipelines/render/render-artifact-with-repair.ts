// Renders deterministic model source; typed compiler failures return to the owning pipeline without unchanged retries.
import { renderSvgResponseSchema, type ModelingStage, type DesignDiagramModelSpec, type DiagramModelSpec, type DesignSvgArtifact, type SvgArtifact } from "@uml-platform/contracts";
import type { AnyPlantUmlArtifact, RenderClient } from "../../../adapters/render/render-client.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "../../../adapters/plantuml/model-renderer.js";
import { appendDesignTrace, appendRequirementTrace, designDiagramKindFromArtifact, requirementDiagramKindFromArtifact } from "../shared/trace-events.js";
import { isRunCancelledError, throwIfRunCancelled } from "../../records/run-cancellation.js";
import { ModelCompilationError } from "../../../adapters/plantuml/model-compilation-error.js";

export async function renderArtifactWithRepair(
  record: RunRecord,
  renderClient: RenderClient, model: DiagramModelSpec | DesignDiagramModelSpec, artifact: AnyPlantUmlArtifact, stage?: ModelingStage, abortSignal?: AbortSignal,
  validation: "schema" | "semantic" = "semantic",
): Promise<{ status: "success"; artifact: AnyPlantUmlArtifact; svgArtifact: SvgArtifact | DesignSvgArtifact } | { status: "failed"; artifact: AnyPlantUmlArtifact; errorMessage: string }> {
  try {
    // The model is authoritative, including on manual redraw and retry entry points.
    throwIfRunCancelled(record);
    const canonical = stage === "design" || (!stage && "designTrace" in record.snapshot)
      ? generateDesignPlantUmlArtifacts([model as DesignDiagramModelSpec], validation)[0]!
      : generatePlantUmlArtifacts([model as DiagramModelSpec], stage === "feasibility" || (!stage && "selectedArtifacts" in record.snapshot) ? "feasibility" : "requirements", validation)[0]!;
    artifact = canonical;
    const rendered = renderSvgResponseSchema.parse(await renderClient(canonical, abortSignal));
    // Graphviz failures can return exit code zero and a valid SVG error picture; never publish that as a model.
    if (/Dot Executable:|Dot executable does not exist|Cannot find Graphviz/i.test(rendered.svg)) throw new Error("绘图服务无法使用 Graphviz，请检查 dot 配置");
    if (/Welcome to PlantUML!|Syntax Error\?|An error has occurred|Use 'allowmixing'/i.test(rendered.svg)) throw new Error("PlantUML returned a placeholder or error image");
    return { status: "success", artifact: canonical, svgArtifact: { modelId: canonical.modelId, diagramKind: canonical.diagramKind, svg: rendered.svg.replace(/\s(?:textLength|lengthAdjust)=(?:"[^"]*"|'[^']*')/g, ""), renderMeta: rendered.renderMeta } as SvgArtifact | DesignSvgArtifact };
  } catch (error) {
    throwIfRunCancelled(record);
    if (isRunCancelledError(error)) throw error;
    if (error instanceof ModelCompilationError) throw error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    appendDesignTrace(record, { stage: "render_svg", attempt: 1, kind: "render_error", diagramKind: designDiagramKindFromArtifact(artifact), plantUmlSource: artifact.source, errorMessage });
    appendRequirementTrace(record, { stage: "render_svg", attempt: 1, kind: "render_error", diagramKind: requirementDiagramKindFromArtifact(artifact), plantUmlSource: artifact.source, errorMessage });
    return { status: "failed", artifact, errorMessage: `模型绘图失败，未修改模型语义：${errorMessage}` };
  }
}
