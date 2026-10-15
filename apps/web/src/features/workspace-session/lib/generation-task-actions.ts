// Owns generation task list selection, creation, and status update actions.
import { useCallback, useMemo, useState } from "react";
import type { DocumentKind } from "@uml-platform/contracts";
import type {
  GenerationSubtask,
  GenerationTask,
  GenerationTaskKind,
  GenerationTaskRunSummary,
} from "../model/session-state";
import {
  createClientTaskId,
  createGenerationTask,
  isTaskClearableCompleted,
  isTaskActive,
} from "./generation-tasks";

const MAX_VISIBLE_GENERATION_TASKS = 30;
type TerminalRunStatus = Extract<
  GenerationTask["status"],
  "completed" | "failed" | "cancelled"
>;
type ServerTerminalRunStatus = TerminalRunStatus | "interrupted";

function terminalStatusFromRun(
  status: string | null | undefined,
): ServerTerminalRunStatus | null {
  if (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
  ) {
    return status;
  }
  return null;
}

function taskMessageFromTerminalRun(
  status: ServerTerminalRunStatus,
  run: GenerationTaskRunSummary,
) {
  if (status === "completed") return "生成完成";
  if (status === "failed") return run.errorMessage ?? "生成失败";
  if (status === "cancelled") return run.errorMessage ?? "任务已取消";
  return run.errorMessage ?? "服务中断，可重试";
}

function settleSubtaskFromTerminalRun(
  subtask: GenerationSubtask,
  status: ServerTerminalRunStatus,
  message: string,
): GenerationSubtask {
  if (
    subtask.status !== "queued" &&
    subtask.status !== "running" &&
    subtask.status !== "repairing" &&
    subtask.status !== "rendering"
  ) {
    return subtask;
  }
  if (status === "completed") {
    return {
      ...subtask,
      status: "completed",
      message: subtask.message ?? "已完成",
    };
  }
  return {
    ...subtask,
    status: "failed",
    message,
    errorMessage: subtask.errorMessage ?? message,
  };
}

function settleTaskFromTerminalRun(
  task: GenerationTask,
  run: GenerationTaskRunSummary,
  status: ServerTerminalRunStatus,
): GenerationTask {
  const finishedAt = run.completedAt ?? run.updatedAt ?? new Date().toISOString();
  const taskStatus: TerminalRunStatus = status === "interrupted" ? "failed" : status;
  const message = taskMessageFromTerminalRun(status, run);
  const errorMessage =
    status === "failed" || status === "interrupted"
      ? message
      : status === "cancelled"
        ? null
        : task.errorMessage;

  return {
    ...task,
    status: taskStatus,
    progress: 100,
    message,
    messageCode:
      status === "completed"
        ? "RUN_COMPLETED"
        : status === "cancelled"
          ? "RUN_CANCELLED"
          : status === "interrupted"
            ? "RUN_INTERRUPTED"
            : "RUN_FAILED",
    errorMessage,
    phaseSummary: message,
    finishedAt,
    diagnostics: {
      ...task.diagnostics,
      finishedAt,
      activeStage: null,
      events: [
        ...task.diagnostics.events,
        {
          id: `${finishedAt}:server-${status}`,
          at: finishedAt,
          label:
            status === "completed"
              ? "任务完成"
              : status === "failed"
                ? "任务失败"
                : status === "cancelled"
                  ? "任务已取消"
                  : "服务中断",
          detail: status === "completed" || status === "cancelled" ? null : message,
        },
      ].slice(-80),
    },
    subtasks: task.subtasks.map((subtask) =>
      settleSubtaskFromTerminalRun(subtask, status, message),
    ),
  };
}

function retainGenerationTasksWithinCapacity(tasks: GenerationTask[]) {
  const activeCount = tasks.filter(isTaskActive).length;
  const terminalCapacity = Math.max(
    MAX_VISIBLE_GENERATION_TASKS - activeCount,
    0,
  );
  let terminalCount = 0;
  return tasks.filter((task) => {
    if (isTaskActive(task)) return true;
    if (terminalCount >= terminalCapacity) return false;
    terminalCount += 1;
    return true;
  });
}

export function useGenerationTaskActions() {
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [activeServerRunIds, setActiveServerRunIds] = useState<string[]>([]);
  const [serverRuns, setServerRuns] = useState<GenerationTaskRunSummary[]>([]);
  const [selectedGenerationTaskId, setSelectedGenerationTaskId] = useState<
    string | null
  >(null);

  const selectGenerationTask = useCallback((id: string) => {
    setSelectedGenerationTaskId(id);
  }, []);

  const clearCompletedGenerationTasks = useCallback(() => {
    setGenerationTasks((current) => {
      const retained = current.filter(
        (task) => !isTaskClearableCompleted(task),
      );
      setSelectedGenerationTaskId((selectedId) =>
        selectedId && retained.some((task) => task.clientTaskId === selectedId)
          ? selectedId
          : (retained[0]?.clientTaskId ?? null),
      );
      return retained;
    });
  }, []);

  const enqueueGenerationTask = useCallback(
    (input: {
      kind: GenerationTaskKind;
      title: string;
      providerModel: string | null;
      documentKind?: DocumentKind;
      message: string;
      startedAtMs: number;
      subtasks?: GenerationTask["subtasks"];
    }) => {
      const clientTaskId = createClientTaskId(input.kind);
      const startedAt = new Date(input.startedAtMs).toISOString();
      const task = createGenerationTask({
        clientTaskId,
        kind: input.kind,
        title: input.title,
        providerModel: input.providerModel,
        documentKind: input.documentKind,
        message: input.message,
        subtasks: input.subtasks,
        startedAt,
      });
      setGenerationTasks((current) =>
        retainGenerationTasksWithinCapacity([task, ...current]),
      );
      setSelectedGenerationTaskId(clientTaskId);
      return clientTaskId;
    },
    [],
  );

  const updateGenerationTask = useCallback(
    (
      clientTaskId: string,
      updater: (task: GenerationTask) => GenerationTask,
    ) => {
      setGenerationTasks((current) =>
        current.map((task) =>
          task.clientTaskId === clientTaskId ? updater(task) : task,
        ),
      );
    },
    [],
  );

  const recoverGenerationTask = useCallback((run: GenerationTaskRunSummary) => {
    const clientTaskId = `recovered:${run.runId}`;
    const kind = run.runKind as GenerationTaskKind;
    const task = createGenerationTask({
      clientTaskId,
      kind,
      title: kind === "design" ? "设计模型生成" : "需求模型生成",
      providerModel: run.model ?? null,
      startedAt: run.startedAt ?? run.createdAt ?? new Date().toISOString(),
      message: "正在恢复任务进度",
    });
    setGenerationTasks((current) => current.some((item) => item.runId === run.runId)
      ? current
      : retainGenerationTasksWithinCapacity([{ ...task, runId: run.runId!, status: "running" }, ...current]));
    return clientTaskId;
  }, []);

  const reconcileGenerationTasksWithProjectRuns = useCallback(
    (runs: GenerationTaskRunSummary[]) => {
      const recoveryRuns = runs.filter((run) =>
        (run.status === "queued" || run.status === "running") &&
        (run.runKind === "requirements" || run.runKind === "design"))
        .map(({ runId, runKind, status, model, createdAt, startedAt, selectedDiagrams, requestedDiagrams }) =>
          ({ runId, runKind, status, model, createdAt, startedAt, selectedDiagrams, requestedDiagrams }));
      setServerRuns((current) => JSON.stringify(current) === JSON.stringify(recoveryRuns) ? current : recoveryRuns);
      setActiveServerRunIds(
        runs
          .filter(
            (run) =>
              Boolean(run.runId) &&
              (run.status === "queued" || run.status === "running"),
          )
          .map((run) => run.runId as string),
      );
      const terminalRunsById = new Map<string, {
      run: GenerationTaskRunSummary;
      status: ServerTerminalRunStatus;
    }>();
      for (const run of runs) {
        if (!run.runId) continue;
        const status = terminalStatusFromRun(run.status);
        if (status) {
          terminalRunsById.set(run.runId, { run, status });
        }
      }
      if (terminalRunsById.size === 0) return;

      setGenerationTasks((current) => {
        let changed = false;
        const next = current.map((task) => {
          if (!task.runId || !isTaskActive(task)) return task;
          const terminalRun = terminalRunsById.get(task.runId);
          if (!terminalRun) return task;
          // The server run ends before the browser's rule-repair review pass.
          if (terminalRun.status === "completed" && task.subtasks.some(
            (subtask) => subtask.id === "repair_rules",
          )) return task;
          changed = true;
          return settleTaskFromTerminalRun(
            task,
            terminalRun.run,
            terminalRun.status,
          );
        });
        return changed ? retainGenerationTasksWithinCapacity(next) : current;
      });
    },
    [],
  );

  const visibleGenerationTask = useMemo(() => {
    if (selectedGenerationTaskId) {
      const selected = generationTasks.find(
        (task) => task.clientTaskId === selectedGenerationTaskId,
      );
      if (selected) return selected;
    }
    return generationTasks.find(isTaskActive) ?? generationTasks[0] ?? null;
  }, [generationTasks, selectedGenerationTaskId]);

  const generating = generationTasks.some(
    (task) => task.kind !== "document" && isTaskActive(task),
  ) || activeServerRunIds.length > 0;

  return {
    clearCompletedGenerationTasks,
    enqueueGenerationTask,
    generating,
    generationTasks,
    recoverGenerationTask,
    serverRuns,
    reconcileGenerationTasksWithProjectRuns,
    selectGenerationTask,
    selectedGenerationTaskId,
    updateGenerationTask,
    visibleGenerationTask,
  };
}
