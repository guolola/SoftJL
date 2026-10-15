// Verifies the shadcn.io/ai-style reasoning and agent turn primitives.
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CpuIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AgentTurn } from "./agent-turn";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./reasoning";

describe("Reasoning", () => {
  it("collapses and expands streaming stage output", async () => {
    render(<Reasoning><ReasoningTrigger>思考过程</ReasoningTrigger><ReasoningContent>正在补齐依赖</ReasoningContent></Reasoning>);

    const trigger = screen.getByRole("button", { name: /思考过程/u });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(screen.getByText("正在补齐依赖")).toBeVisible();
  });

  it("opens by default for running stages", () => {
    render(
      <Reasoning isStreaming><ReasoningTrigger /><ReasoningContent>流式输出</ReasoningContent></Reasoning>,
    );

    expect(screen.getByText("流式输出")).toBeVisible();
    expect(screen.getByText("正在思考…")).toBeInTheDocument();
  });

  it("closes after streaming ends while preserving a manual reopen", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<Reasoning isStreaming><ReasoningTrigger /><ReasoningContent>真实推理</ReasoningContent></Reasoning>);
      rerender(<Reasoning isStreaming={false}><ReasoningTrigger /><ReasoningContent>真实推理</ReasoningContent></Reasoning>);
      act(() => vi.advanceTimersByTime(1000));
      const trigger = screen.getByRole("button", { name: /思考过程|思考了/u });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("真实推理")).toBeVisible();
    } finally { vi.useRealTimers(); }
  });
});

describe("AgentTurn", () => {
  it("renders stage title, badge and loader while running", () => {
    render(
      <AgentTurn icon={CpuIcon} title="用例实现设计" badge="运行中" running>
        <span>阶段输出</span>
      </AgentTurn>,
    );

    expect(screen.getByText("用例实现设计")).toBeInTheDocument();
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.getByText("阶段输出")).toBeInTheDocument();
  });
});
