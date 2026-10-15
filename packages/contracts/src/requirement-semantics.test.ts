// Verifies deterministic semantic facts catch destructive requirement repairs without relying on an LLM.
import assert from "node:assert/strict";
import test from "node:test";
import type { AtomicRequirement } from "./requirements.js";
import {
  compareRequirementSemantics,
  extractProtectedRequirementFacts,
  unsupportedRequirementFacts,
} from "./requirement-semantics.js";

function requirement(patch: Partial<AtomicRequirement> = {}): AtomicRequirement {
  return {
    id: "REQ-007",
    sourceFragment:
      "预约成功、取消和开始前1小时通过站内消息通知；通知失败则重试，并记录最终状态。",
    type: "functional",
    actor: null,
    subject: null,
    action:
      "预约成功、取消和开始前1小时通过站内消息通知；通知失败则重试，并记录最终状态",
    object: "通知",
    condition: null,
    outcome: "系统反馈异常原因",
    confidence: 0.82,
    status: "accepted",
    criticality: "critical",
    acceptanceCriteria: [],
    fieldProvenance: {},
    ...patch,
  };
}

test("semantic comparison catches deleted notification triggers", () => {
  const before = requirement();
  const after = requirement({
    actor: "系统",
    action: "发送站内消息通知；通知失败则重试并记录最终状态",
    object: "站内消息通知",
    condition: "通知失败",
    outcome: "系统记录最终状态",
  });

  const labels = compareRequirementSemantics(before, after).lostFacts.map(
    (fact) => fact.label,
  );
  assert.equal(labels.includes("预约成功"), true);
  assert.equal(labels.includes("取消"), true);
  assert.equal(labels.some((label) => label.includes("开始前1小时")), true);
});

test("semantic comparison normalizes equivalent inclusive boundaries", () => {
  const before = requirement({
    action: "参会人数50人以上或结束时间晚于21:00时进入审批",
    object: "预约",
  });
  const after = requirement({
    action: "参会人数大于等于50人或者结束时间晚于21:00时进入审批",
    object: "预约",
  });

  assert.deepEqual(compareRequirementSemantics(before, after).lostFacts, []);
});

test("semantic facts normalize reached thresholds and English model comparators", () => {
  const confirmed = extractProtectedRequirementFacts({
    actor: null,
    subject: null,
    action: "报销总额达到5000元（包含正好5000元）时必须审批。",
    object: null,
    condition: null,
    outcome: null,
  });
  const generated = extractProtectedRequirementFacts({
    actor: null,
    subject: null,
    action: "Does reimbursement amount exceed 5000元?",
    object: null,
    condition: null,
    outcome: null,
  });

  assert.ok(confirmed.some((fact) => fact.key === "boundary:>=:5000:元"));
  assert.ok(confirmed.some((fact) => fact.key === "boundary:=:5000:元"));
  assert.ok(generated.some((fact) => fact.key === "boundary:>:5000:元"));
});

test("unsupported facts identify invented numeric thresholds", () => {
  const facts = unsupportedRequirementFacts(
    "大额报销需要财务总监审批。",
    requirement({
      action: "报销金额超过20000元时需要财务总监审批",
      object: "报销",
    }),
  );
  assert.equal(facts.some((fact) => fact.label.includes("20000元")), true);
});
