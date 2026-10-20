// Verifies compact status semantics, expanding guidance, and keyboard interactions inside model cards.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Network } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { Button } from "../../../shared/ui/button";
import { TooltipProvider } from "../../../shared/ui/tooltip";
import { ModelBentoCard } from "./model-bento-card";

const base = {
  label: "需求模型", english: "Requirement Model", description: "完整模型描述",
  icon: Network, selected: false, ariaLabel: "选择需求模型", checkboxLabel: "需求模型",
};
function renderCard(props: Partial<React.ComponentProps<typeof ModelBentoCard>> = {}) {
  const onSelectedChange = vi.fn();
  render(<AppI18nProvider><TooltipProvider><ModelBentoCard {...base} status="missing" onSelectedChange={onSelectedChange} {...props} /></TooltipProvider></AppI18nProvider>);
  return onSelectedChange;
}

describe("ModelBentoCard", () => {
  it("selects an existing model with the card without exposing an open action", async () => {
    const user = userEvent.setup();
    const onSelectedChange = renderCard({ status: "completed" });
    await user.click(screen.getByRole("button", { name: "选择需求模型" }));
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("button", { name: /打开|查看/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    expect(onSelectedChange).toHaveBeenCalledTimes(2);
  });

  it("deselects generated models with the keyboard without navigating", async () => {
    const user = userEvent.setup();
    const onSelectedChange = renderCard({ status: "completed", selected: true });
    screen.getByRole("button", { name: "选择需求模型" }).focus();
    await user.keyboard(" ");
    expect(onSelectedChange).toHaveBeenCalledWith(false);
  });

  it("blocks card selection for read-only or running workspaces", async () => {
    const user = userEvent.setup();
    const onSelectedChange = renderCard({ status: "completed", disabled: true });
    await user.click(screen.getByRole("button", { name: "选择需求模型" }));
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("inspects blocked cards on hover and status focus without an extra workflow button", async () => {
    const user = userEvent.setup();
    const onInspect = vi.fn();
    const onSelectedChange = renderCard({ disabled: true, blockedReason: "缺少上游模型", onInspect });
    const card = screen.getByRole("button", { name: "选择需求模型" });
    await user.hover(card);
    expect(onInspect).toHaveBeenCalled();
    onInspect.mockClear();
    await user.tab();
    expect(onInspect).toHaveBeenCalled();
    expect(card.querySelector('[data-slot="inspect-dependencies"]')).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await user.click(card);
    await user.keyboard("{Enter} ");
    expect(onSelectedChange).not.toHaveBeenCalled();
  });
  it.each([
    ["completed", "已生成", "text-success"],
    ["failed", "失败", "text-destructive"],
    ["missing", "未生成", "text-muted-foreground"],
    ["running", "生成中", "animate-spin"],
    ["queued", "排队", "text-muted-foreground"],
    ["stale", "更新", "text-warning"],
    ["blocked", "暂时无法生成", "text-warning"],
  ] as const)("shows %s as a named compact icon", (status, text, color) => {
    renderCard({ status });
    const icon = screen.getByRole("img", { name: new RegExp(`需求模型：.*${text}`) });
    expect(icon.querySelector("svg")).toHaveClass(color);
    expect(screen.queryByText(new RegExp(`^${text}$`))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择需求模型" })).toHaveClass("min-h-[260px]", "sm:min-h-[284px]");
    expect(screen.getByRole("button", { name: "选择需求模型" })).toHaveAttribute("data-slot", "spotlight-card");
  });

  it("supports card selection while nested controls and tooltip focus do not toggle it", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onSelectedChange = renderCard({ content: <Button onClick={event => { event.stopPropagation(); onView(); }}>关联规则</Button> });
    const card = screen.getByRole("button", { name: "选择需求模型" });
    card.focus();
    await user.keyboard("{Enter}");
    expect(onSelectedChange).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "关联规则" }).focus();
    await user.keyboard("{Enter}");
    expect(onView).toHaveBeenCalledOnce();
    const status = screen.getByRole("img");
    status.focus();
    await user.keyboard(" ");
    expect(onSelectedChange).toHaveBeenCalledTimes(1);
  });

  it("shows a status explanation on hover", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.hover(screen.getByRole("img"));
    expect(await screen.findByText("需求模型：未生成")).toBeVisible();
  });

  it("keeps long blockers behind one status icon and reveals them on hover", async () => {
    const user = userEvent.setup();
    const blockedReason = "部署需求模型没有对应的需求规则，请先到需求规则表添加规则并关联对应模型。";
    const onSelectedChange = renderCard({ disabled: true, blockedReason });
    const icon = screen.getByRole("img", { name: blockedReason });
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.queryByText(blockedReason)).not.toBeInTheDocument();
    expect(icon).toHaveAttribute("data-generation-status", "blocked");
    await user.hover(icon);
    expect(await screen.findByText(blockedReason)).toBeVisible();
    await user.click(icon);
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("reveals blocked-card guidance with keyboard focus without selecting the card", async () => {
    const user = userEvent.setup();
    const blockedReason = "请先添加对应的需求规则。";
    const onSelectedChange = renderCard({ disabled: true, blockedReason });
    await user.tab();
    expect(screen.getByRole("img", { name: blockedReason })).toHaveFocus();
    expect(await screen.findByText(blockedReason)).toBeVisible();
    await user.keyboard("{Enter}");
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("allows details to expand without inner scrolling and preserves failure color on a disabled card", async () => {
    const user = userEvent.setup();
    const onSelectedChange = renderCard({ disabled: true, status: "failed", content: <p>详细失败原因</p> });
    const content = screen.getByText("详细失败原因").parentElement;
    expect(content).not.toHaveClass("overflow-y-auto", "overflow-y-scroll");
    expect(screen.getByRole("button", { name: "选择需求模型" })).not.toHaveClass("h-[212px]", "sm:h-[236px]");
    expect(screen.getByRole("img").querySelector("svg")).toHaveClass("text-destructive");
    await user.click(screen.getByRole("button", { name: "选择需求模型" }));
    expect(onSelectedChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");
  });
});
