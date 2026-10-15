// Validates context boundaries, identifiers, endpoints, and requirement references before persistence.
import {
  contextDiagramSpecSchema, validateModelInput, ModelSemanticError,
  type ContextDiagramSpec,
} from "@uml-platform/contracts";

export function normalizeContextDiagram(
  value: unknown,
  validRequirementIds: ReadonlySet<string>,
): ContextDiagramSpec {
  const diagnostics = validateModelInput(value, "feasibility");
  if (diagnostics.length) throw new ModelSemanticError(diagnostics);
  const model = contextDiagramSpecSchema.parse(value);
  const elementIds = new Set<string>();
  for (const element of [model.system, ...model.people, ...model.externalSystems]) {
    if (elementIds.has(element.id)) {
      throw new Error(`上下文元素编号重复：${element.id}`);
    }
    elementIds.add(element.id);
    for (const requirementId of element.sourceRequirementIds) {
      if (!validRequirementIds.has(requirementId)) {
        throw new Error(`上下文元素引用了不存在的需求规则：${requirementId}`);
      }
    }
  }
  const relationshipIds = new Set<string>();
  for (const relationship of model.relationships) {
    if (relationshipIds.has(relationship.id)) {
      throw new Error(`上下文关系编号重复：${relationship.id}`);
    }
    relationshipIds.add(relationship.id);
    if (!elementIds.has(relationship.sourceId) || !elementIds.has(relationship.targetId)) {
      throw new Error(`上下文关系端点无效：${relationship.id}`);
    }
    for (const requirementId of relationship.sourceRequirementIds) {
      if (!validRequirementIds.has(requirementId)) {
        throw new Error(`上下文关系引用了不存在的需求规则：${requirementId}`);
      }
    }
  }
  return model;
}
