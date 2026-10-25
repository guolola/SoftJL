// Supplies small canonical graphs for contract, renderer and editor regression tests.
import { getStageModelSchema, type ModelingStage, type AnyDiagramModel } from "../modeling/model-semantics.js";

export function modelFixture(stage: ModelingStage, kind: string): AnyDiagramModel {
  const base = { diagramKind: kind, modelId: kind, title: "模型", summary: "业务模型", notes: [] };
  const edge = (id: string, type: string, sourceId: string, targetId: string) => ({ id, type, sourceId, targetId });
  const fields: Record<string, object> = {
    context: { system: { id: "system", name: "系统", sourceRequirementIds: [] }, people: [{ id: "person", name: "用户", sourceRequirementIds: ["R1"] }], externalSystems: [], relationships: [{ id: "r", sourceId: "person", targetId: "system", direction: "directed", label: "访问", sourceRequirementIds: ["R1"] }] },
    function: { nodes: [{ id: "root", name: "系统", sourceRequirementIds: [] }, { id: "child", name: "下单", sourceRequirementIds: ["R1"] }], relationships: [edge("r", "decomposition", "root", "child")] },
    usecase: { actors: [{ id: "actor", name: "顾客", actorType: "human", responsibilities: [] }], systemBoundaries: [{ id: "boundary", name: "商店" }], useCases: [{ id: "case", name: "下单", goal: "完成订单", systemBoundaryId: "boundary", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [], extensionPoints: [{ id: "discount", name: "计算优惠" }] }], relationships: [edge("r", "association", "actor", "case")] },
    class: { classes: [{ id: "order", name: "Order", attributes: [], operations: [], constraints: [] }, { id: "item", name: "Item", attributes: [], operations: [], constraints: [] }], interfaces: [], enums: [], relationships: [edge("r", "composition", "order", "item")] },
    activity: { swimlanes: [{ id: "system", name: "系统" }], nodes: [{ id: "start", type: "start" }, { id: "work", type: "activity", name: "处理", actorOrLane: "system", input: [], output: [] }, { id: "end", type: "end" }], relationships: [edge("r1", "control_flow", "start", "work"), edge("r2", "control_flow", "work", "end")] },
    analysis: { participants: [{ id: "a", name: "顾客", participantType: "actor" }, { id: "b", name: "订单协调", participantType: "control" }], messages: [{ ...edge("m", "sync", "a", "b"), name: "提交订单", parameters: [] }], fragments: [] },
    sequence: { participants: [{ id: "a", name: "Client", participantType: "boundary" }, { id: "b", name: "OrderService", participantType: "service" }], messages: [{ ...edge("m", "sync", "a", "b"), name: "submit", parameters: [] }], fragments: [] },
    prototype: { nodes: [{ id: "a", name: "列表页", nodeType: "screen", sourceUseCaseIds: [], sourceRequirementIds: [] }, { id: "b", name: "详情页", nodeType: "screen", sourceUseCaseIds: [], sourceRequirementIds: [] }], relationships: [edge("r", "navigation", "a", "b")] },
    navigation: { nodes: [{ id: "a", name: "列表页", nodeType: "screen", route: "/orders", sourceUseCaseIds: [], sourceRequirementIds: [] }, { id: "b", name: "详情页", nodeType: "screen", route: "/orders/:id", sourceUseCaseIds: [], sourceRequirementIds: [] }], relationships: [edge("r", "returns", "b", "a")] },
    architecture: { packages: [{ id: "p", name: "应用" }], components: [{ id: "c", name: "订单", packageId: "p", sourceRequirementIds: [] }], relationships: [edge("r", "contains", "p", "c")] },
    component: { components: [{ id: "c", name: "订单", sourceClassIds: [] }], interfaces: [{ id: "i", name: "下单接口", operationNames: ["submit(order)"] }], relationships: [edge("r", "provided-interface", "c", "i")] },
    deployment: { nodes: [{ id: "d", name: "服务器", nodeType: "device" }, { id: "e", name: "运行环境", nodeType: "execution-environment", parentId: "d" }], databases: [], components: [], artifacts: [], externalSystems: [{ id: "outside", name: "支付" }], relationships: [edge("r", "communication", "e", "outside")] },
    table: { tables: [{ id: "orders", name: "orders", columns: [{ id: "id", name: "id", dataType: "bigint", nullable: false }], relationalConstraints: [{ id: "pk", type: "primary-key", columnIds: ["id"] }] }, { id: "items", name: "items", columns: [{ id: "id", name: "id", dataType: "bigint", nullable: false }, { id: "order", name: "order_id", dataType: "bigint", nullable: false }], relationalConstraints: [{ id: "pk", type: "primary-key", columnIds: ["id"] }, { id: "fk_order", type: "foreign-key", columnIds: ["order"], referenceTableId: "orders", referenceColumnIds: ["id"] }] }], relationships: [] },
  };
  return getStageModelSchema(stage, kind)!.parse({ ...base, ...fields[kind] }) as AnyDiagramModel;
}

// Deliberately obsolete input for boundary rejection tests; never a supported model fixture.
export function objectActivityFixture(): any {
  const model: any = modelFixture("requirements", "activity");
  model.nodes.splice(2, 0,
    { id: "data", type: "object", name: "订单", dataType: "Order", state: "已校验" },
    { id: "consume", type: "activity", name: "处理", actorOrLane: "system", input: [], output: [], inputPins: [{ id: "in", name: "订单", dataType: "Order" }] },
    { id: "branchEnd", type: "flow_final", name: "分支结束" });
  const work = model.nodes.find((node: any) => node.id === "work")!;
  if (work.type === "activity") work.outputPins = [{ id: "out", name: "订单", dataType: "Order" }];
  model.relationships.push(
    { id: "data1", type: "object_flow", sourceId: "out", targetId: "data" },
    { id: "data2", type: "object_flow", sourceId: "data", targetId: "in" },
    { id: "control", type: "control_flow", sourceId: "work", targetId: "consume" },
    { id: "done", type: "control_flow", sourceId: "consume", targetId: "branchEnd" });
  return model;
}

export function parallelActivityFixture() {
  const model = modelFixture("requirements", "activity");
  if (model.diagramKind !== "activity") throw new Error("fixture");
  model.swimlanes.push({ id: "delivery", name: "履约" }, { id: "billing", name: "结算" });
  model.nodes.push(
    { id: "fork", type: "fork", actorOrLane: "system" }, { id: "join", type: "join", actorOrLane: "system" },
    { id: "consume", type: "activity", name: "履约", actorOrLane: "delivery", input: ["订单"], output: ["履约结果"] },
    { id: "settle", type: "activity", name: "结算", actorOrLane: "billing", input: ["订单"], output: ["结算结果"] },
  );
  model.relationships = model.relationships.filter((edge) => edge.id === "r1");
  model.relationships.push(...[
    ["split", "work", "fork"], ["left", "fork", "consume"],
    ["right", "fork", "settle"], ["leftDone", "consume", "join"],
    ["rightDone", "settle", "join"], ["complete", "join", "end"],
  ].map(([id, sourceId, targetId]) => ({ id: id!, type: "control_flow" as const, sourceId: sourceId!, targetId: targetId! })));
  return model;
}
