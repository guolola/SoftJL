// Describes emitted UML labels, ownership and legitimate auxiliary shapes for structural review.
import { getModelGraphElements, type AnyDiagramModel, type ModelRenderMapping } from "@uml-platform/contracts";
import { umlAlias } from "./plantuml-text.js";

export function completeRenderMapping(model: AnyDiagramModel, source: string, mapping: ModelRenderMapping): ModelRenderMapping {
  const lines = source.split("\n");
  const graph = getModelGraphElements(model);
  const items = new Map(graph.map((item) => [item.id, item]));
  const valueAt = (path: string): Record<string, unknown> => path.split(".").reduce<any>((value, key) => value?.[key], model) ?? {};
  const edges = "messages" in model ? model.messages : model.relationships;
  const auxiliary: NonNullable<ModelRenderMapping["auxiliary"]> = [];
  const add = (kind: string, item: { id: string; name?: string }, alias = umlAlias(item.id)) => auxiliary.push({ kind, elementId: item.id, label: item.name, alias });
  if (model.diagramKind === "usecase") model.systemBoundaries.forEach((item) => add("system-boundary", item));
  if (model.diagramKind === "activity") model.swimlanes.forEach((item) => add("swimlane", item, `lane_${umlAlias(item.id)}`));
  if (model.diagramKind === "analysis" || model.diagramKind === "sequence") {
    model.fragments.forEach((item) => auxiliary.push({ kind: `fragment:${item.type}`, elementId: item.id, label: item.label }));
    (model.activations ?? []).forEach((item) => auxiliary.push({ kind: "activation", elementId: item.id, ownerId: item.participantId }));
    auxiliary.push({ kind: "autonumber" }, { kind: "title", label: model.title });
  }
  for (const line of lines) if (line.trimStart().startsWith("note ")) auxiliary.push({ kind: "note", label: line.slice(line.indexOf(":") + 1).trim() });
  if (lines.some((line) => line.startsWith("legend"))) auxiliary.push({ kind: "legend" });
  return {
    ...mapping, auxiliary,
    elements: mapping.elements.map((entry) => {
      const item = items.get(entry.elementId), data = item ? valueAt(item.path) : {};
      // Source statements are captured from actual output, rather than reconstructed expectations.
      const statement = entry.statement ?? lines.find((line) => line.includes(`as ${entry.alias}`) || line.trim() === `<> ${entry.alias}`);
      const ownerId = item?.ownerId ?? data.actorOrLane ?? data.systemBoundaryId ?? data.packageId ?? data.parentId;
      return { ...entry, label: item?.name, kind: item?.kind, statement, ...(typeof ownerId === "string" ? { ownerId } : {}) };
    }),
    relationships: mapping.relationships.map((entry) => {
      const edge = edges.find((item) => item.id === entry.relationshipId);
      const identityLine = lines.indexOf(`' @relationship ${umlAlias(entry.relationshipId)}`);
      const statement = entry.statement ?? (identityLine >= 0 ? lines[identityLine + 1] : lines.find((line) => line.includes(umlAlias(entry.sourceId)) && line.includes(umlAlias(entry.targetId)) && /--|\.\.|@containment/.test(line)));
      return { ...entry, label: edge && ("name" in edge ? edge.name : "label" in edge ? edge.label : "guard" in edge ? edge.guard ?? edge.condition : undefined), symbol: entry.symbol ?? (model.diagramKind === "activity" ? "-->" : undefined), statement };
    }),
  };
}
