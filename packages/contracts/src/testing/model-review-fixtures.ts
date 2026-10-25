// Supplies complex legal model cases shared by semantic and real-renderer review regressions.
import { deriveTableModel, getStageModelSchema, type AnyDiagramModel, type ModelingStage } from "../modeling/model-semantics.js";
import { modelFixture, parallelActivityFixture } from "./model-fixtures.js";

export function modelReviewFixtures(stage: ModelingStage, kind: string): Array<{ name: string; model: AnyDiagramModel }> {
  let basic = modelFixture(stage, kind);
  if (basic.diagramKind === "table") basic = deriveTableModel(basic);
  const cases = [{ name: "基本模型", model: basic }];
  const add = (name: string, candidate: unknown) => cases.push({ name, model: getStageModelSchema(stage, kind)!.parse(candidate) as AnyDiagramModel });
  const rich: any = structuredClone(basic);
  if (kind === "activity") {
    rich.nodes.splice(1, 0, { id: "choice", type: "decision", name: "选择分支", question: "是否处理？", actorOrLane: "system" });
    rich.nodes.splice(rich.nodes.length - 1, 0, { id: "merge", type: "merge", name: "分支合并", actorOrLane: "system" });
    rich.relationships = [
      { id: "start-choice", type: "control_flow", sourceId: "start", targetId: "choice" },
      { id: "yes", type: "control_flow", sourceId: "choice", targetId: "work", guard: "是" },
      { id: "no", type: "control_flow", sourceId: "choice", targetId: "merge", guard: "否" },
      { id: "work-merge", type: "control_flow", sourceId: "work", targetId: "merge" },
      { id: "merge-end", type: "control_flow", sourceId: "merge", targetId: "end" },
    ];
    add("判断与合并菱形及泳道", rich);
    add("并发、跨泳道与输入输出说明", parallelActivityFixture());
  }
  if (kind === "usecase") {
    rich.actors.push({ ...rich.actors[0], id: "specialist", name: "会员" });
    rich.useCases.push({ ...rich.useCases[0], id: "included", name: "核对信息", extensionPoints: [] }, { ...rich.useCases[0], id: "extra", name: "附加处理", extensionPoints: [] });
    rich.relationships.push({ id: "inherit", type: "generalization", sourceId: "specialist", targetId: "actor" },
      { id: "include", type: "include", sourceId: "case", targetId: "included" },
      { id: "extend", type: "extend", sourceId: "extra", targetId: "case", extensionPointIds: ["discount"], condition: "满足附加处理条件" });
    add("泛化、包含与扩展的辅助用例", rich);
  }
  if (kind === "class") {
    rich.relationships.push({ id: "recursive", type: "composition", sourceId: "item", targetId: "item", sourceMultiplicity: "0..1", targetMultiplicity: "0..*" });
    add("递归组合与多重性", rich);
    const inheritance: any = structuredClone(basic);
    inheritance.relationships[0] = { id: "inherit", type: "inheritance", sourceId: "item", targetId: "order" };
    add("合法类泛化", inheritance);
    if (stage === "design") {
      const implementation: any = structuredClone(basic);
      implementation.interfaces.push({ id: "port", name: "OrderPort", operations: [{ name: "submit", visibility: "public", parameters: [] }] });
      implementation.enums.push({ id: "status", name: "Status", literals: ["PENDING", "DONE"] });
      implementation.relationships.push({ id: "implements", type: "implementation", sourceId: "order", targetId: "port" });
      add("接口实现、枚举与操作", implementation);
    }
  }
  if (kind === "analysis" || kind === "sequence") {
    rich.messages = ["sync", "return", "sync", "async"].map((type, index) => ({ id: `m${index}`, type, sourceId: index === 1 ? "b" : "a", targetId: index === 1 || index === 2 ? "a" : "b", name: `调用${index}`, parameters: [] }));
    rich.fragments = [
      { id: "loop", type: "loop", label: "重复处理", messageIds: ["m0", "m1", "m2", "m3"] },
      { id: "alt", type: "alt", label: "选择分支", parentFragmentId: "loop", messageIds: ["m0", "m1", "m2", "m3"], branches: [{ id: "yes", label: "通过", messageIds: ["m0", "m1"] }, { id: "no", label: "其他", messageIds: ["m2", "m3"] }] },
      { id: "opt", type: "opt", label: "可选处理", parentFragmentId: "alt", parentBranchId: "yes", messageIds: ["m0"] },
      { id: "par", type: "par", label: "并行处理", parentFragmentId: "alt", parentBranchId: "no", messageIds: ["m2", "m3"], branches: [{ id: "one", label: "本地", messageIds: ["m2"] }, { id: "two", label: "远程", messageIds: ["m3"] }] },
    ];
    add("嵌套片段、空操作数以外的显式分支与自调用", rich);
    const lifecycle: any = structuredClone(basic);
    lifecycle.messages = ["create", "sync", "return", "destroy"].map((type, index) => ({ id: `m${index}`, type, sourceId: index === 2 ? "b" : "a", targetId: index === 2 ? "a" : "b", name: `调用${index}`, parameters: [] }));
    lifecycle.activations = [{ id: "activation", participantId: "b", startMessageId: "m1", endMessageId: "m2" }];
    add("创建、销毁、返回与激活", lifecycle);
  }
  if (kind === "architecture") {
    rich.packages.push({ id: "root", name: "父包" }); rich.packages[0].parentId = "root";
    rich.components.push({ id: "outside", name: "外部组件", sourceRequirementIds: [] });
    rich.relationships.push({ id: "dependency", type: "dependency", sourceId: "c", targetId: "outside" });
    add("多层包与组件归属", rich);
  }
  if (kind === "deployment") {
    rich.nodes.push({ id: "nested", name: "嵌套运行环境", nodeType: "execution-environment", parentId: "e" });
    rich.relationships.push({ id: "nested-communication", type: "communication", sourceId: "nested", targetId: "outside", protocol: "HTTPS", port: "443", direction: "outbound" });
    add("设备及多层执行环境与通信", rich);
    if (stage === "design") {
      rich.artifacts.push({ id: "artifact", name: "应用制品" }); rich.components.push({ id: "component", name: "逻辑组件" });
      rich.relationships.push({ id: "deploy", type: "deployment", sourceId: "artifact", targetId: "nested" }, { id: "manifest", type: "manifestation", sourceId: "artifact", targetId: "component" });
      add("制品部署与逻辑组件体现", rich);
    }
  }
  if (kind === "component") {
    rich.components.push({ id: "client", name: "调用组件", sourceClassIds: [] });
    rich.relationships.push({ id: "required", type: "required-interface", sourceId: "client", targetId: "i" });
    add("提供与使用接口及操作", rich);
  }
  if (kind === "prototype" || kind === "navigation") {
    rich.nodes.push({ id: "module", name: "订单模块", nodeType: "module", sourceUseCaseIds: [], sourceRequirementIds: [] });
    rich.relationships.push({ id: "owns-a", type: "contains", sourceId: "module", targetId: "a" }, { id: "owns-b", type: "contains", sourceId: "module", targetId: "b" });
    add("模块归属与页面导航", rich);
  }
  if (kind === "table") {
    rich.tables[0].columns.push({ ...rich.tables[0].columns[0], id: "tenant", name: "tenant" }); rich.tables[0].relationalConstraints[0].columnIds.push("tenant");
    rich.tables[1].columns.push({ ...rich.tables[1].columns[1], id: "tenant", name: "tenant" });
    rich.tables[1].relationalConstraints[1].columnIds.push("tenant"); rich.tables[1].relationalConstraints[1].referenceColumnIds.push("tenant");
    add("复合主键和复合外键", deriveTableModel(rich));
  }
  return cases;
}
