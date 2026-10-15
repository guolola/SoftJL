// Normalizes heterogeneous diagram model nodes and relations into detail rows for feature UIs.
import type {
  ActivityDiagramSpec,
  ActivityNode,
  ArchitectureDiagramSpec,
  ArchitectureRelationship,
  AnalysisSequenceDiagramSpec,
  ClassDiagramSpec,
  ClassEntity,
  ClassRelationship,
  ComponentRelationship,
  ComponentRelationshipDiagramSpec,
  ContextDiagramSpec,
  DesignDiagramModelSpec,
  DeploymentDiagramSpec,
  DeploymentRelationship,
  DiagramModelSpec,
  FunctionRelationship,
  FunctionStructureDiagramSpec,
  PrototypeInterfaceDiagramSpec,
  NavigationDiagramSpec,
  PrototypeInterfaceRelationship,
  SequenceDiagramSpec,
  SequenceMessage,
  TableDiagramSpec,
  TableRelationship,
  UseCaseDiagramSpec,
  UseCaseRelationship,
} from "@uml-platform/contracts";

export type SemanticElementKind =
  | "actor"
  | "usecase"
  | "system-boundary"
  | "function"
  | "class"
  | "interface"
  | "enum"
  | "activity"
  | "decision"
  | "start-node"
  | "end-node"
  | "merge-node"
  | "fork-node"
  | "join-node"
  | "object-node"
  | "flow-final-node"
  | "input-pin"
  | "output-pin"
  | "activation"
  | "swimlane"
  | "deployment-node"
  | "database"
  | "component"
  | "external-system"
  | "artifact"
  | "participant"
  | "message"
  | "fragment"
  | "package"
  | "table"
  | "table-column"
  | "screen"
  | "module"
  | "entry-point";

export interface DetailField {
  label: string;
  value: string;
}

export interface DetailSectionItem {
  id: string;
  title: string;
  fields: DetailField[];
  description?: string;
}

export interface DetailSection {
  id: string;
  title: string;
  summary?: string;
  fields?: DetailField[];
  items: DetailSectionItem[];
}

export interface DiagramDetailItem {
  kind: SemanticElementKind;
  id: string;
  label: string;
  description?: string;
  fields: DetailField[];
  sections?: DetailSection[];
}

export interface DiagramRelationshipDetail {
  id: string;
  kind: "relationship";
  label: string;
  typeLabel: string;
  sourceId: string;
  targetId: string;
  fields: DetailField[];
}

export interface DiagramDetailGroup {
  kind: SemanticElementKind;
  label: string;
  items: DiagramDetailItem[];
}

export interface DiagramDetailModel {
  items: DiagramDetailItem[];
  groups: DiagramDetailGroup[];
  relationships: DiagramRelationshipDetail[];
}

export const SEMANTIC_KIND_META: Record<
  SemanticElementKind,
  { label: string; shortLabel: string }
> = {
  actor: { label: "角色", shortLabel: "角色" },
  usecase: { label: "用例", shortLabel: "用例" },
  "system-boundary": { label: "系统边界", shortLabel: "边界" },
  function: { label: "功能", shortLabel: "功能" },
  class: { label: "类", shortLabel: "类" },
  interface: { label: "接口", shortLabel: "接口" },
  enum: { label: "枚举", shortLabel: "枚举" },
  "object-node": { label: "对象节点", shortLabel: "对象" },
  "flow-final-node": { label: "分支终止", shortLabel: "分支终止" },
  "input-pin": { label: "输入引脚", shortLabel: "输入" },
  "output-pin": { label: "输出引脚", shortLabel: "输出" },
  activation: { label: "激活区间", shortLabel: "激活" },
  activity: { label: "活动", shortLabel: "活动" },
  decision: { label: "判断", shortLabel: "判断" },
  "start-node": { label: "开始节点", shortLabel: "开始" },
  "end-node": { label: "结束节点", shortLabel: "结束" },
  "merge-node": { label: "合并节点", shortLabel: "合并" },
  "fork-node": { label: "并发分叉", shortLabel: "分叉" },
  "join-node": { label: "并发汇合", shortLabel: "汇合" },
  swimlane: { label: "泳道", shortLabel: "泳道" },
  "deployment-node": { label: "部署节点", shortLabel: "节点" },
  database: { label: "数据库", shortLabel: "数据库" },
  component: { label: "组件", shortLabel: "组件" },
  "external-system": { label: "外部系统", shortLabel: "外部" },
  artifact: { label: "制品", shortLabel: "制品" },
  participant: { label: "参与对象", shortLabel: "对象" },
  message: { label: "调用消息", shortLabel: "消息" },
  fragment: { label: "组合片段", shortLabel: "片段" },
  package: { label: "包", shortLabel: "包" },
  table: { label: "表", shortLabel: "表" },
  "table-column": { label: "字段", shortLabel: "字段" },
  screen: { label: "页面", shortLabel: "页面" },
  module: { label: "模块", shortLabel: "模块" },
  "entry-point": { label: "入口点", shortLabel: "入口" },
};

function pushField(fields: DetailField[], label: string, value?: string | null) {
  if (!value) {
    return;
  }
  fields.push({ label, value });
}

function joinList(values: string[]) {
  return values.length > 0 ? values.join("、") : "";
}

function compactList(values: Array<string | undefined | null>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function looksAscii(value: string) {
  return /^[A-Za-z0-9_.:-]+$/.test(value.trim());
}

function englishNameFrom(record: Record<string, unknown>, fallback: string) {
  const explicit = typeof record.englishName === "string" ? record.englishName.trim() : "";
  if (explicit) return explicit;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name && looksAscii(name)) return name;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  return id || fallback;
}

function chineseNameFrom(record: Record<string, unknown>, fallback: string) {
  const explicit = typeof record.chineseName === "string" ? record.chineseName.trim() : "";
  if (explicit) return explicit;
  return fallback;
}

function constraintsFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      )
    : [];
}

function normalizedDetailFields(
  record: Record<string, unknown>,
  fallback: string,
  typeValue: string,
  constraints: string[] = [],
): DetailField[] {
  return [
    { label: "中文名称", value: chineseNameFrom(record, "未标明") },
    { label: "英文名称", value: englishNameFrom(record, fallback) },
    { label: "类型", value: typeValue || "未标明" },
    { label: "约束", value: constraints.length > 0 ? joinList(constraints) : "无" },
  ];
}

function nonEmptyGroups(groups: DiagramDetailGroup[]) {
  return groups.filter((group) => group.items.length > 0);
}

function useCaseRelationshipLabel(relation: UseCaseRelationship) {
  const meta: Record<UseCaseRelationship["type"], string> = {
    association: "关联",
    include: "包含",
    extend: "扩展",
    generalization: "泛化",
  };
  return meta[relation.type];
}

function classRelationshipLabel(relation: ClassRelationship) {
  const meta: Record<ClassRelationship["type"], string> = {
    association: "关联",
    aggregation: "聚合",
    composition: "组合",
    inheritance: "继承",
    implementation: "实现",
    dependency: "依赖",
  };
  return meta[relation.type];
}

function deploymentRelationshipLabel(relation: DeploymentRelationship) {
  const meta: Record<DeploymentRelationship["type"], string> = {
    deployment: "部署",
    communication: "通信",
    dependency: "依赖",
    manifestation: "体现",
  };
  return meta[relation.type];
}

function tableRelationshipLabel(relation: TableRelationship) {
  const meta: Record<TableRelationship["type"], string> = {
    "one-to-one": "一对一",
    "one-to-many": "一对多",

  };
  return meta[relation.type];
}

function buildContextDetailModel(model: ContextDiagramSpec): DiagramDetailModel {
  const sourceField = (ids: string[]) => ({
    label: "来源规则",
    value: ids.length > 0 ? ids.join("、") : "不重复映射",
  });
  const systemItem: DiagramDetailItem = {
    kind: "system-boundary",
    id: model.system.id,
    label: model.system.name,
    description: model.system.description,
    fields: [sourceField(model.system.sourceRequirementIds)],
  };
  const peopleItems: DiagramDetailItem[] = model.people.map((item) => ({
    kind: "actor",
    id: item.id,
    label: item.name,
    description: item.description,
    fields: [sourceField(item.sourceRequirementIds)],
  }));
  const externalItems: DiagramDetailItem[] = model.externalSystems.map((item) => ({
    kind: "external-system",
    id: item.id,
    label: item.name,
    description: item.description,
    fields: [sourceField(item.sourceRequirementIds)],
  }));
  const relationships: DiagramRelationshipDetail[] = model.relationships.map((relation) => ({
    id: relation.id,
    kind: "relationship",
    label: relation.label,
    typeLabel: relation.direction === "bidirectional" ? "双向交互" : "有向交互",
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    fields: [
      { label: "方向", value: relation.direction === "bidirectional" ? "双向" : "有向" },
      sourceField(relation.sourceRequirementIds),
      ...(relation.description ? [{ label: "说明", value: relation.description }] : []),
    ],
  }));
  const items = [systemItem, ...peopleItems, ...externalItems];
  return {
    items,
    groups: nonEmptyGroups([
      { kind: "system-boundary", label: "中心系统", items: [systemItem] },
      { kind: "actor", label: "人员", items: peopleItems },
      { kind: "external-system", label: "外部系统", items: externalItems },
    ]),
    relationships,
  };
}

function functionRelationshipLabel(relation: FunctionRelationship) {
  const meta: Record<FunctionRelationship["type"], string> = {
    decomposition: "功能分解",

  };
  return meta[relation.type];
}

function architectureRelationshipLabel(relation: ArchitectureRelationship) {
  const meta: Record<ArchitectureRelationship["type"], string> = {
    contains: "包含",
    dependency: "依赖",
    communication: "通信",
  };
  return meta[relation.type];
}

function componentRelationshipLabel(relation: ComponentRelationship) {
  const meta: Record<ComponentRelationship["type"], string> = {
    dependency: "依赖",
    "provided-interface": "提供接口",
    "required-interface": "依赖接口",
    composition: "组合",
    communication: "通信",
  };
  return meta[relation.type];
}

function eventFlowSummary(useCase: UseCaseDiagramSpec["useCases"][number]) {
  const flows = Array.isArray(useCase.eventFlows) ? useCase.eventFlows : [];
  if (flows.length === 0) return "";
  const typeLabel: Record<string, string> = {
    main: "主事件流",
    alternative: "备选事件流",
    exception: "异常事件流",
  };
  return flows
    .map((flow) => {
      const flowSteps = Array.isArray(flow.steps) ? flow.steps : [];
      const steps = flowSteps.length > 0 ? `${flowSteps.length}步` : "未列步骤";
      const label = typeLabel[flow.flowType] ?? flow.flowType;
      return flow.name === label ? `${label}(${steps})` : `${label}:${flow.name}(${steps})`;
    })
    .join("；");
}

function compactText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function useCaseEventFlowSections(
  useCase: UseCaseDiagramSpec["useCases"][number],
): DetailSection[] {
  const flows = Array.isArray(useCase.eventFlows) ? useCase.eventFlows : [];
  if (flows.length === 0) return [];

  const typeLabel: Record<string, string> = {
    main: "主事件流",
    alternative: "备选事件流",
    exception: "异常事件流",
  };
  const actorLabel: Record<string, string> = {
    actor: "参与者",
    system: "系统",
    external: "外部系统",
  };

  return flows.map((flow, flowIndex) => {
    const flowRecord = flow as typeof flow & Record<string, unknown>;
    const flowFields: DetailField[] = [];
    pushField(flowFields, "类型", typeLabel[flow.flowType] ?? flow.flowType);
    pushField(flowFields, "触发", flow.trigger);
    pushField(flowFields, "条件", flow.condition);
    pushField(flowFields, "说明", compactText(flowRecord.description));

    const steps = Array.isArray(flow.steps)
      ? [...flow.steps].sort((a, b) => a.order - b.order)
      : [];
    const items: DetailSectionItem[] =
      steps.length > 0
        ? steps.map((step, stepIndex) => {
            const stepRecord = step as typeof step & Record<string, unknown>;
            const order = Number.isFinite(step.order) ? step.order : stepIndex + 1;
            const actorAction =
              compactText(step.actorAction) || compactText(stepRecord.action);
            const systemAction =
              compactText(step.systemAction) || compactText(stepRecord.systemResponse);
            const expectedResult = compactText(step.expectedResult);
            const sourceRequirementId = compactText(step.sourceRequirementId);
            const fields: DetailField[] = [];
            pushField(fields, "执行方", actorLabel[step.actor] ?? step.actor);
            pushField(fields, "参与者动作", actorAction);
            pushField(fields, "系统动作", systemAction);
            pushField(fields, "预期结果", expectedResult);
            pushField(fields, "来源需求", sourceRequirementId);
            return {
              id: `${flow.id}:step:${order}`,
              title: `${order}. ${actorAction || systemAction || expectedResult || "步骤"}`,
              fields,
            };
          })
        : [
            {
              id: `${flow.id}:empty`,
              title: "未列步骤",
              fields: [],
              description: "该事件流未提供结构化步骤。",
            },
          ];

    return {
      id: `event-flow:${flow.id || flowIndex}`,
      title:
        flow.name === (typeLabel[flow.flowType] ?? flow.flowType)
          ? typeLabel[flow.flowType] ?? flow.flowType
          : `${typeLabel[flow.flowType] ?? flow.flowType} · ${flow.name}`,
      summary: steps.length > 0 ? `${steps.length}步` : "未列步骤",
      fields: flowFields,
      items,
    };
  });
}

function prototypeRelationshipLabel(relation: PrototypeInterfaceRelationship) {
  const meta: Record<PrototypeInterfaceRelationship["type"], string> = {
    navigation: "导航",
    contains: "包含",
    opens: "打开",
    submits: "提交",
    returns: "返回",
    "depends-on": "依赖",
  };
  return meta[relation.type];
}

function buildUseCaseDetailModel(model: UseCaseDiagramSpec): DiagramDetailModel {
  const actors = Array.isArray(model.actors) ? model.actors : [];
  const actorNameById = new Map(actors.map((actor) => [actor.id, actor.name]));
  const useCases = Array.isArray(model.useCases) ? model.useCases : [];
  const systemBoundaries = Array.isArray(model.systemBoundaries)
    ? model.systemBoundaries
    : [];
  const useCaseRelationships = Array.isArray(model.relationships)
    ? model.relationships
    : [];
  const items: DiagramDetailItem[] = [
    ...actors.map((actor) => {
      const responsibilities = stringArray(
        (actor as { responsibilities?: unknown }).responsibilities,
      );
      return {
        kind: "actor" as const,
        id: actor.id,
        label: actor.name,
        description: actor.description,
        fields: [
          { label: "身份", value: actor.actorType },
          ...(responsibilities.length > 0
            ? [{ label: "职责", value: joinList(responsibilities) }]
            : []),
        ],
      };
    }),
    ...useCases.map((useCase) => {
      const preconditions = stringArray(
        (useCase as { preconditions?: unknown }).preconditions,
      );
      const postconditions = stringArray(
        (useCase as { postconditions?: unknown }).postconditions,
      );
      const supportingActorIds = stringArray(
        (useCase as { supportingActorIds?: unknown }).supportingActorIds,
      );
      const flowSummary = eventFlowSummary(useCase);
      const eventFlowSections = useCaseEventFlowSections(useCase);
      return {
        kind: "usecase" as const,
        id: useCase.id,
        label: useCase.name,
        description: useCase.description,
        fields: [
          { label: "目标", value: useCase.goal },
          ...(preconditions.length > 0
            ? [{ label: "前置条件", value: joinList(preconditions) }]
            : []),
          ...(postconditions.length > 0
            ? [{ label: "后置条件", value: joinList(postconditions) }]
            : []),
          ...(useCase.primaryActorId
            ? [
                {
                  label: "主参与者",
                  value: actorNameById.get(useCase.primaryActorId) ?? useCase.primaryActorId,
                },
              ]
            : []),
          ...(supportingActorIds.length > 0
            ? [
                {
                  label: "协作参与者",
                  value: joinList(
                    supportingActorIds.map((id) => actorNameById.get(id) ?? id),
                  ),
                },
              ]
            : []),
          ...(flowSummary ? [{ label: "事件流", value: flowSummary }] : []),
        ],
        sections: eventFlowSections,
      };
    }),
    ...systemBoundaries.map((boundary) => ({
      kind: "system-boundary" as const,
      id: boundary.id,
      label: boundary.name,
      description: boundary.description,
      fields: [],
    })),
  ];

  const relationships: DiagramRelationshipDetail[] = useCaseRelationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "标签", relation.label);
      pushField(fields, "条件", relation.condition);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
        typeLabel: useCaseRelationshipLabel(relation),
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        fields,
      };
    },
  );

  return {
    items,
    groups: nonEmptyGroups([
      { kind: "actor", label: "角色", items: items.filter((item) => item.kind === "actor") },
      {
        kind: "usecase",
        label: "用例",
        items: items.filter((item) => item.kind === "usecase"),
      },
      {
        kind: "system-boundary",
        label: "系统边界",
        items: items.filter((item) => item.kind === "system-boundary"),
      },
    ]),
    relationships,
  };
}

function buildFunctionDetailModel(model: FunctionStructureDiagramSpec): DiagramDetailModel {
  const nodeNameById = new Map(model.nodes.map((node) => [node.id, node.name]));
  const items: DiagramDetailItem[] = model.nodes.map((node) => {
    const fields: DetailField[] = [];
    pushField(fields, "父功能", model.relationships.filter((edge) => edge.targetId === node.id).map((edge) => nodeNameById.get(edge.sourceId) ?? edge.sourceId).join("、"));
    if (node.sourceRequirementIds.length > 0) {
      fields.push({ label: "关联需求", value: joinList(node.sourceRequirementIds) });
    }
    return {
      kind: "function" as const,
      id: node.id,
      label: node.name,
      description: node.description,
      fields,
    };
  });

  const relationships: DiagramRelationshipDetail[] = model.relationships.map((relation) => {
    const fields: DetailField[] = [];
    pushField(fields, "标签", relation.label);
    pushField(fields, "说明", relation.description);
    return {
      id: relation.id,
      kind: "relationship",
      label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
      typeLabel: functionRelationshipLabel(relation),
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      fields,
    };
  });

  return {
    items,
    groups: nonEmptyGroups([
      {
        kind: "function",
        label: "功能",
        items,
      },
    ]),
    relationships,
  };
}

function buildClassFields(entity: ClassEntity) {
  const constraints = compactList([
    ...constraintsFrom(entity.constraints),
    entity.stereotype ? `构造型:${entity.stereotype}` : undefined,
    entity.classKind ? `类别:${entity.classKind}` : undefined,
    entity.operations.length > 0 ? `操作:${entity.operations.length}个` : undefined,
  ]);
  return normalizedDetailFields(
    entity as unknown as Record<string, unknown>,
    "未标明",
    entity.type ?? entity.classKind ?? entity.stereotype ?? "class",
    constraints,
  );
}

function classAttributeDetailSections(entity: ClassEntity): DetailSection[] {
  if (entity.attributes.length === 0) return [];

  return [
    {
      id: `${entity.id}:attributes`,
      title: "属性明细",
      summary: `${entity.attributes.length}个`,
      items: entity.attributes.map((attribute, index) => {
        const fields: DetailField[] = [
          { label: "名称", value: attribute.name },
          {
            label: "中文名称",
            value: chineseNameFrom(attribute as unknown as Record<string, unknown>, "未标明"),
          },
          { label: "类型", value: attribute.type },
        ];
        return {
          id: `${entity.id}:attribute:${index}:${attribute.name}`,
          title: attribute.name,
          fields,
          description: attribute.description,
        };
      }),
    },
  ];
}

function buildClassDetailModel(model: ClassDiagramSpec): DiagramDetailModel {
  const items: DiagramDetailItem[] = [
    ...model.classes.map((entity) => ({
      kind: "class" as const,
      id: entity.id,
      label: entity.name,
      description: entity.description,
      fields: buildClassFields(entity),
      sections: classAttributeDetailSections(entity),
    })),
    ...model.interfaces.map((entity) => ({
      kind: "interface" as const,
      id: entity.id,
      label: entity.name,
      description: entity.description,
      fields: normalizedDetailFields(
        entity as unknown as Record<string, unknown>,
        entity.name,
        entity.type ?? "interface",
        compactList([
          ...constraintsFrom(entity.constraints),
          entity.operations.length > 0 ? `操作:${entity.operations.length}个` : undefined,
        ]),
      ),
    })),
    ...model.enums.map((entity) => ({
      kind: "enum" as const,
      id: entity.id,
      label: entity.name,
      fields:
        entity.literals.length > 0
          ? [{ label: "字面量", value: joinList(entity.literals) }]
          : [],
    })),
  ];

  const relationships: DiagramRelationshipDetail[] = model.relationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "标签", relation.label);
      pushField(fields, "源角色", relation.sourceRole);
      pushField(fields, "目标角色", relation.targetRole);
      pushField(fields, "源多重性", relation.sourceMultiplicity);
      pushField(fields, "目标多重性", relation.targetMultiplicity);
      pushField(fields, "可导航性", relation.navigability);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
        typeLabel: classRelationshipLabel(relation),
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        fields,
      };
    },
  );

  return {
    items,
    groups: nonEmptyGroups([
      { kind: "class", label: "类", items: items.filter((item) => item.kind === "class") },
      {
        kind: "interface",
        label: "接口",
        items: items.filter((item) => item.kind === "interface"),
      },
      { kind: "enum", label: "枚举", items: items.filter((item) => item.kind === "enum") },
    ]),
    relationships,
  };
}

function mapActivityNodeKind(node: ActivityNode): SemanticElementKind {
  switch (node.type) {
    case "object": return "object-node";
    case "flow_final": return "flow-final-node";
    case "start":
      return "start-node";
    case "end":
      return "end-node";
    case "activity":
      return "activity";
    case "decision":
      return "decision";
    case "merge":
      return "merge-node";
    case "fork":
      return "fork-node";
    case "join":
      return "join-node";
  }
}

function nodeLabel(node: ActivityNode) {
  if ("name" in node && node.name) {
    return node.name;
  }
  switch (node.type) {
    case "object": return node.name;
    case "flow_final": return node.name;
    case "start":
      return "开始";
    case "end":
      return "结束";
    case "decision":
      return node.question ?? "条件判断";
    case "merge":
      return "合并";
    case "fork":
      return "并发分叉";
    case "join":
      return "并发汇合";
    case "activity":
      return node.name;
  }
}

function buildActivityDetailModel(model: ActivityDiagramSpec): DiagramDetailModel {
  const items: DiagramDetailItem[] = [
    ...model.swimlanes.map((lane) => ({
      kind: "swimlane" as const,
      id: lane.id,
      label: lane.name,
      description: lane.description,
      fields: [],
    })),
    ...model.nodes.map((node) => {
      const fields: DetailField[] = [];
      if (node.type === "activity") {
        pushField(fields, "所属泳道", node.actorOrLane);
        if (node.input?.length > 0) {
          fields.push({ label: "输入", value: joinList(node.input) });
        }
        if (node.output?.length > 0) {
          fields.push({ label: "输出", value: joinList(node.output) });
        }
      }
      if (node.type === "object") { pushField(fields, "对象类型", node.dataType); pushField(fields, "状态", node.state); }
      if (node.type === "decision") {
        pushField(fields, "判断条件", node.question);
      }
      return {
        kind: mapActivityNodeKind(node),
        id: node.id,
        label: nodeLabel(node),
        description: node.description,
        fields,
      };
    }),
  ];

  for (const node of model.nodes) if (node.type === "activity") for (const key of ["inputPins", "outputPins"] as const) for (const pin of node[key] ?? []) items.push({ kind: key === "inputPins" ? "input-pin" : "output-pin", id: pin.id, label: pin.name, fields: [{ label: "所属动作", value: node.name }, { label: "类型", value: pin.dataType }] });
  const relationships: DiagramRelationshipDetail[] = model.relationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "条件", relation.condition);
      pushField(fields, "守卫", relation.guard);
      pushField(fields, "触发", relation.trigger);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: `${relation.sourceId} -> ${relation.targetId}`,
        typeLabel: relation.type === "control_flow" ? "控制流" : "对象流",
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        fields,
      };
    },
  );

  const groupOrder: SemanticElementKind[] = [
    "swimlane",
    "start-node",
    "activity",
    "decision",
    "merge-node",
    "fork-node",
    "join-node",
    "end-node", "object-node", "flow-final-node", "input-pin", "output-pin",
  ];

  return {
    items,
    groups: nonEmptyGroups(groupOrder
      .map((kind) => ({
        kind,
        label: SEMANTIC_KIND_META[kind].label,
        items: items.filter((item) => item.kind === kind),
      }))),
    relationships,
  };
}

function buildDeploymentDetailModel(model: DeploymentDiagramSpec): DiagramDetailModel {
  const items: DiagramDetailItem[] = [
    ...model.nodes.map((node) => ({
      kind: "deployment-node" as const,
      id: node.id,
      label: node.name,
      description: node.description,
      fields: [
        { label: "节点类型", value: node.nodeType },
        ...(node.environment ? [{ label: "环境", value: node.environment }] : []),
      ],
    })),
    ...model.databases.map((database) => ({
      kind: "database" as const,
      id: database.id,
      label: database.name,
      description: database.description,
      fields: database.engine ? [{ label: "引擎", value: database.engine }] : [],
    })),
    ...model.components.map((component) => ({
      kind: "component" as const,
      id: component.id,
      label: component.name,
      description: component.description,
      fields: component.componentType
        ? [{ label: "组件类型", value: component.componentType }]
        : [],
    })),
    ...model.externalSystems.map((system) => ({
      kind: "external-system" as const,
      id: system.id,
      label: system.name,
      description: system.description,
      fields: [],
    })),
    ...model.artifacts.map((artifact) => ({
      kind: "artifact" as const,
      id: artifact.id,
      label: artifact.name,
      description: artifact.description,
      fields: artifact.artifactType
        ? [{ label: "制品类型", value: artifact.artifactType }]
        : [],
    })),
  ];

  const relationships: DiagramRelationshipDetail[] = model.relationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "标签", relation.label);
      pushField(fields, "协议", relation.protocol);
      pushField(fields, "端口", relation.port);
      pushField(fields, "方向", relation.direction);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
        typeLabel: deploymentRelationshipLabel(relation),
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        fields,
      };
    },
  );

  return {
    items,
    groups: nonEmptyGroups([
      {
        kind: "deployment-node",
        label: "部署节点",
        items: items.filter((item) => item.kind === "deployment-node"),
      },
      {
        kind: "database",
        label: "数据库",
        items: items.filter((item) => item.kind === "database"),
      },
      {
        kind: "component",
        label: "组件",
        items: items.filter((item) => item.kind === "component"),
      },
      {
        kind: "external-system",
        label: "外部系统",
        items: items.filter((item) => item.kind === "external-system"),
      },
      {
        kind: "artifact",
        label: "制品",
        items: items.filter((item) => item.kind === "artifact"),
      },
    ]),
    relationships,
  };
}

function mapPrototypeNodeKind(
  node: PrototypeInterfaceDiagramSpec["nodes"][number],
): SemanticElementKind {
  return node.nodeType;
}

function buildPrototypeDetailModel(
  model: PrototypeInterfaceDiagramSpec | NavigationDiagramSpec,
): DiagramDetailModel {
  const items: DiagramDetailItem[] = model.nodes.map((node) => {
    const fields: DetailField[] = [];
    pushField(fields, "路径", node.route);
    if (node.sourceUseCaseIds.length > 0) {
      fields.push({ label: "关联用例", value: joinList(node.sourceUseCaseIds) });
    }
    if (node.sourceRequirementIds.length > 0) {
      fields.push({ label: "关联需求", value: joinList(node.sourceRequirementIds) });
    }
    return {
      kind: mapPrototypeNodeKind(node),
      id: node.id,
      label: node.name,
      description: node.description,
      fields,
    };
  });

  const relationships: DiagramRelationshipDetail[] = model.relationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "标签", relation.label);
      pushField(fields, "触发", relation.trigger);
      pushField(fields, "条件", relation.condition);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
        typeLabel: prototypeRelationshipLabel(relation),
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        fields,
      };
    },
  );

  return {
    items,
    groups: nonEmptyGroups([
      { kind: "screen", label: "页面", items: items.filter((item) => item.kind === "screen") },
      { kind: "module", label: "模块", items: items.filter((item) => item.kind === "module") },
      {
        kind: "entry-point",
        label: "入口点",
        items: items.filter((item) => item.kind === "entry-point"),
      },
    ]),
    relationships,
  };
}

function sequenceMessageTypeLabel(type: SequenceMessage["type"]) {
  const meta: Record<SequenceMessage["type"], string> = {
    sync: "同步调用",
    async: "异步调用",
    return: "返回",
    create: "创建",
    destroy: "销毁",
  };
  return meta[type];
}

function buildSequenceDetailModel(
  model: SequenceDiagramSpec | AnalysisSequenceDiagramSpec,
): DiagramDetailModel {
  const items: DiagramDetailItem[] = [
    ...model.participants.map((participant) => ({
      kind: "participant" as const,
      id: participant.id,
      label: participant.name,
      description: participant.description,
      fields: [{ label: "类型", value: participant.participantType }],
    })),
    ...model.messages.map((message) => ({
      kind: "message" as const,
      id: message.id,
      label: message.name,
      description: message.description,
      fields: [
        { label: "调用类型", value: sequenceMessageTypeLabel(message.type) },
        { label: "来源", value: message.sourceId },
        { label: "目标", value: message.targetId },
        ...(message.parameters.length > 0
          ? [{ label: "参数", value: joinList(message.parameters) }]
          : []),
        ...(message.returnValue ? [{ label: "返回", value: message.returnValue }] : []),
        ...(message.condition ? [{ label: "条件", value: message.condition }] : []),
      ],
    })),
    ...model.fragments.map((fragment) => ({
      kind: "fragment" as const,
      id: fragment.id,
      label: fragment.label,
      description: fragment.description,
      fields: [
        { label: "类型", value: fragment.type },
        ...(fragment.parentFragmentId ? [{ label: "父片段", value: fragment.parentFragmentId }] : []),
        ...(fragment.parentBranchId ? [{ label: "父分支", value: fragment.parentBranchId }] : []),
        ...(fragment.branches ?? []).map((branch) => ({ label: `分支 ${branch.id}`, value: [branch.label, branch.condition, branch.messageIds.join("、")].filter(Boolean).join("；") })),
        ...(fragment.condition ? [{ label: "条件", value: fragment.condition }] : []),
        ...(fragment.messageIds.length > 0
          ? [{ label: "消息", value: joinList(fragment.messageIds) }]
          : []),
      ],
    })),
    ...(model.activations ?? []).map((activation) => ({
      kind: "activation" as const, id: activation.id, label: `${activation.participantId} 激活`,
      fields: [{ label: "生命线", value: activation.participantId }, { label: "起始消息", value: activation.startMessageId }, { label: "结束消息", value: activation.endMessageId }],
    })),
  ];

  const relationships: DiagramRelationshipDetail[] = model.messages.map((message) => ({
    id: message.id,
    kind: "relationship",
    label: message.name,
    typeLabel: sequenceMessageTypeLabel(message.type),
    sourceId: message.sourceId,
    targetId: message.targetId,
    fields: [
      ...(message.parameters.length > 0
        ? [{ label: "参数", value: joinList(message.parameters) }]
        : []),
      ...(message.returnValue ? [{ label: "返回", value: message.returnValue }] : []),
      ...(message.condition ? [{ label: "条件", value: message.condition }] : []),
    ],
  }));

  return {
    items,
    groups: nonEmptyGroups([
      { kind: "activation", label: "激活区间", items: items.filter((item) => item.kind === "activation") },
      {
        kind: "participant",
        label: "参与对象",
        items: items.filter((item) => item.kind === "participant"),
      },
      {
        kind: "message",
        label: "调用消息",
        items: items.filter((item) => item.kind === "message"),
      },
      {
        kind: "fragment",
        label: "组合片段",
        items: items.filter((item) => item.kind === "fragment"),
      },
    ]),
    relationships,
  };
}

function buildTableDetailModel(model: TableDiagramSpec): DiagramDetailModel {
  const tableItems: DiagramDetailItem[] = model.tables.map((table) => ({
    kind: "table",
    id: table.id,
    label: table.name,
    description: table.description,
    fields: normalizedDetailFields(
      table as unknown as Record<string, unknown>,
      table.name,
      table.type ?? "数据表",
      compactList([
        ...constraintsFrom(table.constraints),
        ...(table.relationalConstraints ?? []).map((key) => key.type === "check" ? `${key.name ?? key.id}: ${key.expression}` : `${key.type} (${key.columnIds.join(", ")})${key.type === "foreign-key" ? ` → ${key.referenceTableId} (${key.referenceColumnIds.join(", ")})` : ""}`),
        table.columns.length > 0 ? `字段:${table.columns.length}个` : undefined,
        table.columns.some((column) => column.isPrimaryKey) ? "包含主键" : undefined,
        table.columns.some((column) => column.isForeignKey) ? "包含外键" : undefined,
      ]),
    ),
  }));

  const columnItems: DiagramDetailItem[] = model.tables.flatMap((table) =>
    table.columns.map((column) => {
      const constraints = compactList([
        ...constraintsFrom(column.constraints),
        column.isPrimaryKey ? "PK" : undefined,
        column.isForeignKey ? "FK" : undefined,
        column.nullable === false ? "NOT NULL" : "nullable",
        column.references
          ? `引用:${column.references.tableId}.${column.references.columnId}`
          : undefined,
      ]);
      const fields = normalizedDetailFields(
        column as unknown as Record<string, unknown>,
        column.name,
        column.dataType,
        constraints,
      );
      return {
        kind: "table-column" as const,
        id: `${table.id}.${column.id}`,
        label: `${table.name}.${column.name}`,
        description: column.description,
        fields,
      };
    }),
  );

  const relationships: DiagramRelationshipDetail[] = model.relationships.map(
    (relation) => {
      const fields: DetailField[] = [];
      pushField(fields, "标签", relation.label);
      pushField(fields, "源字段", relation.sourceColumnIds?.join("、"));
      pushField(fields, "源基数", relation.sourceMultiplicity);
      pushField(fields, "目标字段", relation.targetColumnIds?.join("、"));
      pushField(fields, "目标基数", relation.targetMultiplicity);
      pushField(fields, "说明", relation.description);
      return {
        id: relation.id,
        kind: "relationship",
        label: relation.label ?? `${relation.sourceTableId} -> ${relation.targetTableId}`,
        typeLabel: tableRelationshipLabel(relation),
        sourceId: relation.sourceTableId,
        targetId: relation.targetTableId,
        fields,
      };
    },
  );

  const items = [...tableItems, ...columnItems];
  return {
    items,
    groups: nonEmptyGroups([
      { kind: "table", label: "表", items: tableItems },
      { kind: "table-column", label: "字段", items: columnItems },
    ]),
    relationships,
  };
}

function buildArchitectureDetailModel(model: ArchitectureDiagramSpec): DiagramDetailModel {
  const packageNameById = new Map(model.packages.map((item) => [item.id, item.name]));
  const packageItems: DiagramDetailItem[] = model.packages.map((item) => ({
    kind: "package",
    id: item.id,
    label: item.name,
    description: item.description,
    fields: [
      ...(item.stereotype ? [{ label: "构造型", value: item.stereotype }] : []),
      ...(model.components.filter((component) => component.packageId === item.id).map((component) => component.name).length > 0
        ? [{ label: "包含组件", value: joinList(model.components.filter((component) => component.packageId === item.id).map((component) => component.name)) }]
        : []),
    ],
  }));
  const componentItems: DiagramDetailItem[] = model.components.map((component) => ({
    kind: "component",
    id: component.id,
    label: component.name,
    description: component.description,
    fields: [
      ...(component.packageId
        ? [{ label: "所属包", value: packageNameById.get(component.packageId) ?? component.packageId }]
        : []),
      ...(component.componentType ? [{ label: "类型", value: component.componentType }] : []),
      ...(component.sourceRequirementIds.length > 0
        ? [{ label: "关联需求", value: joinList(component.sourceRequirementIds) }]
        : []),
    ],
  }));
  const relationships: DiagramRelationshipDetail[] = model.relationships.map((relation) => {
    const fields: DetailField[] = [];
    pushField(fields, "标签", relation.label);
    pushField(fields, "说明", relation.description);
    return {
      id: relation.id,
      kind: "relationship",
      label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
      typeLabel: architectureRelationshipLabel(relation),
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      fields,
    };
  });

  return {
    items: [...packageItems, ...componentItems],
    groups: nonEmptyGroups([
      { kind: "package", label: "包", items: packageItems },
      { kind: "component", label: "组件", items: componentItems },
    ]),
    relationships,
  };
}

function buildComponentDetailModel(model: ComponentRelationshipDiagramSpec): DiagramDetailModel {
  const componentItems: DiagramDetailItem[] = model.components.map((component) => ({
    kind: "component",
    id: component.id,
    label: component.name,
    description: component.description,
    fields: [
      ...(component.componentType ? [{ label: "类型", value: component.componentType }] : []),
      ...(component.sourceClassIds.length > 0
        ? [{ label: "来源设计类", value: joinList(component.sourceClassIds) }]
        : []),
    ],
  }));
  const interfaceItems: DiagramDetailItem[] = model.interfaces.map((item) => ({
    kind: "interface",
    id: item.id,
    label: item.name,
    description: item.description,
    fields: item.operationNames.length > 0
      ? [{ label: "操作", value: joinList(item.operationNames) }]
      : [],
  }));
  const relationships: DiagramRelationshipDetail[] = model.relationships.map((relation) => {
    const fields: DetailField[] = [];
    pushField(fields, "标签", relation.label);
    pushField(fields, "说明", relation.description);
    return {
      id: relation.id,
      kind: "relationship",
      label: relation.label ?? `${relation.sourceId} -> ${relation.targetId}`,
      typeLabel: componentRelationshipLabel(relation),
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      fields,
    };
  });

  return {
    items: [...componentItems, ...interfaceItems],
    groups: nonEmptyGroups([
      { kind: "component", label: "组件", items: componentItems },
      { kind: "interface", label: "接口", items: interfaceItems },
    ]),
    relationships,
  };
}

export function buildDiagramDetailModel(
  input?: DiagramModelSpec | DesignDiagramModelSpec | Record<string, unknown> | null,
): DiagramDetailModel {
  const model = input as DiagramModelSpec | DesignDiagramModelSpec | null;
  if (!model) {
    return { items: [], groups: [], relationships: [] };
  }

  switch (model.diagramKind) {
    case "context":
      return buildContextDetailModel(model);
    case "function":
      return buildFunctionDetailModel(model);
    case "architecture":
      return buildArchitectureDetailModel(model);
    case "component":
      return buildComponentDetailModel(model);
    case "sequence":
      return buildSequenceDetailModel(model);
    case "usecase":
      return buildUseCaseDetailModel(model);
    case "class":
      return buildClassDetailModel(model);
    case "activity":
      return buildActivityDetailModel(model);
    case "deployment":
      return buildDeploymentDetailModel(model);
    case "navigation":
    case "prototype":
      return buildPrototypeDetailModel(model);
    case "analysis":
      return buildSequenceDetailModel(model);
    case "table":
      return buildTableDetailModel(model);
  }
}
