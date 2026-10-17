// Verifies directly visible check records and generation failures without a duplicate top summary.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CURRENT_DIAGRAM_REVIEW_VERSION } from "@uml-platform/contracts";
import { ModelNotices, type ModelNotice } from "./model-notices";

const notices: ModelNotice[] = [
  { id: "stale", kind: "freshness", tone: "warning", title: "模型已过期", detail: "上游需求已变化" },
  { id: "visual", kind: "visual", tone: "info", title: "视觉检查", detail: "图面有问题", issues: ["标签不可读", "连线交叉"], checks: 3, repairs: 2 },
];

describe("model notices", () => {
  it.each([undefined, CURRENT_DIAGRAM_REVIEW_VERSION])("hides successful checks without problems for review version %s", (reviewVersion) => {
    const review = { status: "passed" as const, issues: [], reason: "本次自动检查未发现问题", attempts: 1, checkedAt: "checked", reviewVersion };
    render(<ModelNotices notices={[{ id: "visual", kind: "visual", tone: "success", title: "检查", detail: review.reason, review }]} />);
    expect(screen.queryByRole("button", { name: /提示/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(review.status).toBe("passed");
  });

  it("hides neutral messages and positive freshness records", () => {
    render(<ModelNotices notices={[
      { id: "context", kind: "info", tone: "info", title: "状态", detail: "模型已加载" },
      { id: "fresh", kind: "freshness", tone: "success", title: "模型未标记过期", detail: "上游内容未变化" },
    ]} />);
    expect(screen.queryByRole("button", { name: /提示/ })).not.toBeInTheDocument();
  });

  it("counts only actual notices and removes the open dialog when the problem is resolved", () => {
    const success: ModelNotice = { id: "visual", kind: "visual", tone: "success", title: "检查", detail: "检查通过",
      review: { status: "passed", issues: [], reason: "检查通过", attempts: 1, checkedAt: "now", reviewVersion: CURRENT_DIAGRAM_REVIEW_VERSION } };
    const { rerender } = render(<ModelNotices notices={[notices[0], success]} />);
    fireEvent.click(screen.getByRole("button", { name: "提示（1）" }));
    expect(screen.getByText("上游需求已变化")).toBeVisible();
    rerender(<ModelNotices notices={[success]} />);
    expect(screen.queryByRole("button", { name: /提示/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<ModelNotices notices={[notices[0], success]} />);
    expect(screen.getByRole("button", { name: "提示（1）" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not count excluded findings that produce empty problem groups", () => {
    render(<ModelNotices notices={[{ id: "visual", kind: "visual", tone: "warning", title: "检查", detail: "历史记录", issues: ["连线交叉"] }]} />);
    expect(screen.queryByRole("button", { name: /提示/ })).not.toBeInTheDocument();
  });

  it.each(["failed", "not_completed"] as const)("retains %s checks even without a detailed finding", (status) => {
    render(<ModelNotices notices={[{ id: "visual", kind: "visual", tone: "warning", title: "检查", detail: "检查异常",
      review: { status, issues: [], reason: "检查异常", attempts: 1, checkedAt: "now", reviewVersion: CURRENT_DIAGRAM_REVIEW_VERSION } }]} />);
    expect(screen.getByRole("button", { name: "提示（1）" })).toBeVisible();
  });

  it("keeps visual summaries and freshness guidance in one dialog", () => {
    render(<ModelNotices notices={notices} />);
    expect(screen.getByRole("button", { name: "提示（2）" })).toBeVisible();
    expect(screen.queryByText("标签不可读")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提示（2）" }));
    const dialog = screen.getByRole("dialog", { name: "模型提示" });
    expect(within(dialog).queryByText("先看下一步和待处理问题；完整检查记录可按需展开。")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("region", { name: "下一步" })).not.toBeInTheDocument();
    expect(dialog.querySelectorAll('[data-slot="diagram-review-details"]')).toHaveLength(1);
    expect(within(dialog).queryByText("查看完整检查记录")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("list", { name: "模型状态流程" }).closest("details")).toBeNull();
    expect(within(dialog).getByRole("list", { name: "模型状态流程" })).toBeVisible();
    expect(within(dialog).queryByText("下一步")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("更新模型后再次检查图形。")).not.toBeInTheDocument();
    expect(within(dialog).getByText("上游需求已变化")).toBeVisible();
    expect(within(dialog).getByText(/标签不可读/)).not.toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "检查执行问题（1）" }));
    expect(within(dialog).getByText(/标签不可读/)).toBeVisible();
    expect(within(dialog).queryByText("连线交叉")).not.toBeInTheDocument();
    expect(within(dialog).getByText("图面有问题")).toBeVisible();
    for (const label of ["模型结构问题", "业务内容疑问", "绘制一致性问题", "检查执行问题"]) expect(within(dialog).getByRole("heading", { name: new RegExp(label) })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "确认当前图" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/已检查.*次|已尝试自动修复.*次/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "知道了" }));
    expect(screen.queryByRole("dialog", { name: "模型提示" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提示（2）" })).toBeVisible();
  });

  it("does not request acceptance when a saved visual check has unresolved findings", () => {
    render(<ModelNotices notices={[notices[1]]} />);
    fireEvent.click(screen.getByRole("button", { name: "提示（1）" }));
    expect(screen.queryByText(/查看下方问题；业务内容需核实/)).not.toBeInTheDocument();
    expect(screen.queryByText("下一步")).not.toBeInTheDocument();
    expect(screen.queryByText(/确认当前图的视觉检查|确认视觉检查的权限/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认当前图" })).not.toBeInTheDocument();
  });

  it("retains generation failures without adding a next-step stage", () => {
    render(<ModelNotices notices={[notices[1], { id: "error", kind: "error", tone: "destructive", title: "生成失败", detail: "图形渲染失败" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "提示（2）" }));
    expect(screen.getByText("图形渲染失败")).toBeVisible();
    expect(screen.queryByText("查看下方错误并重试相关操作。")).not.toBeInTheDocument();
    expect(screen.queryByText("下一步")).not.toBeInTheDocument();
  });
});
