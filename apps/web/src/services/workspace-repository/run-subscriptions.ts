// Owns run snapshot reads and SSE fallback behavior for workspace repository runs.
import type {

  DesignRunSnapshot,
  DocumentRunSnapshot,
  FeasibilityRunSnapshot,
  RunEvent,
  RunEventInput,
  RunError,
  RunSnapshot,
  RunStage,
} from "@uml-platform/contracts";
import { assertCurrentRunSnapshot, ModelSemanticError, runEventSchema } from "@uml-platform/contracts";
import { ApiClientError, buildApiUrl, requestJson } from "../api-client";
import { projectHeaders, requireProjectScope } from "./project-scope";
import { snapshotErrorMessage } from "./run-payload";
import { localizeRunFailure } from "../../shared/i18n/api-errors";
import type { RunSubscriptionOptions } from "./types";

type RunSubscriptionInput<TSnapshot extends RestorableRunSnapshot> = RunSubscriptionOptions<TSnapshot> & {
  runId: string;
  projectId: string | null;
  onEvent: (event: RunEventInput) => void;
};

type RestorableRunSnapshot =
  | RunSnapshot
  | DesignRunSnapshot
  | DocumentRunSnapshot
  | FeasibilityRunSnapshot;

type SnapshotReader<TSnapshot extends RestorableRunSnapshot> = (
  runId: string,
  projectId: string | null,
) => Promise<TSnapshot>;

type SnapshotWaitInput<TSnapshot extends RestorableRunSnapshot> = RunSubscriptionInput<TSnapshot> & {
  readSnapshot: SnapshotReader<TSnapshot>;
  fallbackFailureMessage: string;
  fallbackCancelledStage: RunStage;
  fallbackProgressStage: RunStage;
  progressMessage: string;
  progressForSnapshot: (snapshot: TSnapshot) => number;
};

const PROJECT_STREAM_IDLE_TIMEOUT_MS = 60_000;
const INITIAL_SNAPSHOT_POLL_MS = 1_500;
const MAX_SNAPSHOT_POLL_MS = 10_000;
const MAX_PROJECT_STREAM_RECONNECTS = 3;

class StreamedRunFailedError extends Error {
  readonly runError: RunError;

  constructor(runError: RunError) {
    super(localizeRunFailure(runError, "生成任务失败，请稍后重试。"));
    this.name = "StreamedRunFailedError";
    this.runError = runError;
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Subscription aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Subscription aborted", "AbortError");
}

function isRetryableConnectionError(error: unknown) {
  return !(error instanceof StreamedRunFailedError) &&
    !isNonRetryableSnapshotReadError(error) &&
    !(error instanceof Error && error.name === "AbortError");
}

function isNonRetryableSnapshotReadError(error: unknown) {
  return (
    error instanceof ModelSemanticError || error instanceof SyntaxError || error instanceof Error && error.name === "ZodError" ||
    error instanceof ApiClientError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}

function snapshotStage(
  snapshot: RestorableRunSnapshot,
  fallbackStage: RunStage,
) {
  return snapshot.currentStage ?? fallbackStage;
}

function fallbackRunError(message: string): RunError {
  return {
    code: "RUN_INTERNAL_ERROR",
    message,
    category: "internal",
    retryable: true,
  };
}

async function waitForTerminalSnapshot<TSnapshot extends RestorableRunSnapshot>({
  runId,
  projectId,
  onEvent,
  readSnapshot,
  fallbackFailureMessage,
  fallbackCancelledStage,
  fallbackProgressStage,
  progressMessage,
  progressForSnapshot,
  signal,
  onSnapshot,
}: SnapshotWaitInput<TSnapshot>) {
  let delayMs = INITIAL_SNAPSHOT_POLL_MS;

  while (true) {
    throwIfAborted(signal);
    try {
      const snapshot = await readSnapshot(runId, projectId);
      throwIfAborted(signal);
      await onSnapshot?.(snapshot);
      if (snapshot.status === "completed") {
        onEvent({ type: "completed", snapshot });
        return;
      }
      if (snapshot.status === "failed") {
        const message = snapshotErrorMessage(snapshot, fallbackFailureMessage);
        const error = snapshot.error ?? fallbackRunError(message);
        onEvent({
          type: "failed",
          stage: snapshot.currentStage ?? undefined,
          error,
        });
        throw new StreamedRunFailedError(error);
      }
      if (snapshot.status === "cancelled") {
        onEvent({
          type: "cancelled",
          stage: snapshotStage(snapshot, fallbackCancelledStage),
          message: snapshotErrorMessage(snapshot, "任务已取消"),
        });
        return;
      }
      onEvent({
        type: "stage_progress",
        stage: snapshotStage(snapshot, fallbackProgressStage),
        progress: progressForSnapshot(snapshot),
        message: progressMessage,
      });
    } catch (error) {
      if (!isRetryableConnectionError(error)) {
        throw error;
      }
      const retryableNetworkError =
        (error instanceof ApiClientError && (error.status >= 500 || error.status === 429)) ||
        error instanceof TypeError ||
        (error instanceof Error &&
          (error.message === "Failed to fetch" ||
            error.message === "NetworkError when attempting to fetch resource." ||
            error.message === "fetch failed"));
      if (!retryableNetworkError) {
        throw error;
      }
      onEvent({
        type: "stage_progress",
        stage: fallbackProgressStage,
        progress: 5,
        message: `${progressMessage}（网络连接恢复中）`,
      });
    }

    await sleep(delayMs, signal);
    delayMs = Math.min(MAX_SNAPSHOT_POLL_MS, Math.floor(delayMs * 1.5));
  }
}

async function subscribeToProjectRun<TSnapshot extends RestorableRunSnapshot>(
  endpoint: string,
  input: SnapshotWaitInput<TSnapshot>,
) {
  const projectId = requireProjectScope(input.projectId);
  const seenEventIds = new Set<string>();
  let cursor = 0;
  let pending: RunEventInput[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const batch = pending;
    pending = [];
    if (!input.signal?.aborted) for (const event of batch) input.onEvent(event);
  };
  const onEvent = (event: RunEventInput) => {
    // The server replays persisted events on every connection; deliver each once.
    if (event.eventId) {
      if (seenEventIds.has(event.eventId)) return;
      seenEventIds.add(event.eventId);
    }
    pending.push(event);
    if (["completed", "failed", "cancelled"].includes(event.type)) flush();
    else timer ??= setTimeout(flush, 100);
  };
  const receive = async (event: RunEvent) => {
    if (event.type === "llm_chunk" || (event.type === "run_activity" && ["reasoning", "summary", "output"].includes(event.phase))) {
      cursor = Math.max(cursor, event.sequence ?? 0);
      return;
    }
    // Progress snapshots deliberately omit artifacts. Read the full terminal
    // snapshot before allowing workspace reducers to apply the result.
    if (event.type === "completed") {
      await waitForTerminalSnapshot({ ...input, onEvent });
    } else {
      onEvent(event);
    }
    cursor = Math.max(cursor, event.sequence ?? 0);
  };
  for (let attempt = 0; attempt <= MAX_PROJECT_STREAM_RECONNECTS; attempt += 1) {
    throwIfAborted(input.signal);
    try {
      await streamProjectRunEvents(`${endpoint}?view=progress&afterSequence=${cursor}`, projectId, receive, input.signal);
      return;
    } catch (error) {
      flush();
      if (!isRetryableConnectionError(error)) throw error;
    }
    // Reconcile partial artifacts immediately, before waiting to reconnect.
    let snapshot: TSnapshot | null = null;
    try {
      snapshot = await input.readSnapshot(input.runId, projectId);
    } catch (error) {
      if (!isRetryableConnectionError(error)) throw error;
    }
    throwIfAborted(input.signal);
    if (snapshot) {
      if (snapshot.status !== "queued" && snapshot.status !== "running") {
        await waitForTerminalSnapshot({ ...input, onEvent, readSnapshot: async () => snapshot! });
        return;
      }
      await input.onSnapshot?.(snapshot);
    }
    if (attempt < MAX_PROJECT_STREAM_RECONNECTS) {
      onEvent({
        type: "stage_progress",
        stage: snapshot ? snapshotStage(snapshot, input.fallbackProgressStage) : input.fallbackProgressStage,
        progress: snapshot ? input.progressForSnapshot(snapshot) : 5,
        message: "连接暂时中断，正在恢复实时进度",
      });
      await sleep(1_000 * 2 ** attempt, input.signal);
    }
  }
  await waitForTerminalSnapshot({ ...input, onEvent });
}

export async function readRunSnapshot(
  runId: string,
  projectId: string | null,
) {
  const snapshot = await requestJson<RunSnapshot>(`/api/runs/${runId}`, {
    errorKey: "errors.operations.loadRun",
    headers: projectHeaders(requireProjectScope(projectId)),
  });
  assertCurrentRunSnapshot(snapshot);
  return snapshot;
}

export async function readDesignRunSnapshot(
  runId: string,
  projectId: string | null,
) {
  const snapshot = await requestJson<DesignRunSnapshot>(`/api/design-runs/${runId}`, {
    errorKey: "errors.operations.loadRun",
    headers: projectHeaders(requireProjectScope(projectId)),
  });
  assertCurrentRunSnapshot(snapshot);
  return snapshot;
}


export async function readDocumentRunSnapshot(
  runId: string,
  projectId: string | null,
) {
  const snapshot = await requestJson<DocumentRunSnapshot>(`/api/document-runs/${runId}`, {
    errorKey: "errors.operations.loadRun",
    headers: projectHeaders(requireProjectScope(projectId)),
  });
  assertCurrentRunSnapshot(snapshot);
  return snapshot;
}

export async function streamProjectRunEvents(
  endpoint: string,
  projectId: string | null,
  onEvent: (event: RunEvent) => void | Promise<void>,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const response = await fetch(buildApiUrl(endpoint), {
    credentials: "include",
    headers: projectHeaders(requireProjectScope(projectId)),
    signal: controller.signal,
  }).catch((error) => { signal?.removeEventListener("abort", abort); throw error; });
  if (!response.ok) {
    signal?.removeEventListener("abort", abort);
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload && typeof payload === "object" && "message" in payload) {
        const payloadMessage = payload.message;
        if (typeof payloadMessage === "string" && payloadMessage.trim()) {
          message = payloadMessage;
        }
      }
    } catch {
      // Keep the status-based permission message when the SSE endpoint has no JSON body.
    }
    throw new ApiClientError(message, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) { signal?.removeEventListener("abort", abort); throw new Error("SSE stream unavailable"); }

  const decoder = new TextDecoder();
  let buffer = "";
  let terminalEventSeen = false;
  const readWithIdleTimeout = () =>
    new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("SSE stream idle timeout"));
      }, PROJECT_STREAM_IDLE_TIMEOUT_MS);
      reader.read().then(
        (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  const flushEvent = async (chunk: string) => {
    const data = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) return;
    const event = runEventSchema.parse(JSON.parse(data));
    await onEvent(event);
    if (event.type === "completed" || event.type === "cancelled") {
      terminalEventSeen = true;
    }
    if (event.type === "failed") {
      terminalEventSeen = true;
      throw new StreamedRunFailedError(event.error);
    }
  };

  try {
    while (true) {
      const { done, value } = await readWithIdleTimeout();
      buffer += decoder.decode(value, { stream: !done });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        await flushEvent(chunk);
        if (terminalEventSeen) break;
      }
      if (done || terminalEventSeen) break;
    }
    if (!terminalEventSeen && buffer.trim()) {
      await flushEvent(buffer);
    }
    if (!terminalEventSeen) {
      throw new Error("SSE stream ended before terminal event");
    }
  } catch (error) {
    controller.abort();
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    if (terminalEventSeen) {
      controller.abort();
      await reader.cancel().catch(() => {});
    }
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export async function readFeasibilityRunSnapshot(
  runId: string,
  projectId: string | null,
) {
  const snapshot = await requestJson<FeasibilityRunSnapshot>(`/api/feasibility-runs/${runId}`, {
    errorKey: "errors.operations.loadFeasibility",
    headers: projectHeaders(requireProjectScope(projectId)),
  });
  assertCurrentRunSnapshot(snapshot);
  return snapshot;
}

async function waitForRequirementRunSnapshot(
  runId: string,
  onEvent: (event: RunEventInput) => void,
  projectId: string | null,
  options: RunSubscriptionOptions<RunSnapshot> = {},
) {
  const wait = (input: SnapshotWaitInput<RunSnapshot>) => subscribeToProjectRun(`/api/runs/${runId}/events`, input);
  await wait({
    ...options,
    runId,
    projectId,
    onEvent,
    readSnapshot: readRunSnapshot,
    fallbackFailureMessage: "生成失败",
    fallbackCancelledStage: "generate_models",
    fallbackProgressStage: "generate_models",
    progressMessage: "SSE 已断开，正在通过快照轮询等待需求生成任务",
    progressForSnapshot: (snapshot) =>
      snapshot.currentStage === "render_svg"
        ? 90
        : snapshot.currentStage === "generate_plantuml"
          ? 75
          : snapshot.currentStage === "generate_models"
            ? 55
            : 20,
  });
}

async function waitForDesignRunSnapshot(
  runId: string,
  onEvent: (event: RunEventInput) => void,
  projectId: string | null,
  options: RunSubscriptionOptions<DesignRunSnapshot> = {},
) {
  const wait = (input: SnapshotWaitInput<DesignRunSnapshot>) => subscribeToProjectRun(`/api/design-runs/${runId}/events`, input);
  await wait({
    ...options,
    runId,
    projectId,
    onEvent,
    readSnapshot: readDesignRunSnapshot,
    fallbackFailureMessage: "设计生成失败",
    fallbackCancelledStage: "generate_design_models",
    fallbackProgressStage: "generate_design_models",
    progressMessage: "SSE 已断开，正在通过快照轮询等待设计生成任务",
    progressForSnapshot: (snapshot) =>
      snapshot.currentStage === "render_svg"
        ? 90
        : snapshot.currentStage === "generate_plantuml"
          ? 75
          : snapshot.currentStage === "generate_design_sequence"
            ? 40
            : snapshot.currentStage === "generate_design_models"
              ? 60
              : 20,
  });
}


async function waitForDocumentRunSnapshot(
  runId: string,
  onEvent: (event: RunEventInput) => void,
  projectId: string | null,
  options: RunSubscriptionOptions<DocumentRunSnapshot> = {},
) {
  const wait = (input: SnapshotWaitInput<DocumentRunSnapshot>) => subscribeToProjectRun(`/api/document-runs/${runId}/events`, input);
  await wait({
    ...options,
    runId,
    projectId,
    onEvent,
    readSnapshot: readDocumentRunSnapshot,
    fallbackFailureMessage: "说明书生成失败",
    fallbackCancelledStage: "generate_document_text",
    fallbackProgressStage: "generate_document_text",
    progressMessage: "SSE 已断开，正在通过快照轮询等待说明书生成任务",
    progressForSnapshot: (snapshot) =>
      snapshot.currentStage === "render_document_file" ? 90 : 55,
  });
}

async function waitForFeasibilityRunSnapshot(
  runId: string,
  onEvent: (event: RunEventInput) => void,
  projectId: string | null,
  options: RunSubscriptionOptions<FeasibilityRunSnapshot> = {},
) {
  const wait = (input: SnapshotWaitInput<FeasibilityRunSnapshot>) => subscribeToProjectRun(`/api/feasibility-runs/${runId}/events`, input);
  await wait({
    ...options,
    runId,
    projectId,
    onEvent,
    readSnapshot: readFeasibilityRunSnapshot,
    fallbackFailureMessage: "可行性分析生成失败",
    fallbackCancelledStage: "generate_context",
    fallbackProgressStage: "generate_context",
    progressMessage: "SSE 已断开，正在通过快照轮询等待可行性分析",
    progressForSnapshot: (snapshot) =>
      snapshot.currentStage === "generate_implementation"
        ? 85
        : snapshot.currentStage === "render_business_flow"
          ? 75
          : snapshot.currentStage === "generate_business_flow"
            ? 65
        : snapshot.currentStage === "render_context"
          ? 60
          : 35,
  });
}

export async function subscribeToRequirementRunEvents({
  runId,
  projectId,
  onEvent,
  ...options
}: RunSubscriptionInput<RunSnapshot>) {
  await waitForRequirementRunSnapshot(runId, onEvent, projectId, options);
}

export async function subscribeToDesignRunEvents({
  runId,
  projectId,
  onEvent,
  ...options
}: RunSubscriptionInput<DesignRunSnapshot>) {
  await waitForDesignRunSnapshot(runId, onEvent, projectId, options);
}

export async function subscribeToDocumentRunEvents({
  runId,
  projectId,
  onEvent,
  ...options
}: RunSubscriptionInput<DocumentRunSnapshot>) {
  await waitForDocumentRunSnapshot(runId, onEvent, projectId, options);
}

export async function subscribeToFeasibilityRunEvents({
  runId,
  projectId,
  onEvent,
  ...options
}: RunSubscriptionInput<FeasibilityRunSnapshot>) {
  await waitForFeasibilityRunSnapshot(runId, onEvent, projectId, options);
}
