// Guards long-running model generation tasks with idle and maximum runtime limits.
export type ModelTaskActivity = () => void;

export interface ModelTaskTimeoutConfig {
  idleTimeoutMs: number;
  blankOutputTimeoutMs?: number;
  maxRuntimeMs: number;
  label: string;
  isCancelled?: () => boolean;
  createCancelError?: () => Error;
}

function timeoutCheckIntervalMs(config: ModelTaskTimeoutConfig) {
  const shortestLimit = Math.min(config.idleTimeoutMs, config.maxRuntimeMs);
  return Math.max(5, Math.min(1000, Math.floor(shortestLimit / 2)));
}

export async function withModelTaskTimeout<T>(
  taskFactory: (
    markActivity: ModelTaskActivity,
    markBlankActivity: ModelTaskActivity,
    abortSignal: AbortSignal,
  ) => Promise<T>,
  config: ModelTaskTimeoutConfig,
) {
  const startedAt = Date.now();
  let lastActivityAt = startedAt;
  let lastBlankActivityAt = 0;
  let timeout: ReturnType<typeof setInterval> | undefined;
  const abortController = new AbortController();
  const blankOutputTimeoutMs = config.blankOutputTimeoutMs ?? config.idleTimeoutMs;

  const markActivity: ModelTaskActivity = () => {
    lastActivityAt = Date.now();
  };
  const markBlankActivity: ModelTaskActivity = () => {
    lastBlankActivityAt = Date.now();
  };
  const rejectTimedOut = (reject: (reason?: unknown) => void, error: Error) => {
    abortController.abort();
    reject(error);
  };
  const task = Promise.resolve().then(() =>
    taskFactory(markActivity, markBlankActivity, abortController.signal),
  );

  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeout = setInterval(() => {
          const now = Date.now();
          if (config.isCancelled?.()) {
            rejectTimedOut(
              reject,
              config.createCancelError?.() ??
                new Error(`${config.label} was cancelled`),
            );
            return;
          }
          if (now - startedAt >= config.maxRuntimeMs) {
            rejectTimedOut(
              reject,
              new Error(
                `${config.label} 超过最大运行时长 ${config.maxRuntimeMs}ms 未完成`,
              ),
            );
            return;
          }
          const receivedOnlyBlankOutput = lastBlankActivityAt > lastActivityAt;
          if (
            receivedOnlyBlankOutput &&
            now - lastActivityAt >= blankOutputTimeoutMs
          ) {
            rejectTimedOut(
              reject,
              new Error(
                `${config.label} 长时间仅收到空白输出，超过 ${blankOutputTimeoutMs}ms 未完成`,
              ),
            );
            return;
          }
          if (now - lastActivityAt >= config.idleTimeoutMs) {
            rejectTimedOut(
              reject,
              new Error(
                receivedOnlyBlankOutput
                  ? `${config.label} 长时间仅收到空白输出，超过 ${config.idleTimeoutMs}ms 未完成`
                  : `${config.label} 长时间无有效输出，超过 ${config.idleTimeoutMs}ms 未完成`,
              ),
            );
          }
        }, timeoutCheckIntervalMs(config));
      }),
    ]);
  } finally {
    if (timeout) clearInterval(timeout);
  }
}
