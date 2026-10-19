// Validates context graph structure and preserves declared source IDs without a coverage audit.
import {
  contextDiagramSpecSchema, validateModelInput, ModelSemanticError,
  type ContextDiagramSpec,
} from "@uml-platform/contracts";

export function normalizeContextDiagram(
  value: unknown,
  _validRequirementIds: ReadonlySet<string>,
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
  }
  return model;
}
