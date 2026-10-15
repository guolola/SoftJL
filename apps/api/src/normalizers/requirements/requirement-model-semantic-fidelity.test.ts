// Verifies confirmed inclusive thresholds cannot be weakened in generated UML.
import assert from "node:assert/strict";
import test from "node:test";
import type { ActivityDiagramSpec, RequirementRule } from "@uml-platform/contracts";
import {
  assertRequirementModelSemanticFidelity,
  findRequirementModelSemanticConflicts,
} from "./requirement-model-semantic-fidelity.js";

const rules: RequirementRule[] = [
  {
    id: "r3",
    category: "业务规则",
    text: "报销总额达到5000元（包含正好5000元）时必须由直属经理审批。",
    relatedDiagrams: ["activity"],
  },
];

function activity(condition: string, complement: string): ActivityDiagramSpec {
  return {
    diagramKind: "activity",
    title: "审批流程",
    summary: "按金额决定审批路径。",
    notes: [],
    swimlanes: [{ id: "lane", name: "系统" }],
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "decision", type: "decision", name: condition },
      { id: "approve", type: "activity", name: "直属经理审批", actorOrLane: "lane" },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      {
        id: "high",
        type: "control_flow",
        sourceId: "decision",
        targetId: "approve",
        condition,
      },
      {
        id: "low",
        type: "control_flow",
        sourceId: "decision",
        targetId: "end",
        condition: complement,
      },
    ],
  };
}

test("finds weakened inclusive amount threshold and wrong complement", () => {
  const conflicts = findRequirementModelSemanticConflicts(
    rules,
    [activity("Amount exceeds 5000", "Amount <= 5000")],
  );

  assert.ok(conflicts.some((item) => item.actual.includes(">5000")));
  assert.ok(conflicts.some((item) => item.actual.includes("<=5000")));
  assert.throws(
    () =>
      assertRequirementModelSemanticFidelity(
        rules,
        [activity("Amount exceeds 5000", "Amount <= 5000")],
      ),
    /semantic fidelity failed/,
  );
});

test("accepts inclusive threshold and strict complementary branch", () => {
  assert.doesNotThrow(() =>
    assertRequirementModelSemanticFidelity(
      rules,
      [activity("Amount >= 5000", "Amount < 5000")],
    ),
  );
});

test("rejects an exact-only branch that drops amounts above the inclusive threshold", () => {
  assert.throws(
    () =>
      assertRequirementModelSemanticFidelity(
        rules,
        [activity("Amount exactly 5000", "Amount not 5000")],
      ),
    /semantic fidelity failed/,
  );
});
