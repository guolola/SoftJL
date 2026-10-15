// Verifies compact visual summaries and actionable freshness or generation failures.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelNotices, type ModelNotice } from "./model-notices";

const notices: ModelNotice[] = [
  { id: "stale", kind: "freshness", tone: "warning", title: "模型已过期", detail: "上游需求已变化" },
  { id: "visual", kind: "visual", tone: "info", title: "视觉检查", detail: "图面有问题", issues: ["标签不可读", "连线交叉"], checks: 3, repairs: 2 },
];

describe("model notices", () => {
  it("labels historical success as awaiting current-rule verification without overwriting it", () => {
    const review = { status: "passed" as const, issues: [], reason: "历史检查通过", attempts: 1, checkedAt: "old" };
    render(<ModelNotices notices={[{ id: "visual", kind: "visual", tone: "success", title: "检查", detail: review.reason, review }]} />);
    fireEvent.click(screen.getByRole("button", { name: "提示（1）" }));
    expect(screen.getByText("历史检查通过")).toBeVisible();
    expect(screen.getByText(/该记录来自旧版检查规则/)).toBeVisible();
    expect(screen.getByText(/历史结论尚未用当前规则复核/)).toBeVisible();
    expect(review.status).toBe("passed");
  });
  it("preserves positive and neutral fallback stages in the shared status flow", () => {
    render(<ModelNotices notices={[{ id: "context", kind: "info", tone: "info", title: "状态", detail: "模型已加载" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "提示（1）" }));
    const flow = screen.getByRole("list", { name: "模型状态流程" });
    const stages = within(flow).getAllByRole("listitem");
    expect(stages.map(stage => within(stage).getAllByRole("heading")[0].textContent)).toEqual(["模型未标记过期", "模型检查", "下一步"]);
    expect(stages.map(stage => stage.dataset.flowTone)).toEqual(["success", "info", "success"]);
    expect(stages[1].querySelector("svg")).toHaveClass("lucide-info");
    expect(screen.queryByRole("button", { name: "确认当前图" })).not.toBeInTheDocument();
  });

  it("keeps visual summaries and freshness guidance in one dialog", () => {
    render(<ModelNotices notices={notices} />);
    expect(screen.getByRole("button", { name: "提示（2）" })).toBeVisible();
    expect(screen.queryByText("标签不可读")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提示（2）" }));
    const dialog = screen.getByRole("dialog", { name: "模型提示" });
    expect(within(dialog).getByRole("list", { name: "模型状态流程" })).toBeVisible();
    expect(within(dialog).getByText("下一步")).toBeVisible();
    expect(within(dialog).getByText("上游需求已变化")).toBeVisible();
    expect(within(dialog).getByText(/标签不可读/)).toBeVisible();
    expect(within(dialog).queryByText("连线交叉")).not.toBeInTheDocument();
    expect(within(dialog).getByText("图面有问题")).toBeVisible();
    for (const label of ["模型结构问题", "业务内容疑问", "绘制一致性问题", "检查执行问题"]) expect(within(dialog).getByRole("heading", { name: new RegExp(label) })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "确认当前图" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("已检查 3 次；已尝试自动修复 2 次")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "知道了" }));
    expect(screen.queryByRole("dialog", { name: "模型提示" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提示（2）" })).toBeVisible();
  });

  it("does not request acceptance when a saved visual check has unresolved findings", () => {
    render(<ModelNotices notices={[notices[1]]} />);
    fireEvent.click(screen.getByRole("button", { name: "提示（1）" }));
    expect(screen.getByText(/查看下方四类问题及处理依据/)).toBeVisible();
    expect(screen.queryByText(/确认当前图的视觉检查|确认视觉检查的权限/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认当前图" })).not.toBeInTheDocument();
  });

  it("keeps generation failures actionable alongside a visual summary", () => {
    render(<ModelNotices notices={[notices[1], { id: "error", kind: "error", tone: "destructive", title: "生成失败", detail: "图形渲染失败" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "提示（2）" }));
    expect(screen.getByText("图形渲染失败")).toBeVisible();
    expect(screen.getByText("查看下方错误并重试相关操作。")).toBeVisible();
  });
});
