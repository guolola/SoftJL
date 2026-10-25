// Collects model references; full mode includes every identified structural and nested element.
import type { DiagramModelSpec, DesignDiagramModelSpec, ModelElementRef } from "./models.js";
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

type RefMaps = {
  refs: ModelElementRef[];

};

function compactString(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function refKey(diagramKind: string, elementId: string, modelId?: string) {
  const scope = compactString(modelId) || diagramKind;
  return JSON.stringify([scope, diagramKind, elementId]);
}

function refEntryKey(
  ref: Pick<ModelElementRef, "diagramKind" | "elementId" | "modelId">,
) {
  return refKey(ref.diagramKind, ref.elementId, "modelId" in ref ? ref.modelId : undefined);
}

function addRef(
  refs: ModelElementRef[],
  diagramKind: string,
  elementId: unknown,
  elementKind: string,
  label: unknown,
  modelId?: string,
) {
  const id = compactString(elementId);
  if (!id) return;
  refs.push({
    modelId: compactString(modelId) || undefined,
    diagramKind: diagramKind as ModelElementRef["diagramKind"],
    elementId: id,
    elementKind,
    label: compactString(label) || id,
  });
}

function activityNodeKind(nodeType: unknown) {
  switch (nodeType) {
    case "activity":
      return "activity";
    case "decision":
      return "decision";
    case "start":
      return "start-node";
    case "end":
      return "end-node";
    case "merge":
      return "merge-node";
    case "fork":
      return "fork-node";
    case "join":
      return "join-node";
    default:
      return "activity-node";
  }
}

function prototypeNodeKind(nodeType: unknown) {
  switch (nodeType) {
    case "screen":
      return "screen";
    case "module":
      return "module";
    case "entry-point":
      return "entry-point";
    default:
      return "interface-node";
  }
}

function isBusinessElementKind(kind: string) {
  return ![
    "flow-final-node", "input-pin", "output-pin", "activation",
    "system-boundary",
    "swimlane",
    "start-node",
    "end-node",
    "merge-node",
    "fork-node",
    "join-node",
  ].includes(kind);
}

export function collectModelRefs(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
  includeStructuralRelationships = false,
): RefMaps {
  const refs: ModelElementRef[] = [];
  for (const model of models) {
    const diagramKind = model.diagramKind;
    const modelId = compactString((model as unknown as Record<string, unknown>).modelId);
    const record = model as unknown as Record<string, unknown>;
    const listKeys: Array<[string, string]> = [
      ["actors", "actor"],
      ["useCases", "usecase"],
      ["systemBoundaries", "system-boundary"],
      ["classes", "class"],
      ["interfaces", "interface"],
      ["enums", "enum"],
      ["swimlanes", "swimlane"],
      [
        "nodes",
        diagramKind === "function"
          ? "function"
          : diagramKind === "deployment"
            ? "deployment-node"
            : "activity-node",
      ],
      ["packages", "package"],
      ["databases", "database"],
      ["components", "component"],
      ["externalSystems", "external-system"],
      ["artifacts", "artifact"],
      ["participants", "participant"],
      ["messages", "message"],
      ["fragments", "fragment"],
      ["tables", "table"],
    ];

    const businessElementIds = new Set<string>();
    for (const [key, defaultKind] of listKeys) {
      for (const item of ensureArray(record[key])) {
        if (!isPlainRecord(item)) continue;
        const kind =
          key === "nodes" && diagramKind === "activity"
            ? activityNodeKind(item.type)
            : key === "nodes" && (diagramKind === "prototype" || diagramKind === "navigation")
              ? prototypeNodeKind(item.nodeType)
              : defaultKind;
        const beforeCount = refs.length;
        if (includeStructuralRelationships || isBusinessElementKind(kind)) {
          addRef(refs, diagramKind, item.id, kind, item.name ?? item.label, modelId);
        }
        if (refs.length > beforeCount) {
          businessElementIds.add(refs.at(-1)!.elementId);
        }
        if (key === "tables") {
          for (const column of ensureArray(item.columns)) {
            if (!isPlainRecord(column)) continue;
            const tableId = compactString(item.id);
            const columnId = compactString(column.id);
            if (!tableId || !columnId) continue;
            addRef(
              refs,
              diagramKind,
              `${tableId}.${columnId}`,
              "table-column",
              `${compactString(item.name) || tableId}.${compactString(column.name) || columnId}`,
              modelId,
            );
            businessElementIds.add(`${tableId}.${columnId}`);
          }
        }
      }
    }

    for (const relationship of ensureArray(record.relationships)) {
      if (!isPlainRecord(relationship)) continue;
      if (
        !includeStructuralRelationships && diagramKind === "activity" &&
        (!businessElementIds.has(compactString(relationship.sourceId)) ||
          !businessElementIds.has(compactString(relationship.targetId)))
      ) {
        continue;
      }
      addRef(
        refs,
        diagramKind,
        relationship.id,
        "relationship",
        relationship.label ?? `${compactString(relationship.sourceId)} -> ${compactString(relationship.targetId)}`,
        modelId,
      );
    }
    if (includeStructuralRelationships) {
      const known = new Set(refs.filter(ref => ref.diagramKind === diagramKind && ref.modelId === (modelId || undefined)).map(ref => ref.elementId));
      const visit = (value: unknown, collection: string, parentId = "") => {
        if (Array.isArray(value)) { value.forEach(item => visit(item, collection, parentId)); return; }
        if (!isPlainRecord(value)) return;
        const id = compactString(value.id);
        const qualified = id ? (parentId ? `${parentId}.${id}` : id) : parentId;
        if (id && !known.has(qualified)) {
          addRef(refs, diagramKind, qualified, collection, value.name ?? value.label ?? id, modelId);
          known.add(qualified);
        }
        for (const [field, child] of Object.entries(value)) visit(child, field, qualified);
      };
      visit(model, "");
    }
  }

  const byKey = new Map<string, ModelElementRef>();
  for (const ref of refs) {
    byKey.set(refEntryKey(ref), ref);
  }
  return { refs: Array.from(byKey.values()) };
}
