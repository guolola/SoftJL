// Builds a deterministic project read model for requirement coverage across generated stages.
import type { FeasibilityCandidateImplementation } from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { feasibilityArtifactState } from "./feasibility-freshness";

export interface CrossStageRequirementCoverageRow {
  ruleId: string;
  context: boolean;
  implementation: boolean;
  requirementModel: boolean;
  designModel: boolean;
  explicitAssumptions: number;
}

function collectImplementationCoverage(
  implementation: FeasibilityCandidateImplementation,
  covered: Set<string>,
) {
  const add = (ids?: readonly string[]) =>
    (ids ?? []).forEach((id) => covered.add(id));
  (implementation.architecture?.modules ?? []).forEach((item) =>
    add(item.sourceRequirementIds));
  add(implementation.dataStrategy?.sourceRequirementIds);
  (implementation.integrations ?? []).forEach((item) =>
    add(item.sourceRequirementIds));
  add(implementation.deploymentAndOperations?.sourceRequirementIds);
  add(implementation.securityAndCompliance?.sourceRequirementIds);
  (implementation.milestones ?? []).forEach((item) =>
    add(item.sourceRequirementIds));
  (implementation.costEstimates ?? []).forEach((item) =>
    add(item.sourceRequirementIds));
  (implementation.benefitEstimates ?? []).forEach((item) =>
    add(item.sourceRequirementIds));
  (implementation.risks ?? []).forEach((item) => add(item.sourceRequirementIds));
}

function countExplicitAssumptions(workspace: WorkspaceRecord) {
  let count = 0;
  for (const candidate of workspace.feasibilityImplementationPlan?.candidates ?? []) {
    if (
      (candidate.sourceRequirementIds ?? []).length === 0 &&
      (candidate.assumption ?? "").trim()
    ) count += 1;
    const implementation = candidate.implementation;
    if (!implementation) continue;
    const sourceItems = [
      ...(implementation.architecture?.modules ?? []),
      implementation.dataStrategy,
      ...(implementation.integrations ?? []),
      implementation.deploymentAndOperations,
      implementation.securityAndCompliance,
      ...(implementation.milestones ?? []),
      ...(implementation.costEstimates ?? []),
      ...(implementation.benefitEstimates ?? []),
      ...(implementation.risks ?? []),
    ].filter(Boolean);
    count += sourceItems.filter(
      (item) =>
        (item?.sourceRequirementIds ?? []).length === 0 &&
        (item?.assumption ?? "").trim(),
    ).length;
  }
  return count;
}

export function buildCrossStageRequirementCoverage(workspace: WorkspaceRecord) {
  const states = feasibilityArtifactState(workspace);
  const acceptedRuleIds = new Set(states.requirementSource.ruleIds);
  const contextCovered = new Set(
    workspace.feasibilityContextTraceability.map((entry) => entry.requirementId),
  );
  const implementationCovered = new Set<string>();
  for (const candidate of workspace.feasibilityImplementationPlan?.candidates ?? []) {
    (candidate.sourceRequirementIds ?? []).forEach((id) =>
      implementationCovered.add(id));
    if (candidate.implementation) {
      collectImplementationCoverage(candidate.implementation, implementationCovered);
    }
  }
  const requirementCovered = new Set(
    workspace.requirementModelTraceability.map((entry) => entry.ruleId),
  );
  const requirementRulesByElement = new Map<string, Set<string>>();
  for (const entry of workspace.requirementModelTraceability) {
    const key = `${entry.target.modelId}:${entry.target.elementId}`;
    const rules = requirementRulesByElement.get(key) ?? new Set<string>();
    rules.add(entry.ruleId);
    requirementRulesByElement.set(key, rules);
  }
  const designCovered = new Set<string>();
  for (const entry of workspace.designModelTraceability) {
    const key = `${entry.source.modelId}:${entry.source.elementId}`;
    for (const ruleId of requirementRulesByElement.get(key) ?? []) {
      designCovered.add(ruleId);
    }
  }
  const referencedIds = new Set([
    ...contextCovered,
    ...implementationCovered,
    ...requirementCovered,
    ...designCovered,
  ]);
  const unknownReferences = [...referencedIds].filter((id) => !acceptedRuleIds.has(id));
  const assumptions = countExplicitAssumptions(workspace);

  return {
    requirementSource: states.requirementSource,
    sourceConsistent:
      unknownReferences.length === 0 &&
      !states.contextStale &&
      !states.implementationStale,
    needsUpdate:
      unknownReferences.length > 0 ||
      states.contextStale ||
      states.implementationStale,
    unknownReferences,
    explicitAssumptions: assumptions,
    rows: states.requirementSource.ruleIds.map((ruleId) => ({
      ruleId,
      context: contextCovered.has(ruleId),
      implementation: implementationCovered.has(ruleId),
      requirementModel: requirementCovered.has(ruleId),
      designModel: designCovered.has(ruleId),
      explicitAssumptions: assumptions,
    } satisfies CrossStageRequirementCoverageRow)),
  };
}
