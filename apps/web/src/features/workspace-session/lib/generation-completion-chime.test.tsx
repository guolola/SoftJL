// Verifies the completion chime plays exactly once per finished top-level generation task.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationTask } from "../model/session-state";
import { resetGenerationCompletionChimeForTests, useGenerationCompletionChime } from "../../../shared/lib/generation-completion-chime";
import { createGenerationTask } from "./generation-tasks";

function task(id: string, status: GenerationTask["status"], overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    ...createGenerationTask({
      clientTaskId: id,
      kind: "design",
      title: "设计模型生成",
      providerModel: null,
      startedAt: "2026-10-18T00:00:00.000Z",
      message: "任务已进入队列",
    }),
    status,
    ...overrides,
  };
}

function renderChime(initialTasks: GenerationTask[]) {
  const play = vi.fn();
  const hook = renderHook(({ tasks }) => useGenerationCompletionChime(tasks, play), {
    initialProps: { tasks: initialTasks },
  });
  return { play, ...hook };
}

describe("useGenerationCompletionChime", () => {
  beforeEach(() => {
    resetGenerationCompletionChimeForTests();
  });

  it("chimes once when the whole task completes, ignoring repeated events and rerenders", () => {
    const { play, rerender } = renderChime([task("local-1", "queued")]);
    rerender({ tasks: [task("local-1", "running", { runId: "run-1" })] });
    // Individual model completions only change subtasks while the task is still running.
    rerender({ tasks: [task("local-1", "running", { runId: "run-1", subtasks: [{ id: "generate_design_models:class", label: "设计类图", status: "completed", message: "已完成", errorMessage: null }] })] });
    expect(play).not.toHaveBeenCalled();

    // Completion with warnings (pending review) is still a completion.
    const completed = task("local-1", "completed", { runId: "run-1", subtasks: [{ id: "verify_diagram_visual:class", label: "设计类图", status: "pending_review", message: null, errorMessage: null }] });
    rerender({ tasks: [completed] });
    rerender({ tasks: [{ ...completed, message: "生成完成" }] });
    rerender({ tasks: [completed] });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("never chimes for restored task history", () => {
    const history = [task("recovered:run-old", "completed", { runId: "run-old" }), task("recovered:run-failed", "failed", { runId: "run-failed" })];
    const { play, rerender } = renderChime(history);
    rerender({ tasks: history.map(task => ({ ...task, message: "任务已结束" })) });
    expect(play).not.toHaveBeenCalled();
  });

  it.each([
    { errorMessage: "生成失败" },
    { messageCode: "RUN_PARTIAL_FAILURE" },
    { errorMessage: "上游生成失败", silentCompletion: true },
  ])("chimes once when a task ends with failures: %j", overrides => {
    const active = task("failed-task", "running", { runId: "failed-run", ...overrides });
    const { play, rerender } = renderChime([active]);
    const failed = { ...active, status: "failed" as const };
    rerender({ tasks: [failed] });
    rerender({ tasks: [{ ...failed, message: "任务已结束" }] });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("keeps cancelled tasks silent", () => {
    const { play, rerender } = renderChime([task("cancelled-task", "running")]);
    rerender({ tasks: [task("cancelled-task", "cancelled")] });
    expect(play).not.toHaveBeenCalled();
  });

  it("stays silent for chained upstream steps and chimes when the final task completes", () => {
    const upstream = task("rules", "running", { silentCompletion: true });
    const { play, rerender } = renderChime([upstream]);
    rerender({ tasks: [{ ...upstream, status: "completed" }] });
    expect(play).not.toHaveBeenCalled();
    rerender({ tasks: [task("design", "queued"), { ...upstream, status: "completed" }] });
    rerender({ tasks: [task("design", "completed"), { ...upstream, status: "completed" }] });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("plays a single chime when several tasks finish in the same update", () => {
    const { play, rerender } = renderChime([task("a", "running"), task("b", "running")]);
    rerender({ tasks: [task("a", "completed"), task("b", "failed")] });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not replay a run after the provider remounts and the run is recovered again", () => {
    const first = renderChime([task("local-1", "running", { runId: "run-1" })]);
    first.rerender({ tasks: [task("local-1", "completed", { runId: "run-1" })] });
    expect(first.play).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderChime([task("recovered:run-1", "running", { runId: "run-1" })]);
    second.rerender({ tasks: [task("recovered:run-1", "completed", { runId: "run-1" })] });
    expect(second.play).not.toHaveBeenCalled();
  });
});
