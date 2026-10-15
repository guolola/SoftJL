// Covers semantic structure failures that must be repaired before a business flow is persisted.
import assert from "node:assert/strict";
import test from "node:test";
import { feasibilityBusinessFlowSchema } from "@uml-platform/contracts";
import { normalizeFeasibilityBusinessFlow } from "./business-flow-normalizer.js";

function flow() {
  return feasibilityBusinessFlowSchema.parse({
    model: {
      diagramKind: "activity", title: "申请流程", summary: "提交、校验并返回结果", notes: [],
      swimlanes: [{ id: "user", name: "申请人" }, { id: "system", name: "目标系统" }],
      nodes: [
        { id: "start", type: "start" },
        { id: "submit", type: "activity", name: "提交申请", actorOrLane: "user", input: [], output: [] },
        { id: "check", type: "activity", name: "校验申请", actorOrLane: "system", input: [], output: [] },
        { id: "decision", type: "decision", question: "申请有效？" },
        { id: "accepted", type: "end", name: "受理" }, { id: "rejected", type: "end", name: "拒绝" },
      ],
      relationships: [
        { id: "e1", type: "control_flow", sourceId: "start", targetId: "submit" },
        { id: "e2", type: "control_flow", sourceId: "submit", targetId: "check" },
        { id: "e3", type: "control_flow", sourceId: "check", targetId: "decision" },
        { id: "e4", type: "control_flow", sourceId: "decision", targetId: "accepted", guard: "有效" },
        { id: "e5", type: "control_flow", sourceId: "decision", targetId: "rejected", guard: "无效" },
      ],
    },
    traceability: [
      { requirementId: "R1", targetId: "user", targetKind: "swimlane" },
      ...["submit", "check", "decision"].map((targetId) => ({ requirementId: "R1", targetId, targetKind: "node" })),
    ],
  });
}
const rules = new Set(["R1"]);

test("accepts connected lanes and guarded alternatives, including provider null optionals", () => {
  const value = flow();
  Object.assign(value.model.nodes[1]!, { description: null });
  const result = normalizeFeasibilityBusinessFlow(value, rules);
  assert.equal(result.model.modelId, "feasibility-business-flow");
  assert.equal(result.model.nodes.length, 6);
  assert.equal(result.model.nodes[1]?.description, undefined);
});

test("rejects unknown rules, unmapped actions and invalid trace targets", () => {
  const value = flow();
  assert.throws(() => normalizeFeasibilityBusinessFlow(value, new Set(["R2"])), /追踪引用无效/);
  value.traceability = value.traceability.filter((row) => row.targetId !== "check");
  assert.throws(() => normalizeFeasibilityBusinessFlow(value, rules), /缺少来源需求/);
  value.traceability.push({ requirementId: "R1", targetId: "missing", targetKind: "node" });
  assert.throws(() => normalizeFeasibilityBusinessFlow(value, rules), /追踪引用无效/);
});

test("rejects missing lanes, duplicate ids and invalid endpoints", () => {
  const value = flow();
  Object.assign(value.model.nodes[1]!, { actorOrLane: "unknown" });
  assert.throws(() => normalizeFeasibilityBusinessFlow(value, rules), /missing-reference/);
  value.model.nodes.push({ id: "check", type: "end", name: "结束" });
  assert.throws(() => normalizeFeasibilityBusinessFlow(value, rules), /duplicate-id/);
  const badEdge = flow();
  badEdge.model.relationships[0]!.targetId = "missing";
  assert.throws(() => normalizeFeasibilityBusinessFlow(badEdge, rules), /missing-endpoint/);
});

test("rejects isolated nodes, dead-end loops and missing branch guards", () => {
  const isolated = flow();
  isolated.model.nodes.push({ id: "isolated", type: "end", name: "孤立" });
  assert.throws(() => normalizeFeasibilityBusinessFlow(isolated, rules), /unreachable-node/);
  const loop = flow();
  loop.model.relationships[2]!.targetId = "check";
  assert.throws(() => normalizeFeasibilityBusinessFlow(loop, rules), /split-degree|unreachable-node/);
  const missingGuard = flow();
  delete missingGuard.model.relationships[3]!.guard;
  assert.throws(() => normalizeFeasibilityBusinessFlow(missingGuard, rules), /不同条件/);
});
