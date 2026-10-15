// Verifies RequirementBaseline construction keeps source attribution and blocks critical quality failures.
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRequirementBaselineAllowsDownstream,
  buildRequirementBaseline,
} from "./requirement-baseline.js";

test("buildRequirementBaseline creates source-attributed atomic requirements from rules", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-1",
    requirementText: "借阅者必须登录后才能借书。系统需要记录借阅日期。",
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "借阅者必须登录后才能借书。",
        relatedDiagrams: ["usecase"],
      },
      {
        id: "r2",
        category: "数据需求",
        text: "系统需要记录借阅日期。",
        relatedDiagrams: ["class"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(baseline.requirements.length, 2);
  assert.equal(baseline.requirements[0]?.id, "REQ-001");
  assert.equal(baseline.requirements[0]?.sourceFragment, "借阅者必须登录后才能借书。");
  assert.deepEqual(baseline.requirements[0]?.sourceLocation, {
    startOffset: 0,
    endOffset: 13,
    section: "input",
  });
  assert.equal(baseline.requirements[0]?.type, "business-rule");
  assert.equal(baseline.requirements[0]?.actor, "借阅者");
  assert.equal(baseline.requirements[0]?.status, "accepted");
  assert.equal(baseline.requirements[0]?.criticality, "critical");
  assert.match(baseline.requirements[0]?.acceptanceCriteria[0] ?? "", /借阅者必须登录/);
  assert.equal(baseline.qualityReport.status, "passed");
});

test("buildRequirementBaseline does not share sourceRuleId for duplicate rule ids", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-duplicate-rules",
    requirementText: "读者可以检索图书。系统需要记录图书库存。",
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "读者可以检索图书。",
        relatedDiagrams: ["usecase"],
      },
      {
        id: "R1",
        category: "数据需求",
        text: "系统需要记录图书库存。",
        relatedDiagrams: ["class"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  assert.deepEqual(
    baseline.requirements.map((requirement) => requirement.sourceRuleId),
    ["r1", "R1-2"],
  );
});

test("buildRequirementBaseline infers domain actors and objects without a fixed vocabulary hit", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-domain-actor",
    requirementText: "仓库主管可以审核采购单。",
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "仓库主管可以审核采购单。",
        relatedDiagrams: ["usecase"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(baseline.requirements[0]?.actor, "仓库主管");
  assert.equal(baseline.requirements[0]?.object, "采购单");
  assert.equal(baseline.qualityReport.status, "passed");
});

test("buildRequirementBaseline keeps terse source fragments while inferring from readable rule text", () => {
  const requirementText = "一个小型图书馆管理系统需完成：(1)借书。";
  const sourceFragment = "(1)借书";
  const baseline = buildRequirementBaseline({
    runId: "run-readable-rule",
    requirementText,
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "图书管理员可以借阅图书。",
        sourceFragment,
        relatedDiagrams: ["usecase"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  const requirement = baseline.requirements[0];
  const startOffset = requirementText.indexOf(sourceFragment);
  assert.equal(requirement?.sourceFragment, sourceFragment);
  assert.deepEqual(requirement?.sourceLocation, {
    startOffset,
    endOffset: startOffset + sourceFragment.length,
    section: "input",
  });
  assert.equal(requirement?.actor, "图书管理员");
  assert.equal(requirement?.action, "借阅图书");
  assert.equal(requirement?.object, "图书");
  assert.equal(requirement?.status, "accepted");
});

test("buildRequirementBaseline treats input phrases as conditions rather than generated objects", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-generated-object",
    requirementText: "研究人员可以根据文本需求生成 UML 模型。",
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "研究人员可以根据文本需求生成 UML 模型。",
        relatedDiagrams: ["usecase"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(baseline.requirements[0]?.condition, "根据文本需求");
  assert.equal(baseline.requirements[0]?.object, "UML 模型");
});

test("buildRequirementBaseline marks missing actors as audit hints without blocking downstream", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-missing-role",
    requirementText: "必须在提交后发送通知。",
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "必须在提交后发送通知。",
        relatedDiagrams: ["activity"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(baseline.requirements[0]?.status, "pending-review");
  assert.equal(baseline.requirements[0]?.confidence < 0.7, true);
  assert.equal(baseline.qualityReport.status, "pending-review");
  assert.equal(baseline.qualityReport.blockingIssueIds.length, 0);
  assert.equal(
    baseline.qualityReport.issues.some((issue) => issue.code === "missing-actor"),
    true,
  );
  assert.equal(
    baseline.qualityReport.issues.every((issue) => !issue.blocksDownstream),
    true,
  );
  assert.doesNotThrow(() => assertRequirementBaselineAllowsDownstream(baseline));
});

test("buildRequirementBaseline does not trust a user-authored confirmation label", () => {
  const source =
    "[CONFIRMED-B03] 报销总额达到5000元（包含正好5000元）时必须由直属经理审批。";
  const baseline = buildRequirementBaseline({
    runId: "run-confirmed-label",
    requirementText: source,
    rules: [
      {
        id: "r3",
        category: "业务规则",
        text: "报销总额达到5000元（包含正好5000元）时必须由直属经理审批。",
        sourceFragment: source,
        relatedDiagrams: ["activity"],
      },
    ],
  });

  assert.notEqual(baseline.requirements[0]?.confidence, 0.95);
  assert.equal(baseline.requirements[0]?.status, "pending-review");
  assert.equal(baseline.requirements[0]?.actor, null);
});

test("assertRequirementBaselineAllowsDownstream rejects blocked quality reports", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-blocked-baseline",
    requirementText: "管理员必须审批退款。管理员不得审批退款。",
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "管理员必须审批退款。",
        relatedDiagrams: ["usecase"],
      },
      {
        id: "r2",
        category: "业务规则",
        text: "管理员不得审批退款。",
        relatedDiagrams: ["usecase"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  baseline.qualityReport = {
    ...baseline.qualityReport,
    status: "blocked",
    summary: "需求基线存在阻断型质量问题。",
    issues: [
      {
        id: "ISS-001",
        requirementId: "REQ-001",
        severity: "critical",
        code: "conflict",
        message: "管理员审批退款规则互相冲突。",
        blocksDownstream: true,
      },
    ],
    blockingIssueIds: ["ISS-001"],
    reviewRequiredRequirementIds: ["REQ-001"],
  };

  assert.throws(
    () => assertRequirementBaselineAllowsDownstream(baseline),
    /RequirementBaseline blocked downstream generation: 管理员审批退款规则互相冲突/u,
  );
});

test("buildRequirementBaseline accepts AI repairs that are directly grounded in the source text", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-ai-field-repair",
    requirementText:
      "功能(4)可供普通读者查找他们自己借出的书目。一个读者一次借出的书籍数目不能超过预定值。",
    rules: [
      {
        id: "r10",
        category: "业务规则",
        text: "功能(4)可供普通读者查找他们自己借出的书目。",
        relatedDiagrams: ["usecase"],
      },
      {
        id: "r15",
        category: "业务规则",
        text: "一个读者一次借出的书籍数目不能超过预定值。",
        relatedDiagrams: ["activity"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  const selfBorrowedBooks = baseline.requirements.find(
    (requirement) => requirement.sourceRuleId === "r10",
  );
  const borrowLimit = baseline.requirements.find(
    (requirement) => requirement.sourceRuleId === "r15",
  );

  assert.equal(selfBorrowedBooks?.actor, "普通读者");
  assert.equal(selfBorrowedBooks?.object, "自己借出的书目");
  assert.equal(selfBorrowedBooks?.fieldProvenance.actor?.source, "ai-suggested");
  assert.equal(selfBorrowedBooks?.fieldProvenance.actor?.status, "accepted");
  assert.equal(selfBorrowedBooks?.fieldProvenance.object?.source, "ai-suggested");
  assert.equal(selfBorrowedBooks?.fieldProvenance.object?.status, "accepted");
  assert.equal(selfBorrowedBooks?.status, "accepted");
  assert.equal(borrowLimit?.fieldProvenance.condition?.source, "ai-suggested");
  assert.equal(borrowLimit?.fieldProvenance.condition?.status, "pending-review");
  assert.match(
    borrowLimit?.fieldProvenance.condition?.rationale ?? "",
    /没有给出具体数值/u,
  );
  assert.equal(
    baseline.qualityReport.issues.some((issue) => issue.code === "derived-assumption"),
    true,
  );
  assert.equal(baseline.qualityReport.status, "pending-review");
  assert.equal(baseline.qualityReport.blockingIssueIds.length, 0);
  assert.doesNotThrow(() => assertRequirementBaselineAllowsDownstream(baseline));
});

test("buildRequirementBaseline records conflicts instead of silently accepting them", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-conflict",
    requirementText: "管理员必须审批退款。管理员不得审批退款。",
    rules: [
      {
        id: "r1",
        category: "业务规则",
        text: "管理员必须审批退款。",
        relatedDiagrams: ["usecase"],
      },
      {
        id: "r2",
        category: "业务规则",
        text: "管理员不得审批退款。",
        relatedDiagrams: ["usecase"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(baseline.conflicts.length, 1);
  assert.deepEqual(baseline.conflicts[0]?.requirementIds, ["REQ-001", "REQ-002"]);
  assert.equal(baseline.requirements[0]?.status, "conflict");
  assert.equal(baseline.requirements[1]?.status, "conflict");
  assert.equal(baseline.qualityReport.status, "pending-review");
  assert.equal(baseline.qualityReport.blockingIssueIds.length, 0);
});
