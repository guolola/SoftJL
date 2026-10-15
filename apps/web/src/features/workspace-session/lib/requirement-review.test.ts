// Verifies requirement review cannot clear semantic-loss gates merely by marking a rule accepted.
import { describe, expect, it } from "vitest";
import type {
  AtomicRequirement,
  RequirementBaseline,
} from "@uml-platform/contracts";
import {
  markRequirementReviewed,
  mergeReviewedRequirement,
  rebuildRequirementReviewQualityReport,
  resolveSafeRequirementReviewCandidates,
} from "./requirement-review";
import { reviewCandidateStateLabel } from "../../requirements/lib/requirement-review-view-model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

describe("requirement review row state", () => {
  it("does not hide a pending baseline behind a rejected repair decision", () => {
    const rejected = { status: "rejected" } as WorkspaceRecord["requirementReviewCandidates"][string];
    expect(reviewCandidateStateLabel(rejected, "有待确认提示")).toBe("有待确认提示");
    expect(reviewCandidateStateLabel(rejected, "已生成")).toBe("已确认");
  });
});

function notificationRequirement(): AtomicRequirement {
  return {
    id: "REQ-007",
    sourceFragment:
      "预约成功、取消和开始前1小时通过站内消息通知；通知失败则重试，并记录最终状态。",
    type: "functional",
    actor: "系统",
    subject: null,
    action: "发送站内消息通知；通知失败则重试并记录最终状态",
    object: "站内消息通知",
    condition: "通知失败",
    outcome: "系统记录最终状态",
    confidence: 0.69,
    status: "pending-review",
    criticality: "critical",
    acceptanceCriteria: [
      "预约成功、取消和开始前1小时通过站内消息通知；通知失败则重试，并记录最终状态。",
    ],
    fieldProvenance: {},
    sourceRuleId: "r7",
  };
}

function baseline(): RequirementBaseline {
  const requirement = notificationRequirement();
  return {
    runId: "run-semantic-review",
    sourceDocumentId: "inline-requirement",
    requirements: [requirement],
    assumptions: [],
    conflicts: [],
    qualityReport: {
      runId: "run-semantic-review",
      status: "blocked",
      summary: "智能修复删除了原始语义。",
      issues: [
        {
          id: "SEM-REQ-007-LOSS",
          requirementId: requirement.id,
          severity: "critical",
          code: "semantic-loss",
          message: "智能修复删除了原始语义：预约成功、取消、开始前1小时。",
          blocksDownstream: true,
        },
      ],
      blockingIssueIds: ["SEM-REQ-007-LOSS"],
      reviewRequiredRequirementIds: [requirement.id],
    },
    createdAt: "2026-07-30T00:00:00.000Z",
  };
}

describe("requirement semantic review gates", () => {
  it("keeps semantic-loss issues blocking after a generic accept operation", () => {
    const source = baseline();
    const reviewed = markRequirementReviewed(source.requirements[0]!);
    const merged = mergeReviewedRequirement(source, reviewed);

    expect(merged.qualityReport.status).toBe("blocked");
    expect(merged.qualityReport.blockingIssueIds).toEqual([
      "SEM-REQ-007-LOSS",
    ]);
    expect(
      rebuildRequirementReviewQualityReport(merged).issues[0]?.code,
    ).toBe("semantic-loss");
  });

  it("automatically accepts a fact-preserving candidate after quality checks pass", () => {
    const before = notificationRequirement();
    const source: RequirementBaseline = {
      ...baseline(),
      requirements: [before],
      qualityReport: {
        runId: "run-auto-review",
        status: "pending-review",
        summary: "置信度需要复核。",
        issues: [{
          id: "LOW-REQ-007",
          requirementId: before.id,
          severity: "warning",
          code: "low-confidence",
          message: "置信度较低。",
          blocksDownstream: false,
        }],
        blockingIssueIds: [],
        reviewRequiredRequirementIds: [before.id],
      },
    };
    const after: AtomicRequirement = {
      ...structuredClone(before),
      confidence: 0.92,
      fieldProvenance: {
        action: {
          source: "source-text",
          status: "accepted",
          value: before.action,
          originalValue: before.action,
          rationale: "来自原始需求。",
        },
      },
    };

    const result = resolveSafeRequirementReviewCandidates(source, {
      r7: {
        ruleId: "r7",
        beforeRequirement: before,
        afterRequirement: after,
        repairRationale: "整理原始表述。",
        blockingReasons: [],
        status: "pending",
        errorMessage: null,
        createdAt: "2026-09-22T00:00:00.000Z",
      },
    });

    expect(result.acceptedRuleIds).toEqual(["r7"]);
    expect(result.blockingRuleIds).toEqual([]);
    expect(result.baseline.qualityReport.status).toBe("passed");
    expect(result.candidates.r7?.status).toBe("accepted");
    expect(
      result.candidates.r7?.afterRequirement?.fieldProvenance.action?.rationale,
    ).toContain("质量检查自动通过");
  });

  it("keeps candidates with unsupported facts pending for manual review", () => {
    const before = notificationRequirement();
    const after: AtomicRequirement = {
      ...structuredClone(before),
      actor: "不存在于原文的超级管理员",
      confidence: 0.95,
    };

    const result = resolveSafeRequirementReviewCandidates(baseline(), {
      r7: {
        ruleId: "r7",
        beforeRequirement: before,
        afterRequirement: after,
        repairRationale: "补充参与者。",
        blockingReasons: [],
        status: "pending",
        errorMessage: null,
        createdAt: "2026-09-22T00:00:00.000Z",
      },
    });

    expect(result.acceptedRuleIds).toEqual([]);
    expect(result.candidates.r7?.status).toBe("pending");
    expect(result.blockingRuleIds).toEqual(["r7"]);
  });
});
