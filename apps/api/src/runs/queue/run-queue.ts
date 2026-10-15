// Provides the optional Redis/BullMQ boundary for offloading run pipelines to workers.
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { RunEvent, StartDocumentRunRequest } from "@uml-platform/contracts";
import type { RunRecord, RunRecordStore } from "../records/run-record-store.js";

export const DEFAULT_RUN_QUEUE_NAME = "generation-runs";
const DEFAULT_CONTROL_CHANNEL = "run-control";
const DEFAULT_EVENT_CHANNEL_PREFIX = "run-events";
const DEFAULT_PROJECT_EVENT_CHANNEL_PREFIX = "project-runs";

export interface QueuedRunJob {
  runId: string;
  record: {
    snapshot: RunRecord["snapshot"];
    events: RunRecord["events"];
    terminal: boolean;
    metadata?: RunRecord["metadata"];
  };
  documentInput?: StartDocumentRunRequest;
}

export interface RunEventSubscription {
  close(): Promise<void>;
}

export type SubscribeRunEvents = (
  runId: string,
  listener: (event: RunEvent) => void,
  onError?: (error: unknown) => void,
) => Promise<RunEventSubscription>;

export interface RunQueue {
  enabled: boolean;
  enqueueRun(input: { record: RunRecord; documentInput?: StartDocumentRunRequest }): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  attachEventPublisher(record: RunRecord): void;
  subscribeRunEvents?: SubscribeRunEvents;
  close(): Promise<void>;
}

export interface RunQueueConfig {
  redisUrl: string;
  queueName: string;
  controlChannel: string;
  eventChannelPrefix: string;
  projectEventChannelPrefix: string;
}

export function createRunQueueConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RunQueueConfig | null {
  const mode = env.UML_RUN_QUEUE_MODE?.trim().toLowerCase();
  const redisUrl = env.REDIS_URL?.trim();
  if (mode !== "bullmq" && env.UML_ENABLE_RUN_QUEUE !== "true") {
    return null;
  }
  if (!redisUrl) {
    throw new Error("REDIS_URL is required when UML_RUN_QUEUE_MODE=bullmq");
  }
  return {
    redisUrl,
    queueName: env.UML_RUN_QUEUE_NAME?.trim() || DEFAULT_RUN_QUEUE_NAME,
    controlChannel: env.UML_RUN_CONTROL_CHANNEL?.trim() || DEFAULT_CONTROL_CHANNEL,
    eventChannelPrefix:
      env.UML_RUN_EVENT_CHANNEL_PREFIX?.trim() || DEFAULT_EVENT_CHANNEL_PREFIX,
    projectEventChannelPrefix:
      env.UML_PROJECT_RUN_EVENT_CHANNEL_PREFIX?.trim() ||
      DEFAULT_PROJECT_EVENT_CHANNEL_PREFIX,
  };
}

function createRedisConnection(redisUrl: string) {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });
}

function createBullMqConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : 0,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

function runEventChannel(prefix: string, runId: string) {
  return `${prefix}:${runId}`;
}

function projectEventChannel(prefix: string, projectId: string) {
  return `${prefix}:${projectId}`;
}

function jobPayloadForRun(
  record: RunRecord,
  documentInput?: StartDocumentRunRequest,
): QueuedRunJob {
  return {
    runId: record.snapshot.runId,
    record: {
      snapshot: record.snapshot,
      events: record.events,
      terminal: record.terminal,
      metadata: record.metadata,
    },
    documentInput,
  };
}

export async function flushRunStoreIfAvailable(runs: RunRecordStore) {
  const flush = (runs as { flush?: () => Promise<void> }).flush;
  if (flush) {
    await flush.call(runs);
  }
}

export function reviveQueuedRunRecord(job: QueuedRunJob): RunRecord {
  return {
    snapshot: job.record.snapshot,
    events: job.record.events,
    listeners: new Set(),
    terminal: job.record.terminal,
    metadata: job.record.metadata,
  };
}

export function createBullMqRunQueue(config: RunQueueConfig): RunQueue {
  const queue = new Queue<QueuedRunJob, void, "run">(config.queueName, {
    connection: createBullMqConnectionOptions(config.redisUrl),
  });
  const publisher = createRedisConnection(config.redisUrl);

  return {
    enabled: true,
    async enqueueRun({ record, documentInput }) {
      await queue.add("run", jobPayloadForRun(record, documentInput), {
        jobId: record.snapshot.runId,
        attempts: 1,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      });
    },
    async cancelRun(runId) {
      const job = await queue.getJob(runId);
      if (job) {
        try {
          await job.remove();
        } catch {
          // Running jobs cannot be removed; worker-side cancellation handles them.
        }
      }
      await publisher.publish(
        config.controlChannel,
        JSON.stringify({ type: "cancel", runId }),
      );
    },
    attachEventPublisher(record) {
      const publish = (event: RunEvent) => {
        const payload = JSON.stringify(event);
        void publisher.publish(
          runEventChannel(config.eventChannelPrefix, record.snapshot.runId),
          payload,
        );
        const projectId = record.metadata?.projectId;
        if (projectId) {
          void publisher.publish(
            projectEventChannel(config.projectEventChannelPrefix, projectId),
            payload,
          );
        }
      };
      record.listeners.add(publish);
    },
    async subscribeRunEvents(runId, listener, onError) {
      const subscriber = createRedisConnection(config.redisUrl);
      const channel = runEventChannel(config.eventChannelPrefix, runId);
      let closed = false;
      let closePromise: Promise<void> | null = null;
      let initialSubscribeSettled = false;
      let rejectInitialSubscribe: ((error: unknown) => void) | null = null;
      const initialSubscribeError = new Promise<never>((_resolve, reject) => {
        rejectInitialSubscribe = reject;
      });

      const close = async () => {
        if (closePromise) {
          return closePromise;
        }
        closed = true;
        subscriber.removeAllListeners("message");
        subscriber.removeAllListeners("error");
        closePromise = Promise.allSettled([
          subscriber.unsubscribe(channel),
          subscriber.quit(),
        ]).then(() => undefined);
        return closePromise;
      };

      subscriber.on("message", (receivedChannel: string, message: string) => {
        if (receivedChannel !== channel || closed) return;
        try {
          listener(JSON.parse(message) as RunEvent);
        } catch (error) {
          console.warn("[run-queue] ignored invalid run event message", error);
        }
      });
      subscriber.on("error", (error: unknown) => {
        if (closed) return;
        onError?.(error);
        if (!initialSubscribeSettled) {
          rejectInitialSubscribe?.(error);
        }
        void close();
      });

      try {
        await Promise.race([subscriber.subscribe(channel), initialSubscribeError]);
        initialSubscribeSettled = true;
      } catch (error) {
        initialSubscribeSettled = true;
        await close();
        throw error;
      }

      return { close };
    },
    async close() {
      await Promise.allSettled([queue.close(), publisher.quit()]);
    },
  };
}

export function createBullMqGenerationWorker({
  config,
  concurrency,
  processRun,
  onCancelRun,
}: {
  config: RunQueueConfig;
  concurrency: number;
  processRun: (job: QueuedRunJob) => Promise<void>;
  onCancelRun?: (runId: string) => void;
}) {
  const subscriber = createRedisConnection(config.redisUrl);
  const worker = new Worker<QueuedRunJob, void, "run">(
    config.queueName,
    async (job: Job<QueuedRunJob>) => {
      await processRun(job.data);
    },
    {
      connection: createBullMqConnectionOptions(config.redisUrl),
      concurrency,
    },
  );

  subscriber.subscribe(config.controlChannel).catch((error: unknown) => {
    console.error("[generation-worker] failed to subscribe run control channel", error);
  });
  subscriber.on("message", (_channel: string, message: string) => {
    try {
      const payload = JSON.parse(message) as { type?: string; runId?: string };
      if (payload.type === "cancel" && payload.runId) {
        onCancelRun?.(payload.runId);
      }
    } catch (error) {
      console.warn("[generation-worker] ignored invalid control message", error);
    }
  });

  return {
    worker,
    async close() {
      await Promise.allSettled([
        worker.close(),
        subscriber.quit(),
      ]);
    },
  };
}
