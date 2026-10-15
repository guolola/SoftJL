// Verifies local generation task list actions preserve terminal evidence users still need to review.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useGenerationTaskActions } from "./generation-task-actions";

describe("workspace-session generation task actions", () => {
  it("does not settle a rules-only task while its client repair phase is active", () => {
    const { result } = renderHook(() => useGenerationTaskActions());
    let taskId = "";
    act(() => {
      taskId = result.current.enqueueGenerationTask({
        kind: "requirements", title: "需求规则生成", providerModel: "fake-model",
        message: "正在修复需求规则", startedAtMs: 1,
        subtasks: [
          { id: "extract_rules", label: "抽取需求规则", status: "completed", message: null, errorMessage: null },
          { id: "repair_rules", label: "修复需求规则", status: "repairing", message: null, errorMessage: null },
        ],
      });
      result.current.updateGenerationTask(taskId, (task) => ({ ...task, runId: "run-rules", status: "running" }));
    });
    act(() => result.current.reconcileGenerationTasksWithProjectRuns([
      { runId: "run-rules", status: "completed", completedAt: "2026-09-23T00:00:00.000Z" },
    ]));
    expect(result.current.generationTasks[0].status).toBe("running");
    expect(result.current.generationTasks[0].subtasks[1].status).toBe("repairing");
  });
  it("clears only ordinary completed tasks and keeps failure, cancellation, and review evidence", () => {
    const { result } = renderHook(() => useGenerationTaskActions());

    let completedId = "";
    let failedId = "";
    let cancelledId = "";
    let reviewId = "";
    let activeId = "";

    act(() => {
      completedId = result.current.enqueueGenerationTask({
        kind: "requirements",
        title: "普通成功任务",
        providerModel: "fake-model",
        message: "排队中",
        startedAtMs: 1,
      });
      failedId = result.current.enqueueGenerationTask({
        kind: "requirements",
        title: "失败任务",
        providerModel: "fake-model",
        message: "排队中",
        startedAtMs: 2,
      });
      cancelledId = result.current.enqueueGenerationTask({
        kind: "design",
        title: "已取消任务",
        providerModel: "fake-model",
        message: "排队中",
        startedAtMs: 3,
      });
      reviewId = result.current.enqueueGenerationTask({
        kind: "design",
        title: "待确认任务",
        providerModel: "fake-model",
        message: "排队中",
        startedAtMs: 4,
        subtasks: [
          {
            id: "class",
            label: "设计类图",
            status: "pending_review",
            message: "有 1 条低置信追踪关系需复核",
            errorMessage: null,
            pendingReviewCount: 1,
          },
        ],
      });
      activeId = result.current.enqueueGenerationTask({
        kind: "code",
        title: "运行中任务",
        providerModel: "fake-model",
        message: "排队中",
        startedAtMs: 5,
      });
    });

    act(() => {
      result.current.updateGenerationTask(completedId, (task) => ({
        ...task,
        status: "completed",
        message: "完成",
        finishedAt: "2026-06-21T00:00:00.000Z",
      }));
      result.current.updateGenerationTask(failedId, (task) => ({
        ...task,
        status: "failed",
        errorMessage: "模型输出为空",
        finishedAt: "2026-06-21T00:01:00.000Z",
      }));
      result.current.updateGenerationTask(cancelledId, (task) => ({
        ...task,
        status: "cancelled",
        message: "用户已取消",
        finishedAt: "2026-06-21T00:02:00.000Z",
      }));
      result.current.updateGenerationTask(reviewId, (task) => ({
        ...task,
        status: "completed",
        message: "完成但需复核",
        finishedAt: "2026-06-21T00:03:00.000Z",
      }));
      result.current.updateGenerationTask(activeId, (task) => ({
        ...task,
        status: "running",
        message: "正在生成代码",
      }));
      result.current.selectGenerationTask(completedId);
    });

    act(() => {
      result.current.clearCompletedGenerationTasks();
    });

    expect(result.current.generationTasks.map((task) => task.clientTaskId)).toEqual([
      activeId,
      reviewId,
      cancelledId,
      failedId,
    ]);
    expect(
      result.current.generationTasks.some(
        (task) => task.clientTaskId === completedId,
      ),
    ).toBe(false);
    expect(result.current.selectedGenerationTaskId).toBe(activeId);
  });

  it("keeps active tasks when new tasks exceed the visible task capacity", () => {
    const { result } = renderHook(() => useGenerationTaskActions());
    const taskIds: string[] = [];

    act(() => {
      for (let index = 0; index < 30; index += 1) {
        const taskId = result.current.enqueueGenerationTask({
          kind: "requirements",
          title: `历史任务 ${index + 1}`,
          providerModel: "fake-model",
          message: "排队中",
          startedAtMs: index + 1,
        });
        taskIds.push(taskId);
      }
    });

    const oldestActiveTaskId = taskIds[0];
    const newestTerminalTaskId = taskIds[29];
    act(() => {
      for (const taskId of taskIds.slice(1)) {
        result.current.updateGenerationTask(taskId, (task) => ({
          ...task,
          status: "completed",
          message: "完成",
          finishedAt: "2026-06-21T00:00:00.000Z",
        }));
      }
      result.current.updateGenerationTask(oldestActiveTaskId, (task) => ({
        ...task,
        status: "running",
        message: "仍在生成旧任务",
      }));
    });

    let newTaskId = "";
    act(() => {
      newTaskId = result.current.enqueueGenerationTask({
        kind: "design",
        title: "新任务",
        providerModel: "fake-model",
        message: "排队中",
        startedAtMs: 31,
      });
    });

    expect(result.current.generationTasks).toHaveLength(30);
    expect(result.current.generationTasks.map((task) => task.clientTaskId)).toContain(
      newTaskId,
    );
    expect(result.current.generationTasks.map((task) => task.clientTaskId)).toContain(
      oldestActiveTaskId,
    );
    expect(result.current.generationTasks.map((task) => task.clientTaskId)).not.toContain(
      taskIds[1],
    );

    act(() => {
      result.current.updateGenerationTask(oldestActiveTaskId, (task) => ({
        ...task,
        status: "completed",
        message: "旧任务生成完成",
        finishedAt: "2026-06-21T00:02:00.000Z",
      }));
    });

    expect(
      result.current.generationTasks.find(
        (task) => task.clientTaskId === oldestActiveTaskId,
      ),
    ).toEqual(
      expect.objectContaining({
        status: "completed",
        message: "旧任务生成完成",
      }),
    );
    expect(
      result.current.generationTasks.find(
        (task) => task.clientTaskId === newestTerminalTaskId,
      ),
    ).toEqual(expect.objectContaining({ title: "历史任务 30" }));
  });

  it("settles an active local task when the matching server run completed", () => {
    const { result } = renderHook(() => useGenerationTaskActions());
    let taskId = "";

    act(() => {
      taskId = result.current.enqueueGenerationTask({
        kind: "requirements",
        title: "需求规则生成",
        providerModel: "fake-model",
        message: "排队中",
        startedAtMs: 1,
        subtasks: [
          {
            id: "extract_rules",
            label: "抽取需求规则",
            status: "running",
            message: "正在抽取需求规则",
            errorMessage: null,
          },
        ],
      });
      result.current.updateGenerationTask(taskId, (task) => ({
        ...task,
        runId: "run-completed",
        status: "running",
        progress: 20,
        message: "正在抽取需求规则",
      }));
    });

    act(() => {
      result.current.reconcileGenerationTasksWithProjectRuns([
        {
          runId: "run-completed",
          status: "completed",
          completedAt: "2026-06-23T10:00:00.000Z",
        },
      ]);
    });

    expect(result.current.generating).toBe(false);
    expect(result.current.generationTasks[0]).toEqual(
      expect.objectContaining({
        runId: "run-completed",
        status: "completed",
        progress: 100,
        message: "生成完成",
        finishedAt: "2026-06-23T10:00:00.000Z",
      }),
    );
    expect(result.current.generationTasks[0]?.subtasks[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        errorMessage: null,
      }),
    );
  });

  it.each([
    ["failed", "模型输出为空", "failed"],
    ["cancelled", "任务已取消", "cancelled"],
    ["interrupted", "服务中断，可重试", "failed"],
  ])("settles an active local task when the matching server run is %s", (status, message, taskStatus) => {
    const { result } = renderHook(() => useGenerationTaskActions());
    let taskId = "";

    act(() => {
      taskId = result.current.enqueueGenerationTask({
        kind: "design",
        title: "模型生成",
        providerModel: "fake-model",
        message: "排队中",
        startedAtMs: 1,
        subtasks: [
          {
            id: "generate_models",
            label: "生成模型",
            status: "running",
            message: "正在生成模型",
            errorMessage: null,
          },
        ],
      });
      result.current.updateGenerationTask(taskId, (task) => ({
        ...task,
        runId: `run-${status}`,
        status: "running",
      }));
    });

    act(() => {
      result.current.reconcileGenerationTasksWithProjectRuns([
        {
          runId: `run-${status}`,
          status,
          errorMessage: status === "failed" ? message : null,
          completedAt: "2026-06-23T10:01:00.000Z",
        },
      ]);
    });

    expect(result.current.generating).toBe(false);
    expect(result.current.generationTasks[0]).toEqual(
      expect.objectContaining({
        status: taskStatus,
        progress: 100,
        message,
        finishedAt: "2026-06-23T10:01:00.000Z",
      }),
    );
    expect(result.current.generationTasks[0]?.subtasks[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        errorMessage: message,
      }),
    );
  });

  it("does not settle local tasks for unmatched or non-terminal server runs", () => {
    const { result } = renderHook(() => useGenerationTaskActions());
    let taskId = "";

    act(() => {
      taskId = result.current.enqueueGenerationTask({
        kind: "code",
        title: "代码生成",
        providerModel: "fake-model",
        message: "排队中",
        startedAtMs: 1,
      });
      result.current.updateGenerationTask(taskId, (task) => ({
        ...task,
        runId: "run-active",
        status: "running",
        progress: 35,
        message: "正在生成代码",
      }));
    });

    act(() => {
      result.current.reconcileGenerationTasksWithProjectRuns([
        {
          runId: "run-active",
          status: "running",
          updatedAt: "2026-06-23T10:02:00.000Z",
        },
        {
          runId: "another-run",
          status: "completed",
          completedAt: "2026-06-23T10:03:00.000Z",
        },
      ]);
    });

    expect(result.current.generating).toBe(true);
    expect(result.current.generationTasks[0]).toEqual(
      expect.objectContaining({
        runId: "run-active",
        status: "running",
        progress: 35,
        message: "正在生成代码",
      }),
    );
  });

  it("restores the generation lock from active server runs after refresh", () => {
    const { result } = renderHook(() => useGenerationTaskActions());

    act(() => {
      result.current.reconcileGenerationTasksWithProjectRuns([
        {
          runId: "server-code-run",
          status: "running",
          updatedAt: "2026-07-30T05:10:00.000Z",
        },
      ]);
    });
    expect(result.current.generating).toBe(true);

    act(() => {
      result.current.reconcileGenerationTasksWithProjectRuns([
        {
          runId: "server-code-run",
          status: "failed",
          completedAt: "2026-07-30T05:11:00.000Z",
        },
      ]);
    });
    expect(result.current.generating).toBe(false);
  });
});
