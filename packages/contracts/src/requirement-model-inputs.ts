// Routes model inputs using the same fixed type mapping used by the UI.
import type { DiagramKind, RequirementRule } from "./requirements.js";
import { requirementTypeAppliesToModel } from "./requirement-rule-types.js";

export function candidateRulesForDiagram(rules: readonly RequirementRule[], diagram: DiagramKind): RequirementRule[] {
  return rules.filter(rule => requirementTypeAppliesToModel(rule.type, diagram));
}
