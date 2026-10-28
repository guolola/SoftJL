import { createRequirementBaselineSnapshot } from "@uml-platform/contracts";
// Verifies generation result dialog copy for document completion edge cases.
import { describe, expect, it, vi } from "vitest";
import {
  documentRunCompletionDialog,
  designRunCompletionDialog,
  failedRunResultDialog,
  partialRunResultDialog,
  requirementRunCompletionDialog,
} from "./generation-dialog-actions";
import { operationFailureForCode } from "./operation-failure";
import {
  clearRequirementRuleRequest,
  pendingRequirementRuleRequest,
  PROJECT_WORKSPACE_TARGET_REQUEST_EVENT,
} from "../../../shared/lib/app-navigation";

describe("documentRunCompletionDialog", () => {
  it("offers a failed-only retry and confirmation with named partial results", async () => {
    const onRetry = vi.fn();
    const dialog = partialRunResultDialog({ runId: "partial", stageLabel: "需求模型",
      succeeded: ["用例模型"], failed: ["领域概念模型"], onRetry });
    expect(dialog).toMatchObject({ tone: "warning", title: "部分生成成功", dismissLabel: "确认" });
    expect(dialog?.message).toBe("生成成功：用例模型。\n生成失败：领域概念模型。");
    expect(dialog?.primaryAction?.label).toBe("重试失败模型");
    await dialog?.primaryAction?.onSelect();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(partialRunResultDialog({ runId: "failed", stageLabel: "需求模型", succeeded: [], failed: ["用例模型"] })).toBeNull();
  });
  it("reports a successful design run without a quality hint or warning", () => {
    const dialog = designRunCompletionDialog({ diagramFailureCount: 0, runId: "design" });
    expect(dialog.tone).toBe("success");
    expect(dialog.message).toBe("生成完成。");
  });

  it("retains actual design failures in completion feedback", () => {
    const dialog = designRunCompletionDialog({ diagramFailureCount: 2, runId: "design" });
    expect(dialog.tone).toBe("warning");
    expect(dialog.message).toContain("2 个模型生成失败");
    expect(dialog.message).not.toContain("质量提示");
  });

  it("reports skipped input when requirement extraction completes", () => {
    const dialog = requirementRunCompletionDialog({
      diagramFailureCount: 0,
      isRulesOnly: true,
      ignoredCount: 2,
      runId: "rules-with-skips",
    });
    expect(dialog.tone).toBe("warning");
    expect(dialog.message).toContain("2");
    expect(dialog.message).toContain("无关");
  });

  it("surfaces missing diagram warnings for completed documents", () => {
    const dialog = documentRunCompletionDialog({
      documentTitle: "需求规格说明书",
      runId: "doc-warning",
      missingArtifactCount: 2,
    });

    expect(dialog.title).toBe("说明书已生成但缺图");
    expect(dialog.message).toBe(
      "需求规格说明书已生成，但有 2 项图源缺失，请复核后交付。",
    );
    expect(dialog.runId).toBe("doc-warning");
    expect(dialog.stageLabel).toBe("说明书");
  });

  it("routes pending review failures to rules without inventing task details", () => {
    const dialog = failedRunResultDialog({
      failure: operationFailureForCode("REQUIREMENT_REVIEWS_PENDING", {
        params: { count: 2 },
        details: { ruleIds: ["r1", "r2"] },
      }),
      runId: null,
      stageLabel: "需求模型",
    });

    expect(dialog.title).toBe("生成前需要确认需求规则");
    expect(dialog.message).toContain("2 条需求规则尚未确认");
    expect(dialog.message).toContain("涉及规则：r1、r2");
    expect(dialog.primaryAction?.label).toBe("查看待确认规则");
    expect(dialog.primaryAction?.label).not.toBe("查看任务详情");
  });
  it("shows the atomic requirement ID and opens the blocked rule", () => {
    const dialog = failedRunResultDialog({
      failure: operationFailureForCode("REQUIREMENT_REVIEWS_PENDING", {
        params: { count: 1 }, details: { ruleIds: ["r2"] },
      }),
      runId: null, stageLabel: "设计模型",
      requirementBaseline: createRequirementBaselineSnapshot({ runId: "test", requirementText: "用户预约", rules: [{ id: "r2", text: "用户预约", type: "functional" as const }] }),
    });
    expect(dialog.message).toContain("r2（REQ-002）");
    dialog.primaryAction?.onSelect?.();
    expect(pendingRequirementRuleRequest()).toBe("r2");
    clearRequirementRuleRequest("r2");
  });

  it("uses the system requirements label when the failure has no rule ID to open", () => {
    const dialog = failedRunResultDialog({
      failure: operationFailureForCode("REQUIREMENT_BASELINE_BLOCKED"),
      runId: null,
      stageLabel: "需求规则",
    });
    const targets: string[] = [];
    const listener = (event: Event) => targets.push((event as CustomEvent<string>).detail);
    window.addEventListener(PROJECT_WORKSPACE_TARGET_REQUEST_EVENT, listener);
    try {
      expect(dialog.primaryAction?.label).toBe("前往系统需求");
      dialog.primaryAction?.onSelect?.();
      expect(targets).toEqual(["system-requirements"]);
      expect(pendingRequirementRuleRequest()).toBeNull();
    } finally {
      window.removeEventListener(PROJECT_WORKSPACE_TARGET_REQUEST_EVENT, listener);
    }
  });

  it("does not show task details for an unknown failure before a task exists", () => {
    const dialog = failedRunResultDialog({
      failure: operationFailureForCode("RUN_INTERNAL_ERROR"),
      runId: null,
      stageLabel: "启动校验",
    });

    expect(dialog.primaryAction).toBeUndefined();
  });

  it("shows the API request ID for a provider circuit rejection", () => {
    const dialog = failedRunResultDialog({
      failure: {
        ...operationFailureForCode("PROVIDER_CIRCUIT_OPEN"),
        requestId: "req-provider-9",
      },
      runId: null,
      stageLabel: "需求规则",
    });

    expect(dialog.message).toContain("req-provider-9");
    expect(dialog.primaryAction?.label).toBe("查看连接配置");
  });
});
