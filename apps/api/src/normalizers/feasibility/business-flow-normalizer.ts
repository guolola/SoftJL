// Validates activity connectivity, lane ownership and rule traceability without inventing workflow steps.
import { feasibilityBusinessFlowSchema, validateModelInput, ModelSemanticError, type FeasibilityBusinessFlow } from "@uml-platform/contracts";

function omitNullFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitNullFields);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, omitNullFields(item)]));
  }
  return value;
}

export function normalizeFeasibilityBusinessFlow(
  value: unknown,
  validRequirementIds: ReadonlySet<string>,
): FeasibilityBusinessFlow {
  // Strict providers encode absent optional fields as null; required fields still fail schema validation.
  const input = omitNullFields(value);
  const diagnostics = validateModelInput((input as { model?: unknown })?.model, "feasibility");
  if (diagnostics.length) throw new ModelSemanticError(diagnostics);
  const result = feasibilityBusinessFlowSchema.parse(input);
  const { model, traceability } = result;
  model.modelId = "feasibility-business-flow";
  const ids = new Set<string>();
  for (const item of [...model.swimlanes, ...model.nodes, ...model.relationships]) {
    if (ids.has(item.id)) throw new Error(`流程元素编号重复：${item.id}`);
    ids.add(item.id);
  }
  const lanes = new Set(model.swimlanes.map((lane) => lane.id));
  const nodes = new Set(model.nodes.map((node) => node.id));
  const relations = new Set(model.relationships.map((edge) => edge.id));
  if (!lanes.has("system")) throw new Error("流程必须包含 id 为 system 的目标系统泳道。");
  const starts = model.nodes.filter((node) => node.type === "start");
  const ends = model.nodes.filter((node) => node.type === "end");
  if (starts.length !== 1 || ends.length === 0) throw new Error("流程必须有一个开始节点和至少一个结束节点。");
  if (!model.nodes.some((node) => node.type === "activity" && node.actorOrLane === "system")) {
    throw new Error("流程必须包含目标系统执行的活动。");
  }
  for (const edge of model.relationships) {
    if (edge.type !== "control_flow" || !nodes.has(edge.sourceId) || !nodes.has(edge.targetId)) {
      throw new Error(`流程关系必须是有效节点之间的控制流：${edge.id}`);
    }
  }
  for (const node of model.nodes) {
    const outgoing = model.relationships.filter((edge) => edge.sourceId === node.id);
    const incoming = model.relationships.filter((edge) => edge.targetId === node.id);
    if (node.type === "activity" && (!node.actorOrLane || !lanes.has(node.actorOrLane))) {
      throw new Error(`活动必须归属有效泳道：${node.id}`);
    }
    if (node.type === "start" && (incoming.length !== 0 || outgoing.length !== 1)) {
      throw new Error("开始节点必须只有一条出边且无入边。");
    }
    if (node.type === "end" && outgoing.length !== 0) throw new Error("结束节点不能有出边。");
    if (node.type === "decision") {
      const guards = outgoing.map((edge) => (edge.guard ?? edge.condition ?? "").trim());
      if (outgoing.length < 2 || guards.some((guard) => !guard) || new Set(guards).size !== guards.length) {
        throw new Error(`判断节点至少需要两条带不同条件的出边：${node.id}`);
      }
    } else if (node.type !== "fork" && outgoing.length > 1) {
      throw new Error(`多个后续分支必须通过 decision 或 fork 表达：${node.id}`);
    }
    if (node.type === "fork" && outgoing.length < 2) throw new Error(`并行节点必须有至少两条出边：${node.id}`);
    if ((node.type === "join" || node.type === "merge") && incoming.length < 2) {
      throw new Error(`汇合节点必须有至少两条入边：${node.id}`);
    }
  }
  // Cycles may exist, but every node must be reachable and have a path to an end.
  const reachable = (seeds: string[], reverse: boolean) => {
    const visited = new Set(seeds);
    const pending = [...seeds];
    while (pending.length) {
      const id = pending.pop();
      for (const edge of model.relationships) {
        if ((reverse ? edge.targetId : edge.sourceId) !== id) continue;
        const next = reverse ? edge.sourceId : edge.targetId;
        if (!visited.has(next)) { visited.add(next); pending.push(next); }
      }
    }
    return visited;
  };
  const fromStart = reachable(starts.map((node) => node.id), false);
  const toEnd = reachable(ends.map((node) => node.id), true);
  if (model.nodes.some((node) => !fromStart.has(node.id) || !toEnd.has(node.id))) {
    throw new Error("每个流程节点都必须从开始可达，并有通往结束的路径。");
  }
  const targets = { swimlane: lanes, node: nodes, relationship: relations };
  for (const row of traceability) {
    if (!validRequirementIds.has(row.requirementId) || !targets[row.targetKind].has(row.targetId)) {
      throw new Error(`流程追踪引用无效：${row.requirementId} -> ${row.targetId}`);
    }
  }
  const mapped = new Set(traceability.map((row) => `${row.targetKind}:${row.targetId}`));
  for (const node of model.nodes.filter((node) => node.type === "activity" || node.type === "decision")) {
    if (!mapped.has(`node:${node.id}`)) throw new Error(`业务动作或判断缺少来源需求：${node.id}`);
  }
  for (const lane of model.swimlanes.filter((lane) => lane.id !== "system")) {
    if (!mapped.has(`swimlane:${lane.id}`)) throw new Error(`人员或外部系统泳道缺少来源需求：${lane.id}`);
  }
  return result;
}
