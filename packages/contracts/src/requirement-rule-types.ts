// Defines the single user-facing requirement type and deterministic model routing.
import { z } from "zod";
import type { DiagramKind } from "./requirements.js";

export const requirementRuleTypeSchema = z.enum([
  "functional", "business-rule", "data", "interaction", "interface", "exception", "quality", "operations",
]);
export type RequirementRuleType = z.infer<typeof requirementRuleTypeSchema>;

// Model membership is a product contract. Element-level evidence is stored separately.
export const REQUIREMENT_MODEL_RULE_TYPES = {
  context: ["functional", "interface"],
  function: ["functional"],
  activity: ["functional", "business-rule", "interface", "exception"],
  usecase: ["functional", "business-rule", "data", "interface", "exception", "quality"],
  class: ["data", "business-rule"],
  prototype: ["interaction", "functional", "quality"],
  deployment: ["operations", "interface", "quality"],
  // Analysis inherits the use-case source set; generation still consumes its event flows.
  analysis: ["functional", "business-rule", "data", "interface", "exception", "quality"],
} as const satisfies Record<DiagramKind, readonly RequirementRuleType[]>;

export function requirementTypeAppliesToModel(type: RequirementRuleType, diagram: DiagramKind): boolean {
  return (REQUIREMENT_MODEL_RULE_TYPES[diagram] as readonly RequirementRuleType[]).includes(type);
}

export function requirementModelsForType(type: RequirementRuleType): DiagramKind[] {
  // The environment diagram belongs to feasibility, not the requirement model selector.
  return (Object.keys(REQUIREMENT_MODEL_RULE_TYPES) as DiagramKind[])
    .filter(diagram => diagram !== "context" && requirementTypeAppliesToModel(type, diagram));
}
