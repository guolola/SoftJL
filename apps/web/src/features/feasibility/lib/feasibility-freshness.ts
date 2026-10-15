// Centralizes accepted-rule selection and freshness checks for feasibility artifacts and reports.
import {
  buildAcceptedRequirementSnapshot,
  buildFeasibilityImplementationFingerprint,
  readFeasibilityBusinessFlowArtifact,
  type FeasibilityArtifactKind,
} from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

export type FeasibilityArtifactStatus = "ready" | "missing" | "stale";

export function acceptedFeasibilityRules(workspace: WorkspaceRecord) {
  return buildAcceptedRequirementSnapshot(
    workspace.rules,
    workspace.requirementBaseline,
  ).rules;
}

export function feasibilityArtifactState(workspace: WorkspaceRecord) {
  const requirementSource = buildAcceptedRequirementSnapshot(
    workspace.rules,
    workspace.requirementBaseline,
  );
  const rules = requirementSource.rules;
  const currentContextFingerprint = requirementSource.snapshot.fingerprint;
  const businessFlow = readFeasibilityBusinessFlowArtifact(workspace.feasibilityBusinessFlow);
  const businessFlowExists = Boolean(businessFlow);
  const businessFlowStale = businessFlowExists &&
    workspace.feasibilityBusinessFlow?.fingerprint !== requirementSource.snapshot.fingerprint;
  const contextExists = Boolean(
    workspace.feasibilityContextModel &&
      workspace.feasibilityContextPlantUml &&
      workspace.feasibilityContextSvg,
  );
  const contextStale = Boolean(
    contextExists &&
      workspace.feasibilityContextFingerprint !== currentContextFingerprint,
  );
  const currentImplementationFingerprint = buildFeasibilityImplementationFingerprint({
    rules,
    requirementBaseline: requirementSource.baseline,
    contextModel: workspace.feasibilityContextModel,
    businessFlow,
    inputs: workspace.feasibilityInputs,
  });
  const implementationPlan = workspace.feasibilityImplementationPlan;
  const recommendedImplementation = implementationPlan?.candidates.find(
    (candidate) => candidate.id === implementationPlan.recommendedCandidateId,
  )?.implementation;
  const implementationExists = Boolean(
    implementationPlan && recommendedImplementation,
  );
  const implementationStale = Boolean(
    implementationExists && (!contextExists || contextStale || !businessFlowExists || businessFlowStale ||
      workspace.feasibilityImplementationFingerprint !== currentImplementationFingerprint),
  );
  const contextStatus: FeasibilityArtifactStatus = !contextExists
    ? "missing"
    : contextStale
      ? "stale"
      : "ready";
  const implementationStatus: FeasibilityArtifactStatus = !implementationExists
    ? "missing"
    : implementationStale
      ? "stale"
      : "ready";
  const businessFlowStatus: FeasibilityArtifactStatus = !businessFlowExists ? "missing" : businessFlowStale ? "stale" : "ready";
  const missingDependencies: FeasibilityArtifactKind[] = [];
  if (contextStatus !== "ready") missingDependencies.push("context");
  if (businessFlowStatus !== "ready") missingDependencies.push("business-flow");
  const requiredArtifacts: FeasibilityArtifactKind[] = implementationStatus !== "ready" || missingDependencies.length
    ? [...missingDependencies, "implementation"] : [];
  return {
    businessFlowExists,
    businessFlowStale,
    businessFlowStatus,
    missingDependencies,
    contextExists,
    contextStale,
    contextStatus,
    implementationExists,
    implementationStale,
    implementationStatus,
    reportReady:
      contextStatus === "ready" && businessFlowStatus === "ready" && implementationStatus === "ready",
    requiredArtifacts,
    currentContextFingerprint,
    currentImplementationFingerprint,
    requirementSource: requirementSource.snapshot,
  };
}

export function includeFeasibilityDependencies(
  selected: FeasibilityArtifactKind[],
  state: ReturnType<typeof feasibilityArtifactState>,
): FeasibilityArtifactKind[] {
  const next = new Set(selected);
  if (next.has("implementation")) state.missingDependencies.forEach((kind) => next.add(kind));
  return (["context", "business-flow", "implementation"] as const).filter((kind) => next.has(kind));
}
