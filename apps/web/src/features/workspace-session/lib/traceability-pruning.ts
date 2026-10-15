// Prunes model traceability entries after manual model edits remove elements.
import type {
  DesignDiagramModelSpec,
  DesignModelTraceabilityEntry,
  DiagramModelSpec,
  ModelElementRef,
  RequirementModelTraceabilityEntry,
} from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

function compactRefValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function refKey(diagramKind: string, elementId: string, modelId?: string) {
  const scope = modelId?.trim() || diagramKind;
  return `${diagramKind}:${scope}:${elementId}`.toLowerCase();
}

function activityNodeTraceabilityKind(nodeType: unknown) {
  switch (nodeType) {
    case "decision":
      return "decision-node";
    case "object": return "object-node";
    case "flow_final": return "flow-final-node";
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

function prototypeNodeTraceabilityKind(nodeType: unknown) {
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

function isBusinessTraceabilityKind(kind: string) {
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

function collectTraceableRefKeys(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec | undefined>,
) {
  const keys = new Set<string>();
  for (const model of models) {
    if (!model) continue;
    const diagramKind = model.diagramKind;
    const record = model as unknown as Record<string, unknown>;
    const modelId = compactRefValue(record.modelId);
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
    if (model.diagramKind === "activity") for (const node of model.nodes) if (node.type === "activity") for (const pin of [...node.inputPins ?? [], ...node.outputPins ?? []]) businessElementIds.add(pin.id);

    for (const [key, defaultKind] of listKeys) {
      const items = Array.isArray(record[key]) ? record[key] : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const itemRecord = item as Record<string, unknown>;
        const id = compactRefValue(itemRecord.id);
        const kind =
          key === "nodes" && diagramKind === "activity"
            ? activityNodeTraceabilityKind(itemRecord.type)
            : key === "nodes" && (diagramKind === "prototype" || diagramKind === "navigation")
              ? prototypeNodeTraceabilityKind(itemRecord.nodeType)
              : defaultKind;
        if (id && isBusinessTraceabilityKind(kind)) {
          keys.add(refKey(diagramKind, id, modelId || undefined));
          businessElementIds.add(id);
        }
        if (key === "tables") {
          const columns = Array.isArray(itemRecord.columns)
            ? itemRecord.columns
            : [];
          for (const column of columns) {
            if (!column || typeof column !== "object") continue;
            const columnId = compactRefValue(
              (column as Record<string, unknown>).id,
            );
            if (id && columnId) {
              const columnRef = `${id}.${columnId}`;
              keys.add(refKey(diagramKind, columnRef, modelId || undefined));
              businessElementIds.add(columnRef);
            }
          }
        }
      }
    }

    const relationships = Array.isArray(record.relationships)
      ? record.relationships
      : [];
    for (const relationship of relationships) {
      if (!relationship || typeof relationship !== "object") continue;
      const relationshipRecord = relationship as Record<string, unknown>;
      if (
        diagramKind === "activity" &&
        (!businessElementIds.has(compactRefValue(relationshipRecord.sourceId)) ||
          !businessElementIds.has(compactRefValue(relationshipRecord.targetId)))
      ) {
        continue;
      }
      const id = compactRefValue(relationshipRecord.id);
      if (id) keys.add(refKey(diagramKind, id, modelId || undefined));
    }
  }
  return keys;
}

function refExists(keys: Set<string>, ref: ModelElementRef) {
  return keys.has(refKey(ref.diagramKind, ref.elementId, ref.modelId));
}

export function pruneTraceabilityForRequirementModels(input: {
  models: WorkspaceRecord["models"];
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  designModelTraceability: DesignModelTraceabilityEntry[];
}) {
  const requirementRefs = collectTraceableRefKeys(Object.values(input.models));
  const requirementModelTraceability =
    input.requirementModelTraceability.filter((entry) =>
      refExists(requirementRefs, entry.target),
    );
  const designModelTraceability = input.designModelTraceability
    .map((entry) => ({
      ...entry,
      targets: entry.targets.filter((target) =>
        refExists(requirementRefs, target),
      ),
    }))
    .filter((entry) => entry.targets.length > 0);
  return { requirementModelTraceability, designModelTraceability };
}

export function pruneTraceabilityForDesignModels(input: {
  designModels: WorkspaceRecord["designModels"];
  models: WorkspaceRecord["models"];
  designModelTraceability: DesignModelTraceabilityEntry[];
}) {
  const designRefs = collectTraceableRefKeys(Object.values(input.designModels));
  const requirementRefs = collectTraceableRefKeys(Object.values(input.models));
  return input.designModelTraceability
    .filter((entry) => refExists(designRefs, entry.source))
    .map((entry) => {
      const upstreamDesignRefs = entry.upstreamDesignRefs?.filter((ref) =>
        refExists(designRefs, ref),
      );
      return {
        ...entry,
        targets: entry.targets.filter((target) =>
          refExists(requirementRefs, target),
        ),
        ...(upstreamDesignRefs && upstreamDesignRefs.length > 0
          ? { upstreamDesignRefs }
          : { upstreamDesignRefs: undefined }),
      };
    })
    .filter((entry) => entry.targets.length > 0);
}
