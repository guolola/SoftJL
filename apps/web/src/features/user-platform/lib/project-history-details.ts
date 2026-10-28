// Maps persisted run intent and snapshot artifacts to current history operations.
import type { TFunction } from "i18next";
import { getModelTaskLabel } from "../../../entities/diagram/model";
import type { RunHistorySnapshot } from "../../../entities/run-history/index";
import type { FeasibilityRunSnapshot } from "@uml-platform/contracts";
import type { PlatformRunSummary } from "../services/platform-api";

export const HISTORY_OPERATIONS = ["quick", "rules", "feasibility", "requirements", "design", "document"] as const;
export type HistoryOperation = typeof HISTORY_OPERATIONS[number];

export function getHistoryOperation(run: PlatformRunSummary): HistoryOperation | null {
  const operations = {
    quick_modeling: "quick",
    requirement_extraction: "rules", requirement_modeling: "requirements",
    feasibility_analysis: "feasibility", design_modeling: "design", document_generation: "document",
    unknown: null,
  } as const;
  return operations[run.operationType] ?? null;
}

export function historyDiagramLabel(id: string, design: boolean, t: TFunction, snapshot?: RunHistorySnapshot | FeasibilityRunSnapshot) {
  return getModelTaskLabel(id, {
    design, t,
    models: snapshot && "models" in snapshot ? snapshot.models : undefined,
    requirementModels: snapshot && "requirementModels" in snapshot ? snapshot.requirementModels : undefined,
  });
}

export function hasHistoryRetryFailure(run: PlatformRunSummary) {
  if (run.operationType === "quick_modeling") return false;
  return run.status === "failed" || (run.status === "completed" && run.terminal !== false &&
    (run.diagramErrorSummary ?? []).some((item) => item.error?.retryable));
}

export function historyRetryTargets(run: PlatformRunSummary, snapshot: RunHistorySnapshot | FeasibilityRunSnapshot, t: TFunction): string[] {
  const operation = getHistoryOperation(run);
  if ("selectedArtifacts" in snapshot) {
    const accepted = new Set(snapshot.outputManifest.map((output) => output.kind));
    return snapshot.selectedArtifacts.filter((kind) => !accepted.has(
      kind === "context" ? "context" : kind === "business-flow" ? "businessFlow" : "implementationPlan",
    )).map((kind) => t(`projectShell.historyUi.artifacts.${kind}`));
  }
  if ("documentKind" in snapshot) return [t(`projectShell.historyUi.documentKinds.${snapshot.documentKind}`)];
  if (operation === "rules") return [t("projectShell.historyUi.operations.rules")];
  const failures = Object.entries(snapshot.diagramErrors);
  const retryable = failures.filter(([, failure]) => failure.error.retryable);
  // Match the retry API's kind and use-case scope; successful siblings never appear in a partial retry.
  const kinds = failures.length > 0
    ? [...new Set(retryable.map(([id]) => id.split(":")[0]!))].filter((kind) => snapshot.selectedDiagrams.some((selected) => selected === kind))
    : snapshot.selectedDiagrams;
  return kinds.flatMap((kind) => {
    const instances = retryable.filter(([id]) => id.startsWith(`${kind}:`)).map(([id]) => id);
    const savedUseCaseIds = kind === "analysis" && "analysisTargetUseCaseIds" in snapshot ? snapshot.analysisTargetUseCaseIds
      : kind === "sequence" && "sequenceTargetUseCaseIds" in snapshot ? snapshot.sequenceTargetUseCaseIds : [];
    const ids = instances.length > 0 ? instances : savedUseCaseIds?.length ? savedUseCaseIds.map((id) => `${kind}:${id}`) : [kind];
    return ids.map((id) => historyDiagramLabel(id, operation === "design", t, snapshot));
  });
}
