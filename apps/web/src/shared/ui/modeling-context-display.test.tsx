// Verifies shared context formatting, provider breakdown, reset isolation, and quick-modeling overlay integration.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../i18n/i18n";
import { ModelingContextDisplay } from "./modeling-context-display";
import { formatTokenCount } from "../lib/token-count";
import { getContextSegments, getUsagePercent } from "../lib/modeling-context-usage";
import { ContextDisplayText as QuickContextDisplay } from "../../features/standard-project/components/home-demo/source/elements/context-display";
import { HomeDemoPortals } from "../../features/standard-project/components/home-demo/integration/portals";
import { formatTokenCount as upstreamFormatTokenCount } from "../../features/standard-project/components/home-demo/source/utils/tokens";

afterEach(async () => { await act(async () => { await i18n.changeLanguage("zh-CN"); }); });

describe("ModelingContextDisplay", () => {
  it("shows compact used/capacity counters and the provider usage details on hover", async () => {
    const user = userEvent.setup();
    render(<ModelingContextDisplay modelContextWindow={1_000_000} usage={{ totalTokens: 5700, inputTokens: 4000, cachedInputTokens: 500, outputTokens: 1700, reasoningTokens: 300 }} />);
    const trigger = screen.getByRole("button", { name: "Token 用量" });
    expect(trigger).toHaveTextContent("5.7k / 1M");
    await user.hover(trigger);
    const details = await screen.findByRole("tooltip");
    expect(details).toHaveAttribute("data-slot", "context-display-popover");
    expect(within(details).getByText("1% 已使用")).toBeVisible();
    expect(within(details).getByText("输入").parentElement).toHaveTextContent("4k");
    expect(within(details).getByText("缓存输入").parentElement).toHaveTextContent("500");
    expect(within(details).getByText("输出").parentElement).toHaveTextContent("1.7k");
    expect(within(details).getByText("推理").parentElement).toHaveTextContent("300");
  });

  it("marks missing usage and unknown model capacity without inventing a zero", async () => {
    const user = userEvent.setup();
    render(<ModelingContextDisplay modelContextWindow={0} />);
    const trigger = screen.getByRole("button", { name: "Token 用量" });
    expect(trigger).toHaveTextContent("未报告 / 未知");
    await user.tab();
    expect(trigger).toHaveFocus();
    const details = await screen.findByRole("tooltip");
    expect(details).not.toHaveTextContent("0%");
    expect(details).not.toHaveTextContent("/ 0");
    expect(within(details).queryByText("输入")).not.toBeInTheDocument();
  });

  it("retains a transiently missing report only until its project/thread/model key changes", () => {
    const { rerender } = render(<ModelingContextDisplay modelContextWindow={1_000_000} resetKey="project-a:model-a" usage={{ totalTokens: 5700 }} />);
    expect(screen.getByRole("button")).toHaveTextContent("5.7k / 1M");
    rerender(<ModelingContextDisplay modelContextWindow={1_000_000} resetKey="project-a:model-a" />);
    expect(screen.getByRole("button")).toHaveTextContent("5.7k / 1M");
    rerender(<ModelingContextDisplay modelContextWindow={1_000_000} resetKey="project-b:model-a" />);
    expect(screen.getByRole("button")).toHaveTextContent("未报告 / 1M");
    rerender(<ModelingContextDisplay modelContextWindow={1_000_000} resetKey="project-b:model-a" usage={{ totalTokens: 0 }} />);
    expect(screen.getByRole("button")).toHaveTextContent("0 / 1M");
  });

  it("clears the previous run total when the latest engineering call reports no usage", () => {
    const { rerender } = render(<ModelingContextDisplay modelContextWindow={1_000_000} preserveLastUsage={false} usage={{ totalTokens: 5700 }} />);
    expect(screen.getByRole("button")).toHaveTextContent("5.7k / 1M");
    rerender(<ModelingContextDisplay modelContextWindow={1_000_000} preserveLastUsage={false} />);
    expect(screen.getByRole("button")).toHaveTextContent("未报告 / 1M");
  });

  it("keeps the same meter and themed detail portal in quick modeling", async () => {
    const user = userEvent.setup();
    render(<HomeDemoPortals><QuickContextDisplay modelContextWindow={1_000_000} usage={{ totalTokens: 5700, inputTokens: 5700 }} /></HomeDemoPortals>);
    const trigger = screen.getByRole("button", { name: "Token 用量" });
    expect(trigger).toHaveAttribute("data-slot", "context-display-trigger");
    expect(trigger).toHaveTextContent("5.7k / 1M");
    await user.hover(trigger);
    const details = await screen.findByRole("tooltip");
    expect(details.closest(".homepage-theme")).not.toBeNull();
    expect(within(details).getByText("输入")).toBeVisible();
  });

  it("uses localized English labels for missing capacity and usage", async () => {
    await act(async () => { await i18n.changeLanguage("en"); });
    render(<ModelingContextDisplay modelContextWindow={-1} />);
    expect(screen.getByRole("button", { name: "Context usage" })).toHaveTextContent("Not reported / Unknown");
  });
});

describe("context usage helpers", () => {
  it("keeps upstream imports on the shared formatter and rounds unit boundaries", () => {
    expect(upstreamFormatTokenCount).toBe(formatTokenCount);
    expect(formatTokenCount(999_950)).toBe("1M");
    expect(formatTokenCount(5700)).toBe("5.7k");
    expect(formatTokenCount(1_000_000)).toBe("1M");
  });

  it("does not sum overlapping token categories or divide by an unknown capacity", () => {
    expect(getContextSegments({ inputTokens: 4000, cachedInputTokens: 500, outputTokens: 1700, reasoningTokens: 300 })).toEqual([
      { label: "Input", tokens: 4000 }, { label: "Cached input", tokens: 500 }, { label: "Output", tokens: 1700 }, { label: "Reasoning", tokens: 300 },
    ]);
    expect(getUsagePercent(5700, 0)).toBe(0);
    expect(getUsagePercent(2_000_000, 1_000_000)).toBe(100);
  });
});
