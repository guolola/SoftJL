// Adapts ordinary model records to the professional detail components without changing their persistence contract.
import type { StandardDiagramKind, StandardModel } from "@uml-platform/contracts";
import type { DiagramDetailModel, SemanticElementKind } from "../../../entities/diagram/lib/model-details";

export const standardNodeKinds: Record<StandardModel["nodes"][number]["type"], SemanticElementKind> = {
  system: "system-boundary", module: "module", actor: "actor", usecase: "usecase",
  start: "start-node", end: "end-node", action: "activity", decision: "decision",
  component: "component", entity: "class", class: "class", table: "table", participant: "participant",
};

export const standardNodeTypes: Record<StandardDiagramKind, StandardModel["nodes"][number]["type"][]> = {
  function: ["system", "module"], usecase: ["actor", "usecase"], activity: ["start", "end", "action", "decision"],
  architecture: ["component", "module"], er: ["entity"], class: ["class"], sequence: ["participant"], table: ["table"],
};
export const standardRelationTypes: Record<StandardDiagramKind, StandardModel["edges"][number]["relation"][]> = {
  function: ["association"], activity: ["association"], architecture: ["association", "composition", "aggregation"],
  usecase: ["association", "include", "extend", "inheritance"], er: ["association"], table: ["association"],
  class: ["association", "inheritance", "composition", "aggregation"], sequence: ["association", "return"],
};

export function buildStandardDiagramDetail(model?: StandardModel): DiagramDetailModel {
  const items = (model?.nodes ?? []).map(node => ({
    id: node.id, label: node.label, kind: standardNodeKinds[node.type],
    description: [...node.fields, ...node.methods].join(" · "),
    fields: [
      ...(node.fields.length ? [{ label: "字段", value: node.fields.join("\n") }] : []),
      ...(node.methods.length ? [{ label: "操作", value: node.methods.join("\n") }] : []),
    ],
  }));
  const kinds = [...new Set(items.map(item => item.kind))];
  return {
    items,
    groups: kinds.map(kind => ({ kind, label: kind, items: items.filter(item => item.kind === kind) })),
    relationships: (model?.edges ?? []).map(edge => ({
      id: edge.id, kind: "relationship", label: edge.label, typeLabel: edge.relation,
      sourceId: edge.from, targetId: edge.to,
      fields: [
        ...(edge.fromCardinality ? [{ label: "源多重性", value: edge.fromCardinality }] : []),
        ...(edge.toCardinality ? [{ label: "目标多重性", value: edge.toCardinality }] : []),
      ],
    })),
  };
}
