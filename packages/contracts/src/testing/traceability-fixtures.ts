// Measures frozen demo fixture coverage without accepting aliases or inventing source mappings.
import { requirementTypeAppliesToModel, type DiagramModelSpec, type ModelElementRef, type RequirementModelTraceabilityEntry, type RequirementRule } from "@uml-platform/contracts";
import { collectModelRefs } from "../modeling/model-element-refs.js";
const key = (ref: ModelElementRef) => JSON.stringify([ref.modelId ?? ref.diagramKind, ref.diagramKind, ref.elementId]);
export function requirementTraceabilityCoverage(bindings: RequirementModelTraceabilityEntry[], rules: RequirementRule[], models: DiagramModelSpec[]) {
  const byId = new Map(rules.map(rule => [rule.id, rule]));
  const covered = new Set(bindings.filter(binding => {
    const rule = byId.get(binding.ruleId);
    return rule && requirementTypeAppliesToModel(rule.type, binding.target.diagramKind as DiagramModelSpec["diagramKind"]);
  }).map(binding => key(binding.target)));
  return { missingTargets: collectModelRefs(models).refs.filter(ref => !covered.has(key(ref))) };
}
