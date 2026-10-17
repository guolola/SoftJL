// Verifies compact status semantics and keyboard interactions inside fixed-size model cards.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Network } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../app/providers/i18n-provider";
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
    expect(screen.getByRole("button", { name: "选择需求模型" })).toHaveClass("h-[212px]", "sm:h-[236px]");
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

  it("keeps details scrollable and preserves failure color on a disabled card", async () => {
    const user = userEvent.setup();
    const onSelectedChange = renderCard({ disabled: true, status: "failed", content: <p>详细失败原因</p> });
    expect(screen.getByText("详细失败原因").parentElement).toHaveClass("min-h-0", "overflow-y-auto");
    expect(screen.getByRole("img").querySelector("svg")).toHaveClass("text-destructive");
    await user.click(screen.getByRole("button", { name: "选择需求模型" }));
    expect(onSelectedChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");
  });
});
