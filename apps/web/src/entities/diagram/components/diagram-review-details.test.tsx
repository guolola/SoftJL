// Verifies categorized disclosures, actual repair history and confirmation without changing verdicts.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DiagramVisualReview } from "@uml-platform/contracts";
import { DiagramReviewDetails } from "./diagram-review-details";

const review: DiagramVisualReview = { status: "pending_review", reason: "结构检查待确认", issues: ["连线交叉", "外键标记错误"], attempts: 2, structureAttempts: 1, repairAttempts: 1, checkedAt: "now", stopReason: "候选越界",
  findings: [{ id: "fk", modelId: "table", layer: "model", code: "constraint-marker", category: "business_constraint", observation: "外键标记错误", elementId: "column", expected: true, actual: false, verification: "verified", repairable: true, evidence: [{ source: "constraint", reference: "FK1", detail: "明确外键" }] }],
  repairHistory: [{ round: 1, target: "model", issueIds: ["fk"], beforeFingerprint: "before", status: "rejected", changes: ["标题也被改动"], reason: "候选越界" }],
};
describe("categorized review details", () => {
  it.each([false, true])("shows only the retained summary and counters in model notices: confirmed=%s", (confirmed) => {
    render(<DiagramReviewDetails summaryOnly confirmed={confirmed} review={{ ...review, repairAttempts: 0 }} />);
    const summary = screen.getByRole("region", { name: "视觉检查摘要" });
    expect(within(summary).getByText("结构检查待确认")).toBeVisible();
    if (confirmed) expect(within(summary).getByText(/内容已人工确认/)).toBeVisible();
    expect(within(summary).getByText("结构核对 1 次 · 图片检查 2 次 · 纠错尝试 0 次")).toBeVisible();
    expect(within(summary).queryByRole("heading")).not.toBeInTheDocument();
    expect(within(summary).queryByText(/外键标记错误|停止原因|查看问题依据与处理详情|修复记录/)).not.toBeInTheDocument();
    expect(review.status).toBe("pending_review");
    expect(review.confirmedAt).toBeUndefined();
  });
  it("shows only nonempty groups and reveals evidence through an accessible disclosure", () => {
    const { container } = render(<DiagramReviewDetails review={review} />);
    expect(screen.getAllByRole("heading").map((node) => node.textContent)).toEqual(["业务内容疑问（1）"]);
    expect(screen.queryByText("连线交叉")).not.toBeInTheDocument();
    expect(screen.getByText("预期值：true")).not.toBeVisible();
    fireEvent.click(screen.getByText("查看问题依据与处理详情"));
    expect(screen.getByText("预期值：true")).toBeVisible();
    expect(screen.getByText("实际值：false")).toBeVisible();
    expect(screen.getByText("对应模型：table")).toBeVisible();
    expect(screen.getByText("依据：FK1 · 明确外键")).toBeVisible();
    expect(screen.getAllByText(/已拒绝/)[0]).toBeVisible();
    expect(container.firstChild).toHaveClass("text-black", "dark:text-foreground");
  });
  it("retains original findings after human confirmation and displays successful repairs accurately", () => {
    render(<DiagramReviewDetails confirmed review={{ ...review, repairHistory: [{ ...review.repairHistory![0], status: "accepted", reason: "已通过校验" }] }} />);
    expect(screen.getByText(/内容已人工确认/)).toBeVisible();
    expect(within(screen.getByRole("region", { name: "业务内容疑问" })).getByText(/外键标记错误/)).toBeVisible();
    expect(screen.getAllByText(/已接受/)[0]).toBeVisible();
    expect(review.status).toBe("pending_review");
  });
  it("shows a skipped check reason without inventing a problem or unknown repair count", () => {
    render(<DiagramReviewDetails review={{ status: "skipped", reason: "模型不支持图片", stopReason: "模型不支持图片", checkOutcome: "skipped", issues: [], attempts: 1, checkedAt: "now" }} />);
    expect(screen.getByText("检查已跳过：模型不支持图片")).toBeVisible();
    expect(screen.getByText(/自动修复次数未记录/)).toBeVisible();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
  it("shows all five categories with independent counts", () => {
    const descriptions = ["引用待确认", "业务条件待确认", "标签内容错误", "接口超时", "其他说明"];
    const categories = ["model_structure", "business_constraint", "render_mismatch", "check_execution", "other"] as const;
    render(<DiagramReviewDetails review={{ ...review, issues: descriptions, findings: categories.map((category, index) => ({
      id: String(index), modelId: "model", layer: "image", code: "custom", category, observation: descriptions[index], evidence: [], verification: "unverified", repairable: false,
    })), repairHistory: [] }} />);
    expect(screen.getAllByRole("heading").map((node) => node.textContent)).toEqual(["模型结构问题（1）", "业务内容疑问（2）", "绘制一致性问题（1）", "检查执行问题（1）"]);
  });
  it("does not invent zero repair attempts for partial historical counters", () => {
    render(<DiagramReviewDetails review={{ ...review, repairAttempts: undefined }} />);
    expect(screen.getByText(/纠错尝试次数未记录/)).toBeVisible();
    expect(screen.queryByText(/纠错尝试 0 次/)).not.toBeInTheDocument();
  });
});
