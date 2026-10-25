// Every real task rule is available as upstream provenance, regardless of its classification.
import type { DiagramKind, RequirementRule } from "./requirements.js";

export function candidateRulesForDiagram(rules: readonly RequirementRule[], _diagram: DiagramKind): RequirementRule[] {
  return [...rules];
}
