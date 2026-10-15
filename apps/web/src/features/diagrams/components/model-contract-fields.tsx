// Edits canonical model fields recursively, including nested pins, branches and relational constraints.
import { contractResponseSchema, getStageModelSchema, type ModelingStage } from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { LabelCheckbox, LabelSelect, LabelTextarea, LabelTextInput, SourceRuleChecklist, editorFieldLabel, ordinalLabel } from "./model-edit-fields";
import { createDraftId, stringValue } from "../lib/model-editing";

export type FieldSchema = { type?: string; enum?: string[]; properties?: Record<string, FieldSchema>; required?: string[]; items?: FieldSchema; anyOf?: FieldSchema[]; maxItems?: number };
type RecordValue = Record<string, unknown>;
const names: Record<string, string> = {
  id: "标识", name: "名称", label: "名称", description: "说明", type: "类型", nodeType: "节点类型", participantType: "对象职责", actorType: "角色类型",
  chineseName: "中文名称", englishName: "英文名称", goal: "目标", systemBoundaryId: "所属系统边界", extensionPoints: "扩展点", extensionPointIds: "基础用例扩展点",
  primaryActorId: "主要参与者", supportingActorIds: "辅助参与者", responsibilities: "职责", preconditions: "前置条件", postconditions: "后置条件", eventFlows: "事件流", flowType: "事件流类型", steps: "步骤", order: "顺序", actor: "执行方", actorAction: "角色动作", systemAction: "系统动作", expectedResult: "预期结果",
  actorOrLane: "所属泳道", question: "判断条件", input: "输入说明", output: "输出说明", inputPins: "输入引脚", outputPins: "输出引脚", dataType: "数据类型", state: "对象状态", multiplicity: "多重性",
  sourceId: "起点", targetId: "终点", condition: "条件", guard: "守卫条件", trigger: "触发条件", direction: "方向", protocol: "协议", port: "端口",
  sourceRole: "起点角色名", targetRole: "终点角色名", sourceMultiplicity: "起点多重性", targetMultiplicity: "终点多重性", navigability: "可导航性",
  parentId: "上层节点", packageId: "所属包", technology: "技术名称", environment: "环境约束", engine: "数据库引擎", artifactType: "制品类型", componentType: "组件职责", stereotype: "构造型",
  route: "页面路由", sourceUseCaseIds: "来源用例", sourceRequirementIds: "来源需求", sourceRequirementId: "来源需求", sourceClassIds: "来源设计类",
  classKind: "类职责", attributes: "属性", operations: "操作", operationNames: "接口操作", isAbstract: "抽象", isStatic: "静态", visibility: "可见性", parameters: "参数", returnType: "返回类型", returnValue: "返回值", required: "必填", defaultValue: "默认值", constraints: "约束", literals: "枚举值",
  messageIds: "消息标识（按顺序，每行一个）", branches: "分支", parentFragmentId: "父片段", parentBranchId: "父分支", participantId: "激活对象", startMessageId: "起始消息", endMessageId: "结束消息",
  columns: "字段", nullable: "允许空值", relationalConstraints: "主键、唯一、外键与检查约束", columnIds: "约束字段（按顺序，每行一个标识）", referenceTableId: "引用表", referenceColumnIds: "引用字段（按顺序，每行一个标识）", expression: "检查表达式",
};
const enumNames: Record<string, string> = {
  "primary-key": "主键", unique: "唯一", "foreign-key": "外键", check: "检查", start: "起点", end: "活动终止", flow_final: "分支终止", activity: "动作", object: "对象", decision: "判断", merge: "合并", fork: "并行分叉", join: "并行汇合",
  screen: "页面", module: "模块", "entry-point": "入口", node: "节点", device: "设备", "execution-environment": "执行环境", actor: "参与者", boundary: "边界对象", control: "控制对象", entity: "实体对象", service: "服务", database: "数据库", external: "外部系统",
  alt: "选择分支", opt: "可选分支", loop: "循环", par: "并行", sync: "同步", async: "异步", return: "返回", create: "创建", destroy: "销毁", decomposition: "功能分解", control_flow: "控制流", object_flow: "对象流",
  association: "关联", include: "包含", extend: "扩展", generalization: "泛化", inheritance: "继承", implementation: "实现", aggregation: "聚合", composition: "组合", dependency: "依赖", communication: "通信", deployment: "部署", manifestation: "体现", contains: "包含归属", navigation: "导航", opens: "打开", submits: "提交", returns: "返回", "depends-on": "模块依赖", "provided-interface": "提供接口", "required-interface": "使用接口",
};
export function modelCollectionSchema(model: RecordValue, stage: ModelingStage, key: string): FieldSchema {
  const contract = getStageModelSchema(stage, String(model.diagramKind));
  const schema = contract ? contractResponseSchema(contract).properties?.[key] : undefined;
  return schema?.items ?? schema ?? {};
}
function selectedSchema(schema: FieldSchema, value: unknown): FieldSchema {
  if (!schema.anyOf) return schema;
  const record = value && typeof value === "object" ? value as RecordValue : {};
  return schema.anyOf.find((option) => Object.entries(option.properties ?? {}).some(([key, field]) => field.enum?.length === 1 && field.enum[0] === record[key])) ?? schema.anyOf[0]!;
}
function initialValue(schema: FieldSchema, key = ""): unknown {
  const field = selectedSchema(schema, undefined);
  if (key === "id") return createDraftId("item");
  if (field.enum) return field.enum[0];
  if (field.type === "array") return [];
  if (field.type === "boolean") return false;
  if (field.type === "integer" || field.type === "number") return 1;
  if (field.type === "object") return Object.fromEntries(Object.entries(field.properties ?? {}).filter(([name]) => field.required?.includes(name)).map(([name, child]) => [name, initialValue(child, name)]));
  return key === "name" || key === "label" ? "新元素" : "";
}
/** Changing a discriminant is explicit; incompatible fields are removed only after that user action. */
export function ContractFields({ schema, value, onChange, model, path = "", options = {}, owner = "" }: {
  schema: FieldSchema; value: unknown; onChange: (value: unknown) => void; model: RecordValue; path?: string; owner?: string;
  options?: Record<string, Array<{ value: string; label: string }>>;
}) {
  const field = selectedSchema(schema, value);
  const record = (value && typeof value === "object" ? value : {}) as RecordValue;
  const key = path.split(".").at(-1) ?? "";
  const rawLabel = key === "label" && !owner ? "关系名称" : names[key] ?? key;
  const fieldNames: Record<string, string> = { actorOrLane: "lane", participantType: "type", nodeType: "type", actorType: "type", classKind: "type", primaryActorId: "primaryActor", supportingActorIds: "supportingActors", messageIds: "messages", question: "question" };
  const label = owner ? editorFieldLabel(owner, fieldNames[key] ?? (key === "name" || key === "description" ? key : rawLabel)) : rawLabel;
  const update = (name: string, next: unknown) => {
    const result = { ...record };
    if (next === undefined) delete result[name]; else result[name] = next;
    onChange(result);
  };
  if (field.type === "object") {
    const discriminator = schema.anyOf ? Object.keys(field.properties ?? {}).find((name) => schema.anyOf!.every((item) => item.properties?.[name]?.enum?.length === 1)) : undefined;
    return <div className="space-y-3">{discriminator ? <LabelSelect label={owner ? editorFieldLabel(owner, "type") : names[discriminator] ?? discriminator} value={stringValue(record[discriminator])} options={schema.anyOf!.map((item) => { const id = item.properties![discriminator]!.enum![0]!; return { value: id, label: enumNames[id] ?? id }; })} onChange={(next) => {
      const nextSchema = schema.anyOf!.find((item) => item.properties?.[discriminator]?.enum?.[0] === next)!;
      const base = initialValue(nextSchema) as RecordValue;
      for (const name of Object.keys(nextSchema.properties ?? {})) if (name in record) base[name] = record[name];
      onChange({ ...base, [discriminator]: next });
    }} /> : null}{Object.entries(field.properties ?? {}).filter(([name, child]) => name !== discriminator && child.maxItems !== 0 && !["isPrimaryKey", "isForeignKey", "references", "sourceColumnId", "targetColumnId"].includes(name)).map(([name, child]) => <ContractFields key={name} owner={owner} schema={child} value={record[name]} model={model} path={path ? `${path}.${name}` : name} options={options} onChange={(next) => update(name, next === "" && !field.required?.includes(name) ? undefined : next)} />)}</div>;
  }
  if (field.type === "array") {
    const values = Array.isArray(value) ? value : [];
    if (key === "sourceRequirementIds" && options[key]) return <SourceRuleChecklist selectedIds={values as string[]} options={options[key].map((item) => ({ id: item.value, label: item.label }))} onChange={onChange} />;
    if (field.items?.type === "string") return <LabelTextarea label={label} value={values.join("\n")} onChange={(text) => onChange(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))} />;
    return <fieldset className="space-y-3 rounded-lg border p-3"><legend>{label}</legend>{values.map((entry, index) => <div key={index} className="space-y-2 rounded border p-3"><ContractFields schema={field.items ?? {}} owner={ordinalLabel(index, ({ attributes: "属性", columns: "字段", operations: "操作", parameters: "参数" } as Record<string, string>)[key] ?? rawLabel)} value={entry} model={model} path={`${path}.${index}`} options={options} onChange={(next) => onChange(values.map((item, i) => i === index ? next : item))} /><Button type="button" variant="outline" size="sm" onClick={() => onChange(values.filter((_, i) => i !== index))}>删除{label} {index + 1}</Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, initialValue(field.items ?? {})])}>添加{label}</Button></fieldset>;
  }
  if (field.type === "boolean") return <LabelCheckbox label={label} checked={Boolean(value)} onChange={onChange} />;
  const references: Record<string, string> = { systemBoundaryId: "systemBoundaries", primaryActorId: "actors", actorOrLane: "swimlanes", packageId: "packages", parentFragmentId: "fragments", participantId: "participants", startMessageId: "messages", endMessageId: "messages", referenceTableId: "tables" };
  const referenceKey = key === "parentId" ? model.diagramKind === "architecture" ? "packages" : "nodes" : references[key];
  const referenceItems = referenceKey && Array.isArray(model[referenceKey]) ? model[referenceKey] as RecordValue[] : null;
  const choices = options[key] ?? (referenceItems?.map((item) => ({ value: stringValue(item.id), label: `${stringValue(item.name ?? item.label)} (${stringValue(item.id)})` }))) ?? field.enum?.map((id) => ({ value: id, label: enumNames[id] ?? id }));
  if (choices) return <LabelSelect label={label} value={stringValue(value)} options={choices} allowEmpty onChange={onChange} />;
  if (["description", "condition", "guard", "trigger", "expression"].includes(key)) return <LabelTextarea label={label} value={stringValue(value)} onChange={onChange} />;
  return <LabelTextInput label={label} value={stringValue(value)} onChange={(next) => onChange(field.type === "number" || field.type === "integer" ? Number(next) : next)} />;
}
