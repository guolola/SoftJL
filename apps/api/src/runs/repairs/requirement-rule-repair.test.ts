// Covers semantic safety gates applied to LLM-generated requirement repair candidates.
import assert from "node:assert/strict";
import test from "node:test";
import type { RepairRequirementRuleRequest } from "@uml-platform/contracts";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import { applyRequirementRepairSuggestion } from "./requirement-rule-repair.js";

function repairInput(): RepairRequirementRuleRequest {
  const rule = {
    id: "r7",
    category: "功能需求" as const,
    text:
      "预约成功、取消和开始前1小时通过站内消息通知；通知失败则重试，并记录最终状态。",
    relatedDiagrams: ["activity" as const],
  };
  return {
    requirementText: rule.text,
    rule,
    baseline: buildRequirementBaseline({
      runId: "run-repair-semantics",
      requirementText: rule.text,
      rules: [rule],
      createdAt: "2026-07-30T00:00:00.000Z",
    }),
  };
}

test("requirement repair blocks a candidate that deletes notification triggers", () => {
  const result = applyRequirementRepairSuggestion(
    repairInput(),
    JSON.stringify({
      fields: {
        actor: {
          source: "ai-suggested",
          status: "accepted",
          value: "系统",
          originalValue: null,
          rationale: "补齐执行者",
        },
        action: {
          source: "ai-suggested",
          status: "accepted",
          value: "发送站内消息通知；通知失败则重试并记录最终状态",
          originalValue:
            "预约成功、取消和开始前1小时通过站内消息通知；通知失败则重试，并记录最终状态。",
          rationale: "重新组织动作",
        },
        object: {
          source: "ai-suggested",
          status: "accepted",
          value: "站内消息通知",
          originalValue: "通知",
          rationale: "补齐对象",
        },
        condition: {
          source: "ai-suggested",
          status: "accepted",
          value: "通知失败",
          originalValue: null,
          rationale: "补齐条件",
        },
        outcome: {
          source: "ai-suggested",
          status: "accepted",
          value: "系统记录最终状态",
          originalValue: "系统反馈异常原因",
          rationale: "补齐结果",
        },
      },
      confidence: 0.93,
      status: "accepted",
      rationale: "补齐结构化字段",
    }),
  );

  assert.equal(result.requirement.status, "pending-review");
  assert.equal(result.qualityReport.status, "blocked");
  assert.equal(
    result.qualityReport.issues.some((issue) => issue.code === "semantic-loss"),
    true,
  );
  assert.match(result.blockingReasons.join("；"), /预约成功.*取消.*开始前1小时/u);
});

test("requirement repair keeps an equivalent inclusive boundary accepted", () => {
  const rule = {
    id: "r9",
    category: "业务规则" as const,
    text: "参会人数50人以上或结束时间晚于21:00时必须进入部门审批。",
    relatedDiagrams: ["activity" as const],
  };
  const input: RepairRequirementRuleRequest = {
    requirementText: rule.text,
    rule,
    baseline: buildRequirementBaseline({
      runId: "run-boundary-repair",
      requirementText: rule.text,
      rules: [rule],
      createdAt: "2026-07-30T00:00:00.000Z",
    }),
  };
  const result = applyRequirementRepairSuggestion(
    input,
    JSON.stringify({
      fields: {
        action: {
          source: "ai-suggested",
          status: "accepted",
          value: "参会人数大于等于50人或者结束时间晚于21:00时必须进入部门审批",
          originalValue: rule.text,
          rationale: "显式表达包含边界",
        },
      },
      confidence: 0.9,
      status: "accepted",
      rationale: "保留原始边界",
    }),
  );

  assert.equal(
    result.qualityReport.issues.some((issue) => issue.code === "semantic-loss"),
    false,
  );
});

test("requirement repair tolerates nullable optional provider metadata", () => {
  const result = applyRequirementRepairSuggestion(
    repairInput(),
    JSON.stringify({
      fields: {
        actor: {
          source: "ai-suggested",
          status: "accepted",
          value: "系统",
          originalValue: null,
          rationale: null,
          issueIds: null,
        },
      },
      confidence: "92%",
      status: "accepted",
      rationale: "只补齐缺失角色",
    }),
  );

  assert.equal(result.requirement.fieldProvenance?.actor?.value, "系统");
  assert.equal(result.requirement.fieldProvenance?.actor?.issueIds, undefined);
  assert.equal(result.requirement.fieldProvenance?.actor?.rationale, undefined);
});
