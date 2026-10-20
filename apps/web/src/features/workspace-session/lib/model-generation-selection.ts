// Gives cards and generation action guards the same localized dependency-conflict explanation.
import { conflictingModelGenerationTarget, type ModelGenerationStage } from "@uml-platform/contracts";
import { getDesignDiagramLabel, getDiagramLabel, type DesignDiagramType, type DiagramType } from "../../../entities/diagram/model";
import { i18n } from "../../../shared/i18n/i18n";

export function modelGenerationSelectionBlockReason(stage: ModelGenerationStage, target: string, batch: readonly string[]) {
  const selected = conflictingModelGenerationTarget(stage, target, batch);
  if (!selected) return null;
  const label = stage === "design" ? getDesignDiagramLabel(selected as DesignDiagramType, i18n.t) : getDiagramLabel(selected as DiagramType, i18n.t);
  return i18n.t("generationBatch.conflict", { selected: label });
}
