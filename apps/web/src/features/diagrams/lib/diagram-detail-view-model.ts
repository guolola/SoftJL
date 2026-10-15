// Owns pure diagram detail derivation helpers shared by model editor and read-only detail views.
import type {
  DiagramDetailItem,
  DiagramRelationshipDetail,
} from "../../../entities/diagram/lib/model-details";

function getFieldValue(
  fields: DiagramRelationshipDetail["fields"],
  label: string,
) {
  return fields.find((field) => field.label === label)?.value ?? "";
}

export function getRelationEndpointLabel(
  relation: DiagramRelationshipDetail,
  itemsById: Map<string, DiagramDetailItem>,
  endpoint: "source" | "target",
) {
  const id = endpoint === "source" ? relation.sourceId : relation.targetId;
  return itemsById.get(id)?.label ?? id;
}

export function getRelationDisplayLabel(
  relation: DiagramRelationshipDetail,
  itemsById: Map<string, DiagramDetailItem>,
) {
  const explicit =
    relation.label &&
    relation.label !== `${relation.sourceId} -> ${relation.targetId}`
      ? relation.label
      : "";
  const descriptive =
    explicit ||
    getFieldValue(relation.fields, "说明") ||
    getFieldValue(relation.fields, "标签") ||
    getFieldValue(relation.fields, "条件") ||
    getFieldValue(relation.fields, "守卫");

  if (descriptive) return descriptive;
  return `${getRelationEndpointLabel(
    relation,
    itemsById,
    "source",
  )} → ${getRelationEndpointLabel(relation, itemsById, "target")}`;
}

export function isRelationConnectedTo(
  relation: DiagramRelationshipDetail,
  element: DiagramDetailItem | undefined,
) {
  if (!element) return false;
  return relation.sourceId === element.id || relation.targetId === element.id;
}

export function matchesItemSearch(item: DiagramDetailItem, query: string) {
  if (!query) return true;
  const lower = query.toLowerCase();
  return [
    item.label,
    item.id,
    item.description ?? "",
    ...item.fields.flatMap((field) => [field.label, field.value]),
    ...(item.sections ?? []).flatMap((section) => [
      section.title,
      section.summary ?? "",
      ...(section.fields ?? []).flatMap((field) => [
        field.label,
        field.value,
      ]),
      ...section.items.flatMap((sectionItem) => [
        sectionItem.title,
        sectionItem.description ?? "",
        ...sectionItem.fields.flatMap((field) => [field.label, field.value]),
      ]),
    ]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(lower);
}

export function getModelText(
  model: unknown,
  key: "title" | "summary",
  fallback: string,
) {
  if (model && typeof model === "object" && key in model) {
    const value = (model as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return fallback;
}

export function getRelationAccentClass(index: number) {
  const classes = [
    "border-l-primary",
    "border-l-muted-foreground/60",
    "border-l-foreground/60",
  ];
  return classes[index % classes.length];
}
