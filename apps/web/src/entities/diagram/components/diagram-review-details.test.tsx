// Verifies categorized disclosures, actual repair history and confirmation without changing verdicts.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DiagramVisualReview } from "@uml-platform/contracts";
import { DiagramReviewDetails } from "./diagram-review-details";

const review: DiagramVisualReview = { status: "pending_review", reason: "结构检查待确认", issues: ["连线交叉", "外键标记错误"], attempts: 2, structureAttempts: 1, repairAttempts: 1, checkedAt: "now", stopReason: "候选越界",
  findings: [{ id: "fk", modelId: "table", layer: "model", code: "constraint-marker", category: "business_constraint", observation: "外键标记错误", elementId: "column", expected: true, actual: false, verification: "verified", repairable: true, evidence: [{ source: "constraint", reference: "FK1", detail: "明确外键" }] }],
  repairHistory: [{ round: 1, target: "model", issueIds: ["fk"], beforeFingerprint: "before", status: "rejected", changes: ["标题也被改动"], reason: "候选越界" }],
};
describe("categorized review details", () => {
  it("lets each category collapse independently and preserves its choice on updates", async () => {
    const currentReview: DiagramVisualReview = { ...review, issues: ["接口超时"], findings: [...review.findings, { id: "timeout", modelId: "model", layer: "model", category: "check_execution", code: "timeout", observation: "接口超时", verification: "inconclusive", repairable: false, evidence: [] }], repairHistory: [] };
    const { rerender } = render(<DiagramReviewDetails showEmptyGroups review={currentReview} />);
    const businessToggle = screen.getByRole("button", { name: "业务内容疑问（1）" });
    const executionToggle = screen.getByRole("button", { name: "检查执行问题（1）" });
    for (const toggle of screen.getAllByRole("button")) expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("外键标记错误")).not.toBeVisible();
    fireEvent.click(businessToggle);
    await waitFor(() => expect(screen.getByText("外键标记错误")).toBeVisible());
    expect(executionToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("接口超时")).not.toBeVisible();
    rerender(<DiagramReviewDetails showEmptyGroups review={{ ...currentReview }} />);
    expect(businessToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(businessToggle);
    await waitFor(() => expect(screen.getByText("外键标记错误")).not.toBeVisible());
  });
  it.each([false, true])("shows the conclusion without execution counters in model notices: confirmed=%s", (confirmed) => {
    render(<DiagramReviewDetails summaryOnly confirmed={confirmed} review={{ ...review, repairAttempts: 0 }} />);
    const summary = screen.getByRole("region", { name: "模型检查摘要" });
    expect(within(summary).getByText("结构检查待确认")).toBeVisible();
    if (confirmed) expect(within(summary).getByText(/内容已人工确认/)).toBeVisible();
    expect(within(summary).queryByText(/结构核对.*次|图片检查.*次|纠错尝试.*次/)).not.toBeInTheDocument();
    expect(within(summary).queryByRole("heading")).not.toBeInTheDocument();
    expect(within(summary).queryByText(/外键标记错误|停止原因|查看问题依据与处理详情|修复记录/)).not.toBeInTheDocument();
    expect(review.status).toBe("pending_review");
    expect(review.confirmedAt).toBeUndefined();
  });
  it("shows problems and treatment without the removed evidence disclosure or its content", () => {
    render(<DiagramReviewDetails review={review} />);
    fireEvent.click(screen.getByRole("button", { name: "业务内容疑问（1）" }));
    expect(screen.getAllByRole("heading").map((node) => node.textContent)).toEqual(["业务内容疑问（1）"]);
    expect(screen.queryByText("连线交叉")).not.toBeInTheDocument();
    expect(screen.queryByText("查看问题依据与处理详情")).not.toBeInTheDocument();
    expect(screen.queryByText(/预期值：|实际值：|对应模型：|对应元素／关系：|依据：FK1/)).not.toBeInTheDocument();
    expect(screen.getByText(/外键标记错误/)).toBeVisible();
    expect(screen.getAllByText(/已拒绝/)[0]).toBeVisible();
  });
  it("retains original findings after human confirmation and displays successful repairs accurately", () => {
    render(<DiagramReviewDetails confirmed review={{ ...review, repairHistory: [{ ...review.repairHistory![0], status: "accepted", reason: "已通过校验" }] }} />);
    fireEvent.click(screen.getByRole("button", { name: "业务内容疑问（1）" }));
    expect(screen.getByText(/内容已人工确认/)).toBeVisible();
    expect(within(screen.getByRole("region", { name: "业务内容疑问" })).getByText(/外键标记错误/)).toBeVisible();
    expect(screen.getAllByText(/已接受/)[0]).toBeVisible();
    expect(review.status).toBe("pending_review");
  });
  it("shows a skipped check reason without execution counters", () => {
    render(<DiagramReviewDetails review={{ findings: [], status: "skipped", reason: "模型不支持图片", stopReason: "模型不支持图片", checkOutcome: "skipped", issues: [], attempts: 1, checkedAt: "now" }} />);
    expect(screen.getByText("检查已跳过：模型不支持图片")).toBeVisible();
    expect(screen.queryByText(/自动修复次数未记录/)).not.toBeInTheDocument();
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
  it("omits execution metadata while retaining categorized findings and repair records", () => {
    render(<DiagramReviewDetails review={{ ...review, repairAttempts: 3, structureStatus: "passed", renderStatus: "passed", imageStatus: "passed" }} />);
    expect(screen.queryByText(/结构核对.*次|图片检查.*次|纠错尝试|纠错计数|停止原因：|结构校验：|绘制核对：|业务内容：/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "业务内容疑问（1）" }));
    expect(screen.getByText("外键标记错误")).toBeVisible();
    expect(screen.getByText("修复记录（1）")).toBeVisible();
    expect(review.stopReason).toBe("候选越界");
    expect(review.structureAttempts).toBe(1);
  });
});
