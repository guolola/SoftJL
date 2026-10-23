// Model membership is determined by type; element-level references never change this set.
import type { DiagramKind, RequirementRule } from "./requirements.js";
import type { DiagramModelSpec, RequirementModelTraceabilityEntry } from "../modeling/models.js";
import { candidateRulesForDiagram } from "./requirement-model-inputs.js";

export function requirementModelSources(input: {
  diagram: DiagramKind;
  rules: readonly RequirementRule[];
  models: readonly DiagramModelSpec[] | Partial<Record<string, DiagramModelSpec>>;
  traceability: readonly RequirementModelTraceabilityEntry[];
  stale?: boolean;
}) {
  const rules = candidateRulesForDiagram(input.rules, input.diagram);
  return { mode: "mapped" as const, rules };
}
