// Model membership is determined by type; element-level references never change this set.
import type { DiagramKind, RequirementRule } from "./requirements.js";
import type { DiagramModelSpec, RequirementModelTraceabilityEntry } from "./models.js";
import { candidateRulesForDiagram } from "./requirement-model-inputs.js";

export function requirementModelSources(input: {
  diagram: DiagramKind;
  rules: readonly RequirementRule[];
  models: readonly DiagramModelSpec[] | Partial<Record<string, DiagramModelSpec>>;
  traceability: readonly RequirementModelTraceabilityEntry[];
  stale?: boolean;
}) {
  const rules = candidateRulesForDiagram(input.rules, input.diagram);
  const ids = new Set(rules.map(rule => rule.id));
  const pendingCount = input.stale ? 0 : new Set(input.traceability.filter(entry =>
    ids.has(entry.ruleId) && entry.target.diagramKind === input.diagram && entry.reviewStatus === "pending",
  ).map(entry => entry.ruleId)).size;
  return { mode: "mapped" as const, rules, pendingCount };
}
