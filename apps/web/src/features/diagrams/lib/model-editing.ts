// Owns pure diagram model draft helpers used by the diagram detail editor UI.
import { getStageModelSchema, contractResponseSchema, type ModelingStage } from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "../../../entities/diagram/model";
import type { DiagramDetailItem } from "../../../entities/diagram/lib/model-details";

export type EditableCollection = {
  key: string;
  label: string;
  nameKey: string;
  create: () => Record<string, unknown>;
  singleton?: boolean;
  allowCreate?: boolean;
  allowDelete?: boolean;
};

export const EDITABLE_COLLECTIONS: Record<string, EditableCollection[]> = {
  context: [
    {
      key: "system",
      label: "中心系统",
      nameKey: "name",
      singleton: true,
      allowCreate: false,
      allowDelete: false,
      create: () => ({ id: "system", name: "目标系统", sourceRequirementIds: [] }),
    },
    {
      key: "people",
      label: "人员",
      nameKey: "name",
      create: () => ({
        id: createDraftId("person"),
        name: "新人员",
        description: "",
        sourceRequirementIds: [],
      }),
    },
    {
      key: "externalSystems",
      label: "外部系统",
      nameKey: "name",
      create: () => ({
        id: createDraftId("external"),
        name: "新外部系统",
        description: "",
        sourceRequirementIds: [],
      }),
    },
  ],
  usecase: [
    {
      key: "actors",
      label: "角色",
      nameKey: "name",
      create: () => ({
        id: createDraftId("actor"),
        name: "新角色",
        actorType: "human",
        responsibilities: [],
      }),
    },
    {
      key: "useCases",
      label: "用例",
      nameKey: "name",
      create: () => ({
        id: createDraftId("uc"),
        name: "新用例",
        goal: "补充目标",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
        eventFlows: [],
        extensionPoints: [],
      }),
    },
    {
      key: "systemBoundaries",
      label: "系统边界",
      nameKey: "name",
      create: () => ({ id: createDraftId("system"), name: "新系统边界" }),
    },
  ],
  class: [
    {
      key: "classes",
      label: "类",
      nameKey: "name",
      create: () => ({
        id: createDraftId("cls"),
        name: "NewClass",
        classKind: "entity",
        attributes: [],
        operations: [],
      }),
    },
    {
      key: "interfaces",
      label: "接口",
      nameKey: "name",
      create: () => ({ id: createDraftId("if"), name: "NewInterface", operations: [] }),
    },
    {
      key: "enums",
      label: "枚举",
      nameKey: "name",
      create: () => ({ id: createDraftId("enum"), name: "NewEnum", literals: ["VALUE"] }),
    },
  ],
  activity: [
    {
      key: "swimlanes",
      label: "泳道",
      nameKey: "name",
      create: () => ({ id: createDraftId("lane"), name: "新泳道" }),
    },
    {
      key: "nodes",
      label: "活动节点",
      nameKey: "name",
      create: () => ({
        id: createDraftId("act"),
        type: "activity",
        name: "新活动",
        input: [],
        output: [],
      }),
    },
  ],
  deployment: [
    {
      key: "nodes",
      label: "部署节点",
      nameKey: "name",
      create: () => ({ id: createDraftId("node"), name: "新节点", nodeType: "device" }),
    },
    {
      key: "databases",
      label: "数据库",
      nameKey: "name",
      create: () => ({ id: createDraftId("db"), name: "新数据库" }),
    },
    {
      key: "components",
      label: "组件",
      nameKey: "name",
      create: () => ({ id: createDraftId("cmp"), name: "新组件" }),
    },
    {
      key: "externalSystems",
      label: "外部系统",
      nameKey: "name",
      create: () => ({ id: createDraftId("ext"), name: "新外部系统" }),
    },
    {
      key: "artifacts",
      label: "制品",
      nameKey: "name",
      create: () => ({ id: createDraftId("artifact"), name: "新制品" }),
    },
  ],
  sequence: [
    {
      key: "participants",
      label: "参与对象",
      nameKey: "name",
      create: () => ({
        id: createDraftId("participant"),
        name: "新参与对象",
        participantType: "entity",
      }),
    },
    {
      key: "fragments",
      label: "组合片段",
      nameKey: "label",
      create: () => ({ id: createDraftId("fragment"), type: "opt", label: "新片段", messageIds: [] }),
    },
  ],
  table: [
    {
      key: "tables",
      label: "数据表",
      nameKey: "name",
      create: () => ({
        id: createDraftId("table"),
        name: "new_table",
        relationalConstraints: [{ id: "pk", type: "primary-key", columnIds: ["id"] }],
        columns: [
          {
            id: "id",
            name: "id",
            dataType: "string",
            isPrimaryKey: true,
            isForeignKey: false,
            nullable: false,
          },
        ],
      }),
    },
  ],
};

// These models share collection mechanics, but their schemas and semantics remain stage-specific.
const collection = (key: string, label: string, fields: Record<string, unknown> = {}): EditableCollection => ({ key, label, nameKey: "name", create: () => ({ id: createDraftId(key), name: `新${label}`, ...structuredClone(fields) }) });
EDITABLE_COLLECTIONS.function = [collection("nodes", "功能", { sourceRequirementIds: [] })];
EDITABLE_COLLECTIONS.prototype = [collection("nodes", "页面或模块", { nodeType: "screen", sourceUseCaseIds: [], sourceRequirementIds: [] })];
EDITABLE_COLLECTIONS.navigation = EDITABLE_COLLECTIONS.prototype!;
EDITABLE_COLLECTIONS.architecture = [collection("packages", "包"), collection("components", "组件", { sourceRequirementIds: [] })];
EDITABLE_COLLECTIONS.component = [collection("components", "组件", { sourceClassIds: [] }), collection("interfaces", "接口", { operationNames: [] })];
EDITABLE_COLLECTIONS.sequence!.push({ key: "activations", label: "激活区间", nameKey: "id", create: () => ({ id: createDraftId("activation"), participantId: "", startMessageId: "", endMessageId: "" }) });
EDITABLE_COLLECTIONS.analysis = EDITABLE_COLLECTIONS.sequence!;

/** Drafts can be incomplete; this endpoint inventory never parses or drops their contents. */
export function draftGraphElements(model: Record<string, unknown>): Array<{ id: string; kind: string; name: string }> {
  const kinds: Record<string, string> = { actors: "actor", useCases: "usecase", classes: "class", interfaces: "interface", enums: "enum", packages: "package", components: "component", artifacts: "artifact", databases: "execution-environment", externalSystems: "external", people: "person", tables: "table" };
  const result: Array<{ id: string; kind: string; name: string }> = [];
  if (model.diagramKind === "context" && model.system) { const item = model.system as Record<string, unknown>; result.push({ id: stringValue(item.id), kind: "system", name: stringValue(item.name) }); }
  for (const [key, value] of Object.entries(model)) if (Array.isArray(value) && (key in kinds || ["nodes", "participants"].includes(key))) for (const item of value) {
    result.push({ id: stringValue(item.id), name: stringValue(item.name ?? item.question ?? item.id), kind: kinds[key] ?? (model.diagramKind === "function" ? "function" : stringValue(item.type ?? item.nodeType ?? item.participantType)) });
    for (const pins of ["inputPins", "outputPins"]) for (const pin of Array.isArray(item[pins]) ? item[pins] : []) result.push({ id: stringValue(pin.id), name: `${stringValue(item.name)} / ${stringValue(pin.name)}`, kind: pins === "inputPins" ? "input-pin" : "output-pin" });
  }
  return result;
}

export function createDraftId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function cloneDraftModel(model: unknown) {
  return structuredClone(model) as Record<string, unknown>;
}

export function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function draftFingerprint(model: Record<string, unknown> | null) {
  return model ? JSON.stringify(model) : "";
}

export function designSourceLabel(
  diagram: DesignDiagramType,
  model: Record<string, unknown> | null,
) {
  if (diagram === "sequence") {
    const useCaseName = stringValue(model?.sourceUseCaseName).trim();
    if (useCaseName) {
      return `来源：需求阶段用例模型事件流 + 需求分析模型（用例：${useCaseName}）`;
    }
    const useCaseId = stringValue(model?.sourceUseCaseId).trim();
    if (useCaseId) {
      return `来源：需求阶段用例模型事件流 + 需求分析模型（用例ID：${useCaseId}）`;
    }
    return "来源：需求阶段用例模型事件流 + 需求分析模型（具体用例未标明）";
  }
  if (diagram === "navigation") {
    return "来源：需求阶段原型界面关系 + 设计阶段用例实现设计";
  }
  if (diagram === "class") {
    return "来源：需求阶段领域概念模型 + 设计阶段用例实现设计";
  }
  if (diagram === "deployment") {
    return "来源：需求阶段部署需求模型 + 设计阶段用例实现设计";
  }
  return "来源：设计阶段设计类图 + 设计阶段用例实现设计";
}

export function requirementSourceLabel(
  diagram: DiagramType,
  model: Record<string, unknown> | null,
  rules: Array<{ id?: string }>,
) {
  if (diagram === "analysis") {
    const useCaseName = stringValue(model?.sourceUseCaseName).trim();
    if (useCaseName) {
      return `来源：用例模型事件流（用例：${useCaseName}）`;
    }
    const useCaseId = stringValue(model?.sourceUseCaseId).trim();
    if (useCaseId) {
      return `来源：用例模型事件流（用例ID：${useCaseId}）`;
    }
    return "来源：用例模型事件流（具体用例未标明）";
  }
  if (rules.length === 0) {
    return "来源：需求规则（未标明）";
  }
  const visibleRuleIds = rules
    .slice(0, 5)
    .map((rule) => rule.id.trim().toUpperCase())
    .filter(Boolean);
  if (visibleRuleIds.length === 0) {
    return "来源：需求规则（未标明）";
  }
  const suffix = rules.length > visibleRuleIds.length ? ` +${rules.length - visibleRuleIds.length}` : "";
  return `来源：需求规则（${visibleRuleIds.join("、")}${suffix}）`;
}

export function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function uniqueNonEmptyStrings(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  );
}

export function diagramHighlightAliases(element: DiagramDetailItem | undefined) {
  if (!element) return [];
  const fieldAliases = element.fields
    .filter((field) => ["中文名称", "英文名称"].includes(field.label))
    .map((field) => field.value);
  const idTail = element.id.includes(".") ? element.id.split(".").at(-1) : "";
  const labelTail = element.label.includes(".") ? element.label.split(".").at(-1) : "";
  return uniqueNonEmptyStrings([
    ...fieldAliases,
    idTail,
    labelTail,
  ]).filter((alias) => alias !== element.label);
}

export function textToStringList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function setOptionalStringValue(
  record: Record<string, unknown>,
  key: string,
  value: string,
) {
  if (value.trim()) {
    record[key] = value;
  } else {
    delete record[key];
  }
}

export function editableCollectionsFor(model: unknown, stage: ModelingStage = "requirements") {
  const diagramKind =
    model && typeof model === "object"
      ? String((model as Record<string, unknown>).diagramKind ?? "")
      : "";
  const schema = getStageModelSchema(stage, diagramKind);
  const properties = schema ? contractResponseSchema(schema).properties : {};
  return (EDITABLE_COLLECTIONS[diagramKind] ?? []).filter((item) => properties[item.key] && properties[item.key].maxItems !== 0);
}

export function collectionItems(draft: Record<string, unknown>, collection: EditableCollection) {
  if (collection.singleton) {
    const item = draft[collection.key];
    return item && typeof item === "object"
      ? [item as Record<string, unknown>]
      : [];
  }
  return Array.isArray(draft[collection.key])
    ? (draft[collection.key] as Array<Record<string, unknown>>)
    : [];
}

export function itemLabel(item: Record<string, unknown>, collection: EditableCollection) {
  const value =
    item.type === "decision" && typeof item.question === "string"
      ? item.question
      : item[collection.nameKey];
  return typeof value === "string" ? value : "";
}

export function setItemLabel(item: Record<string, unknown>, collection: EditableCollection, value: string) {
  if (item.type === "decision" && "question" in item) {
    item.question = value;
    return;
  }
  item[collection.nameKey] = value;
}

export function relationshipItems(draft: Record<string, unknown>) {
  if (["analysis", "sequence"].includes(String(draft.diagramKind))) {
    return Array.isArray(draft.messages)
      ? (draft.messages as Array<Record<string, unknown>>)
      : [];
  }
  return Array.isArray(draft.relationships)
    ? (draft.relationships as Array<Record<string, unknown>>)
    : [];
}

export function relationName(relation: Record<string, unknown>) {
  return String(relation.label ?? relation.name ?? relation.condition ?? relation.description ?? "");
}

export function setRelationName(relation: Record<string, unknown>, value: string) {
  if ("name" in relation) {
    relation.name = value || "关系";
  } else {
    relation.label = value || undefined;
  }
}

export function relationEndpointKey(draft: Record<string, unknown>, endpoint: "source" | "target") {
  if (draft.diagramKind === "table") return endpoint === "source" ? "sourceTableId" : "targetTableId";
  return endpoint === "source" ? "sourceId" : "targetId";
}

export function updateDraftCollection(
  draft: Record<string, unknown>,
  collection: EditableCollection,
  updater: (items: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
) {
  if (collection.singleton) {
    const nextItems = updater(collectionItems(draft, collection));
    return nextItems[0] ? { ...draft, [collection.key]: nextItems[0] } : draft;
  }
  return { ...draft, [collection.key]: updater(collectionItems(draft, collection)) };
}

export function updateDraftItem(
  draft: Record<string, unknown>,
  collection: EditableCollection,
  itemId: string,
  updater: (item: Record<string, unknown>) => Record<string, unknown>,
) {
  return updateDraftCollection(draft, collection, (items) =>
    items.map((item) => (String(item.id ?? "") === itemId ? updater(item) : item)),
  );
}

// Deleting a node keeps dependent references visible for explicit repair; no silent cascading rewrite.
export function removeDanglingRelations(draft: Record<string, unknown>) { return draft; }

export function createRelationshipDraft(draft: Record<string, unknown>, stage: ModelingStage = "requirements") {
  const endpointIds = draftGraphElements(draft)
    .map((item) => String(item.id ?? ""))
    .filter(Boolean);
  const source = endpointIds[0] ?? "";
  const target = endpointIds[1] ?? source;
  if (["analysis", "sequence"].includes(String(draft.diagramKind))) {
    return {
      id: createDraftId("msg"),
      type: "sync",
      sourceId: source,
      targetId: target,
      name: "新调用",
      parameters: [],
    };
  }
  if (draft.diagramKind === "table") {
    return {
      id: createDraftId("rel"),
      type: "one-to-many",
      sourceTableId: source,
      targetTableId: target,
      label: "新关系",
    };
  }
  if (draft.diagramKind === "context") {
    return {
      id: createDraftId("relationship"),
      sourceId: source,
      targetId: target,
      direction: "directed",
      label: "新交互",
      description: "",
      sourceRequirementIds: [],
    };
  }
  if (draft.diagramKind === "activity") {
    return {
      id: createDraftId("rel"),
      type: "control_flow",
      sourceId: source,
      targetId: target,
      condition: "新条件",
    };
  }
  return {
    id: createDraftId("rel"),
    type: relationTypeOptions(draft.diagramKind, stage)[0] ?? "association",
    sourceId: source,
    targetId: target,
    label: "新关系",
  };
}

export function relationTypeOptions(diagramKind: unknown, stage: ModelingStage = "requirements"): string[] {
  const kind = String(diagramKind);
  const contract = getStageModelSchema(stage, kind);
  if (!contract) return [];
  const schema = contractResponseSchema(contract);
  return schema.properties[kind === "analysis" || kind === "sequence" ? "messages" : "relationships"]?.items?.properties?.[kind === "context" ? "direction" : "type"]?.enum ?? [];
}

export function activityNodeForType(
  item: Record<string, unknown>,
  type: string,
) {
  const base = {
    id: item.id,
    type,
    description: item.description,
    actorOrLane: item.actorOrLane,
  };
  const name = stringValue(item.name) || stringValue(item.question);
  switch (type) {
    case "activity":
      return {
        ...base,
        name: name || "新活动",
        actorOrLane: item.actorOrLane,
        inputPins: item.inputPins,
        outputPins: item.outputPins,
        input: stringListValue(item.input),
        output: stringListValue(item.output),
      };
    case "decision":
      return {
        ...base,
        question: stringValue(item.question) || name || "条件判断",
      };
    case "object":
      return { ...base, name: name || "对象", dataType: stringValue(item.dataType) || "Object", state: item.state };
    case "flow_final":
      return { ...base, name: name || "分支结束" };
    case "start":
      return { ...base, name: name || "开始" };
    case "end":
      return { ...base, name: name || "结束" };
    case "merge":
    case "fork":
    case "join":
      return { ...base, name: name || undefined };
    default:
      return item;
  }
}
