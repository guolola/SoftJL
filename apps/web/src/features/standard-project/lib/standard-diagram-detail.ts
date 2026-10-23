// Shares engineering detail projections; Chen entities remain a separate conceptual model.
import type { StandardModel } from "@uml-platform/contracts";
import { buildDiagramDetailModel, type DiagramDetailModel } from "../../../entities/diagram/lib/model-details";

export function buildStandardDiagramDetail(model?: StandardModel): DiagramDetailModel {
  if (model?.diagramKind !== "er") return buildDiagramDetailModel(model);
  const items = model.entities.map(entity => ({
    id: entity.id, label: entity.name, kind: "class" as const,
    fields: entity.attributes.map(attribute => ({ label: attribute.isKey ? "标识属性" : "属性", value: attribute.name })),
  }));
  return {
    items, groups: [{ kind: "class", label: "实体", items }],
    relationships: model.relationships.map(relation => ({
      id: relation.id, kind: "relationship", label: relation.name, typeLabel: "association",
      sourceId: relation.sourceId, targetId: relation.targetId,
      fields: [{ label: "源基数", value: relation.sourceMultiplicity }, { label: "目标基数", value: relation.targetMultiplicity }],
    })),
  };
}
