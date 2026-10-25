// Coordinates single-server LLM concurrency so model-level parallelism cannot overload the API process.
import type { RunStage } from "@uml-platform/contracts";
import type { LlmTransport, StreamChatCompletionInput } from "./llm-transport.js";
import { ProviderHttpError } from "./llm-transport.js";
import {
  newTelemetryId,
  type RunTelemetryStore,
  type LlmRequestTelemetry,
} from "../../runs/records/run-telemetry-store.js";

export type LlmQueueReason = "global" | "provider" | "project" | "user" | "run";

export interface LlmScheduleContext {
  runId: string;
  projectId?: string | null;
  userId?: string | null;
  providerConfigId?: string | null;
  model: string;
  taskType: string;
  stage?: RunStage | null;
  diagramKind?: string | null;
  subtaskId?: string | null;
  subtaskLabel?: string | null;
  requestedModelCount?: number | null;
}

export interface LlmScheduleStatus {
  status: "queued" | "running" | "completed" | "cancelled";
  queuePosition?: number;
  queueAhead?: number;
  waitMs?: number;
  estimatedWaitMs?: number;
  queueReason?: LlmQueueReason;
}

export interface LlmSchedulerLimits {
  globalConcurrency: number;
  providerConcurrency: number;
  projectConcurrency: number;
  userConcurrency: number;
  runConcurrency: number;
}

export interface LlmScheduler {
  run<T>(
    context: LlmScheduleContext,
    task: () => Promise<T>,
    onStatus?: (status: LlmScheduleStatus) => void,
  ): Promise<T>;
  stream(
    context: LlmScheduleContext,
    task: () => AsyncIterable<string>,
    onStatus?: (status: LlmScheduleStatus) => void,
  ): AsyncIterable<string>;
  cancelRun(runId: string): void;
  snapshot(): {
    running: number;
    queued: number;
  };
}

type QueueItem<T> = {
  id: number;
  context: LlmScheduleContext;
  createdAt: number;
  task: () => Promise<T>;
  onStatus?: (status: LlmScheduleStatus) => void;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  cancelled: boolean;
};

const DEFAULT_LIMITS: LlmSchedulerLimits = {
  globalConcurrency: 4,
  providerConcurrency: 4,
  projectConcurrency: 2,
  userConcurrency: 2,
  runConcurrency: 2,
};

function positiveInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function key(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function increment(map: Map<string, number>, keyValue: string) {
  map.set(keyValue, (map.get(keyValue) ?? 0) + 1);
}

function decrement(map: Map<string, number>, keyValue: string) {
  const next = (map.get(keyValue) ?? 0) - 1;
  if (next > 0) {
    map.set(keyValue, next);
  } else {
    map.delete(keyValue);
  }
}

export function createLlmSchedulerLimitsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LlmSchedulerLimits {
  return {
    globalConcurrency: positiveInteger(
      Number(env.UML_LLM_GLOBAL_CONCURRENCY),
      DEFAULT_LIMITS.globalConcurrency,
    ),
    providerConcurrency: positiveInteger(
      Number(env.UML_LLM_PROVIDER_CONCURRENCY),
      DEFAULT_LIMITS.providerConcurrency,
    ),
    projectConcurrency: positiveInteger(
      Number(env.UML_LLM_PROJECT_CONCURRENCY),
      DEFAULT_LIMITS.projectConcurrency,
    ),
    userConcurrency: positiveInteger(
      Number(env.UML_LLM_USER_CONCURRENCY),
      DEFAULT_LIMITS.userConcurrency,
    ),
    runConcurrency: positiveInteger(
      Number(env.UML_LLM_RUN_CONCURRENCY),
      DEFAULT_LIMITS.runConcurrency,
    ),
  };
}

export function createInMemoryLlmScheduler(
  limits: Partial<LlmSchedulerLimits> = {},
): LlmScheduler {
  const resolvedLimits = {
    ...DEFAULT_LIMITS,
    ...limits,
  };
  let nextId = 0;
  let running = 0;
  const queue: Array<QueueItem<unknown>> = [];
  const runningByProvider = new Map<string, number>();
  const runningByProject = new Map<string, number>();
  const runningByUser = new Map<string, number>();
  const runningByRun = new Map<string, number>();
  const recentDurations: number[] = [];

  const providerKey = (context: LlmScheduleContext) =>
    key(context.providerConfigId, `${context.model}:default-provider`);
  const projectKey = (context: LlmScheduleContext) =>
    key(context.projectId, "anonymous-project");
  const userKey = (context: LlmScheduleContext) =>
    key(context.userId, "anonymous-user");

  function averageDurationMs() {
    if (recentDurations.length === 0) return undefined;
    return Math.round(
      recentDurations.reduce((sum, duration) => sum + duration, 0) /
        recentDurations.length,
    );
  }

  function blockedReason(context: LlmScheduleContext): LlmQueueReason | null {
    if (running >= resolvedLimits.globalConcurrency) return "global";
    if ((runningByProvider.get(providerKey(context)) ?? 0) >= resolvedLimits.providerConcurrency) {
      return "provider";
    }
    if ((runningByProject.get(projectKey(context)) ?? 0) >= resolvedLimits.projectConcurrency) {
      return "project";
    }
    if ((runningByUser.get(userKey(context)) ?? 0) >= resolvedLimits.userConcurrency) {
      return "user";
    }
    if ((runningByRun.get(context.runId) ?? 0) >= resolvedLimits.runConcurrency) {
      return "run";
    }
    return null;
  }

  function queueStatus(item: QueueItem<unknown>): LlmScheduleStatus {
    const queueIndex = queue.indexOf(item);
    const queueAhead = Math.max(queueIndex, 0);
    const average = averageDurationMs();
    return {
      status: "queued",
      queuePosition: queueAhead + 1,
      queueAhead,
      waitMs: Date.now() - item.createdAt,
      estimatedWaitMs: average ? average * (queueAhead + 1) : undefined,
      queueReason: blockedReason(item.context) ?? "global",
    };
  }

  function publishQueueStatuses() {
    for (const item of queue) {
      item.onStatus?.(queueStatus(item));
    }
  }

  function reserve(context: LlmScheduleContext) {
    running += 1;
    increment(runningByProvider, providerKey(context));
    increment(runningByProject, projectKey(context));
    increment(runningByUser, userKey(context));
    increment(runningByRun, context.runId);
  }

  function release(context: LlmScheduleContext, startedAt: number) {
    running -= 1;
    decrement(runningByProvider, providerKey(context));
    decrement(runningByProject, projectKey(context));
    decrement(runningByUser, userKey(context));
    decrement(runningByRun, context.runId);
    recentDurations.push(Date.now() - startedAt);
    if (recentDurations.length > 20) recentDurations.shift();
    drain();
  }

  function start(item: QueueItem<unknown>) {
    reserve(item.context);
    const startedAt = Date.now();
    item.onStatus?.({
      status: "running",
      waitMs: startedAt - item.createdAt,
    });
    void item
      .task()
      .then((value) => {
        item.onStatus?.({ status: "completed" });
        item.resolve(value);
      })
      .catch((error: unknown) => {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        release(item.context, startedAt);
      });
  }

  function drain() {
    for (let index = 0; index < queue.length;) {
      const item = queue[index]!;
      if (item.cancelled) {
        queue.splice(index, 1);
        item.onStatus?.({ status: "cancelled" });
        item.reject(new Error("LLM scheduler task cancelled"));
        continue;
      }
      if (blockedReason(item.context)) {
        index += 1;
        continue;
      }
      queue.splice(index, 1);
      start(item);
    }
    publishQueueStatuses();
  }

  function run<T>(
    context: LlmScheduleContext,
    task: () => Promise<T>,
    onStatus?: (status: LlmScheduleStatus) => void,
  ) {
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        id: nextId++,
        context,
        createdAt: Date.now(),
        task,
        onStatus,
        resolve,
        reject,
        cancelled: false,
      };
      queue.push(item as QueueItem<unknown>);
      onStatus?.(queueStatus(item as QueueItem<unknown>));
      drain();
    });
  }

  return {
    run,
    async *stream(context, task, onStatus) {
      const chunks: string[] = [];
      const waiters: Array<() => void> = [];
      const spaceWaiters: Array<() => void> = [];
      let done = false;
      let failure: Error | null = null;
      // Keep provider streaming coupled to downstream SSE/event persistence so one
      // run cannot finish buffering thousands of chunks and release the slot early.
      const maxBufferedChunks = 1;
      const wake = () => {
        while (waiters.length > 0) waiters.shift()?.();
      };
      const wakeSpace = () => {
        while (spaceWaiters.length > 0) spaceWaiters.shift()?.();
      };
      const waitForChunk = () =>
        new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      const waitForSpace = () =>
        new Promise<void>((resolve) => {
          spaceWaiters.push(resolve);
        });
      const pump = run(
        context,
        async () => {
          for await (const chunk of task()) {
            while (chunks.length >= maxBufferedChunks) {
              await waitForSpace();
            }
            chunks.push(chunk);
            wake();
          }
        },
        onStatus,
      )
        .catch((error: unknown) => {
          failure = error instanceof Error ? error : new Error(String(error));
        })
        .finally(() => {
          done = true;
          wake();
        });
      while (!done || chunks.length > 0) {
        const chunk = chunks.shift();
        if (chunk !== undefined) {
          wakeSpace();
          yield chunk;
          continue;
        }
        await waitForChunk();
      }
      await pump;
      if (failure) throw failure;
    },
    cancelRun(runId) {
      for (const item of queue) {
        if (item.context.runId === runId) item.cancelled = true;
      }
      drain();
    },
    snapshot() {
      return {
        running,
        queued: queue.filter((item) => !item.cancelled).length,
      };
    },
  };
}

export function createScheduledLlmTransport({
  transport,
  scheduler,
  context,
  deriveContext,
  onStatus,
  analyticsStore,
}: {
  transport: LlmTransport;
  scheduler: LlmScheduler;
  context: LlmScheduleContext;
  deriveContext?: (input: StreamChatCompletionInput) => Partial<LlmScheduleContext>;
  onStatus?: (status: LlmScheduleStatus, context: LlmScheduleContext) => void;
  analyticsStore?: Pick<RunTelemetryStore, "recordTelemetry">;
}): LlmTransport {
  return {
    async *streamChatCompletion(input: StreamChatCompletionInput): AsyncIterable<string> {
      const requestContext = {
        ...context,
        ...deriveContext?.(input),
      };
      const queuedAt = Date.now();
      let providerStartedAt: number | null = null;
      let firstReasoningAt: number | null = null;
      let firstVisibleAt: number | null = null;
      let lastVisibleAt: number | null = null;
      let queueMs: number | null = null;
      let usage: LlmRequestTelemetry["usage"] = null;
      let usageUnavailableReason: string | null = null;
      let formatFallbackCount = 0;
      let requestRetryCount = 0;
      let failure: unknown = null;
      let completedNormally = false;

      const stream = scheduler.stream(
        requestContext,
        async function* () {
          const providerStream = transport.streamChatCompletion({
            // Preserve native tool definitions, callbacks and output reservations
            // while adding scheduler-owned telemetry observers.
            ...input,
            onRequestRetry(event) {
              requestRetryCount += 1;
              input.onRequestRetry?.(event);
            },
            onResponseFormatFallback(event) {
              formatFallbackCount += 1;
              input.onResponseFormatFallback?.(event);
            },
            onToolStrictFallback() {
              formatFallbackCount += 1;
              input.onToolStrictFallback?.();
            },
            onToolChoiceFallback() {
              formatFallbackCount += 1;
              input.onToolChoiceFallback?.();
            },
            onTokenUsage(value) {
              usage = { ...value };
              input.onTokenUsage?.(value);
            },
            onReasoningSummary: input.onReasoningSummary,
            onReasoningChunk(chunk) {
              firstReasoningAt ??= Date.now();
              input.onReasoningChunk?.(chunk);
            },
            onUsageUnavailable(reason) {
              usageUnavailableReason ??= reason;
              input.onUsageUnavailable?.(reason);
            },
          });
          for await (const chunk of providerStream) {
            if (chunk.length > 0) {
              const observedAt = Date.now();
              firstVisibleAt ??= observedAt;
              lastVisibleAt = observedAt;
            }
            yield chunk;
          }
        },
        (status) => {
          if (status.status === "running") {
            providerStartedAt ??= Date.now();
            queueMs = status.waitMs ?? providerStartedAt - queuedAt;
          }
          onStatus?.(status, requestContext);
        },
      );

      try {
        for await (const chunk of stream) yield chunk;
        completedNormally = true;
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        if (analyticsStore) {
          const completedAt = Date.now();
          const providerError = failure instanceof ProviderHttpError ? failure : null;
          const message = failure instanceof Error ? failure.message.toLowerCase() : "";
          const cancelled = input.abortSignal?.aborted || message.includes("cancel");
          const errorCategory = completedNormally
            ? null
            : cancelled
              ? "cancelled"
              : providerError?.status === 429
                ? "rate_limit"
                : message.includes("timed out") || message.includes("timeout")
                  ? "timeout"
                  : providerError
                    ? "provider"
                    : "unknown";
          const telemetry: LlmRequestTelemetry = {
            id: newTelemetryId(),
            runId: requestContext.runId,
            projectId: requestContext.projectId ?? null,
            userId: requestContext.userId ?? null,
            providerConfigId: requestContext.providerConfigId ?? null,
            model: requestContext.model,
            taskType: requestContext.taskType,
            stage: requestContext.stage ?? null,
            diagramKind: requestContext.diagramKind ?? null,
            subtaskId: requestContext.subtaskId ?? null,
            requestedModelCount: requestContext.requestedModelCount ?? null,
            queuedAt: new Date(queuedAt).toISOString(),
            providerStartedAt: providerStartedAt === null ? null : new Date(providerStartedAt).toISOString(),
            firstReasoningAt: firstReasoningAt === null ? null : new Date(firstReasoningAt).toISOString(),
            firstVisibleAt: firstVisibleAt === null ? null : new Date(firstVisibleAt).toISOString(),
            lastVisibleAt: lastVisibleAt === null ? null : new Date(lastVisibleAt).toISOString(),
            completedAt: new Date(completedAt).toISOString(),
            queueMs,
            providerTtftMs: providerStartedAt !== null && firstVisibleAt !== null
              ? firstVisibleAt - providerStartedAt : null,
            ttftMs: firstVisibleAt === null ? null : firstVisibleAt - queuedAt,
            reasoningMs: firstReasoningAt !== null && firstVisibleAt !== null
              ? Math.max(0, firstVisibleAt - firstReasoningAt) : null,
            decodeMs: firstVisibleAt !== null && lastVisibleAt !== null
              ? Math.max(0, lastVisibleAt - firstVisibleAt) : null,
            totalMs: Math.max(0, completedAt - queuedAt),
            usage,
            outcome: completedNormally ? "success" : cancelled ? "cancelled" : "failed",
            statusCode: providerError?.status ?? null,
            errorCategory,
            retryCount: requestRetryCount + (usageUnavailableReason === "provider_rejected_stream_usage" ? 1 : 0),
            formatFallbackCount,
            usageUnavailableReason: usage ? null : usageUnavailableReason ?? "provider_did_not_return_usage",
          };
          await analyticsStore.recordTelemetry(telemetry).catch(() => undefined);
        }
      }
    },
  };
}
