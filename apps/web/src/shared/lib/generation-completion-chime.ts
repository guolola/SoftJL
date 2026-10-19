// Observes top-level generation lifecycles across modeling workflows and chimes once per task.
import { useEffect, useRef } from "react";
import { playCompletionChime } from "./completion-chime";

export type GenerationCompletionTask = {
  clientTaskId: string;
  runId?: string | null;
  status: "idle" | "queued" | "running" | "completed" | "failed" | "cancelled";
  silentCompletion?: boolean;
};

const MAX_ANNOUNCED_TASKS = 200;
// Module scope survives provider remounts, so replayed events for a finished task stay silent.
const announcedTaskKeys = new Set<string>();

function remember(key: string) {
  announcedTaskKeys.add(key);
  if (announcedTaskKeys.size > MAX_ANNOUNCED_TASKS) {
    announcedTaskKeys.delete(announcedTaskKeys.values().next().value!);
  }
}

/**
 * Chimes once when an observed task finishes successfully or with failures.
 * Restored history and cancellations stay silent. Successful upstream steps wait
 * for the final task; an upstream failure ends the chain and should still chime.
 */
export function useGenerationCompletionChime(
  tasks: GenerationCompletionTask[],
  play: () => unknown = playCompletionChime,
) {
  const observedStatuses = useRef(new Map<string, GenerationCompletionTask["status"]>());
  useEffect(() => {
    const previous = observedStatuses.current;
    const next = new Map<string, GenerationCompletionTask["status"]>();
    let finished = false;
    for (const task of tasks) {
      next.set(task.clientTaskId, task.status);
      const wasActive = previous.get(task.clientTaskId) === "queued" || previous.get(task.clientTaskId) === "running";
      const hasFinished = task.status === "completed" || task.status === "failed";
      if (!hasFinished || !wasActive || (task.silentCompletion && task.status === "completed")) continue;
      const keys = [task.clientTaskId, task.runId].filter((key): key is string => Boolean(key));
      if (keys.some((key) => announcedTaskKeys.has(key))) continue;
      keys.forEach(remember);
      finished = true;
    }
    observedStatuses.current = next;
    // Several tasks finishing in the same update still produce a single chime.
    if (finished) void play();
  }, [tasks, play]);
}

export function resetGenerationCompletionChimeForTests() {
  announcedTaskKeys.clear();
}
