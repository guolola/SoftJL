// Defines the in-memory run record boundary shared by routes, pipelines, and SSE.
import { randomUUID } from "node:crypto";
import { acceptOutputEvent } from "./run-output-provenance.js";
import { assertCurrentRunSnapshot, runEventSchema, runEventMetadataSchema } from "@uml-platform/contracts";
import type {
  DashboardRun,

  DesignRunSnapshot,
  DocumentRunSnapshot,
  FeasibilityRunSnapshot,
  RunEvent,
  RunEventInput,
  RunSnapshot,
} from "@uml-platform/contracts";

export interface RunRecord {
  snapshot: RunSnapshot | DesignRunSnapshot | DocumentRunSnapshot | FeasibilityRunSnapshot;
  events: RunEvent[];
  /** Persisted totals survive filtered replay and keep new event sequences monotonic. */
  eventSequence?: number;
  persistedEventCount?: number;
  eventCreatedAt?: string[];
  listeners: Set<(event: RunEvent) => void>;
  terminal: boolean;
  beforeTerminal?: Set<() => void>;
  beforeTerminalStages?: Set<(event: RunEventInput) => void>;
  documentBuffer?: Buffer;
  metadata?: RunRecordMetadata;
  persist?: (record: RunRecord, event?: RunEvent) => void | Promise<void>;
  /** Ephemeral chat context; validated artifacts remain in the persisted snapshot. */
  conversationContext?: {
    forkBranches(ids: string[]): void;
    commitValidatedBranch(id: string, summary: string): void;
  };
}

export type RunRecordStore = Map<string, RunRecord> & {
  // Dashboard queries persisted summaries without loading snapshots and event transcripts.
  listDashboardRuns?: (projectIds: string[]) => Promise<DashboardRun[]>;
  refreshRun?: (runId: string, options?: RunRecordReadOptions) => Promise<RunRecord | null>;
  refreshProject?: (projectId: string) => Promise<void>;
  listRecords?: (projectIds?: string[]) => Promise<RunRecord[]>;
  release?: (runId: string) => void;
};

export interface RunRecordReadOptions {
  events?: "all" | "progress" | "diagnostic" | "none";
  afterSequence?: number;
}

export async function listRunRecordsIfAvailable(runs: RunRecordStore, projectIds?: string[]) {
  return runs.listRecords ? runs.listRecords(projectIds) : Array.from(runs.values()).filter(
    record => !projectIds || (record.metadata?.projectId && projectIds.includes(record.metadata.projectId)),
  );
}

// Releases process memory only; deleting history remains an explicit database operation.
export function releaseRunRecordIfAvailable(runs: RunRecordStore, runId: string) {
  runs.release?.(runId);
}

export async function refreshRunRecordIfAvailable(
  runs: RunRecordStore,
  runId: string,
  options?: RunRecordReadOptions,
) {
  return runs.refreshRun ? await runs.refreshRun(runId, options) : (runs.get(runId) ?? null);
}

export async function refreshProjectRunRecordsIfAvailable(
  runs: RunRecordStore,
  projectId: string,
) {
  await runs.refreshProject?.(projectId);
}

export interface RunRecordMetadata {
  /** Server-assigned fixture; persisted so retries remain offline. */
  offlineDemoFixture?: "library-seat";
  userId?: string;
  projectId?: string;
  /** Canonical system name from the project, kept identical across every generated model. */
  systemName?: string;
  model?: string;
  createdAt: string;
  completedAt?: string;
  sourceRunId?: string;
  sourceAction?: "retry" | "rerun";
  sourceRunStatus?: string;
}

export interface SerializedRunRecord {
  snapshot: RunRecord["snapshot"];
  events: RunEvent[];
  eventCreatedAt?: string[];
  terminal: boolean;
  metadata?: RunRecordMetadata;
  documentBufferBase64?: string;
}

export interface SerializedRunRecordStore {
  version: 1;
  records: SerializedRunRecord[];
}

function shouldStoreEvent(event: RunEvent) {
  if (event.type !== "llm_chunk") return true;
  return process.env.UML_PERSIST_LLM_CHUNKS === "true";
}

function isTerminalRunEvent(event: RunEventInput) {
  return event.type === "completed" || event.type === "failed" || event.type === "cancelled";
}

function terminalStatusFromEvent(event: RunEvent) {
  return isTerminalRunEvent(event) ? event.type : null;
}

function recordedTerminalStatus(record: RunRecord) {
  for (const event of record.events) {
    const status = terminalStatusFromEvent(event);
    if (status) return status;
  }
  return record.snapshot.status === "completed" ||
    record.snapshot.status === "failed" ||
    record.snapshot.status === "cancelled"
    ? record.snapshot.status
    : null;
}

function restoreRecordedTerminalStatus(record: RunRecord) {
  const status = recordedTerminalStatus(record);
  if (status) {
    record.snapshot.status = status;
  }
}

export function createRunRecordStore(
  initialState?: SerializedRunRecordStore,
): RunRecordStore {
  const store = new Map<string, RunRecord>();
  if (initialState && initialState.version !== 1) throw new Error("Unsupported run record format");
  for (const record of initialState?.records ?? []) {
    assertCurrentRunSnapshot(record.snapshot);
    store.set(record.snapshot.runId, {
      snapshot: record.snapshot,
      events: record.events.map(event => runEventSchema.parse(event)),
      eventCreatedAt: record.eventCreatedAt,
      listeners: new Set(),
      terminal: record.terminal,
      metadata: record.metadata,
      documentBuffer: record.documentBufferBase64
        ? Buffer.from(record.documentBufferBase64, "base64")
        : undefined,
    });
  }
  return store;
}

export function serializeRunRecordStore(
  runs: RunRecordStore,
): SerializedRunRecordStore {
  return {
    version: 1,
    records: Array.from(runs.values(), (record) => ({
      snapshot: record.snapshot,
      events: record.events,
      eventCreatedAt: record.eventCreatedAt,
      terminal: record.terminal,
      metadata: record.metadata,
      documentBufferBase64: record.documentBuffer?.toString("base64"),
    })),
  };
}

export function emitEvent(record: RunRecord, input: RunEventInput) {
  // Terminal lifecycle events close SSE streams; late worker progress after that
  // would make the task drawer appear completed while details still mutate.
  if (record.terminal) {
    if (input.type === "run_action") {
      // Retry/rerun lineage is allowed after terminal, but lifecycle terminal
      // state itself is immutable once the first terminal event closes the run.
    } else {
      if (isTerminalRunEvent(input)) {
        restoreRecordedTerminalStatus(record);
      }
      return;
    }
  }
  if (isTerminalRunEvent(input)) {
    for (const flush of record.beforeTerminal ?? []) flush();
    record.beforeTerminal?.clear();
    // Stage boundaries follow buffered output and precede the SSE terminal event.
    for (const finish of record.beforeTerminalStages ?? []) finish(input);
    record.beforeTerminalStages?.clear();
  }
  // Assign metadata after buffered stage events so publication times follow emission order.
  // Restored events must already carry valid metadata and never pass through this creation boundary.
  let event: RunEvent = { ...input, ...runEventMetadataSchema.parse({
    eventId: input.eventId ?? randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    sequence: input.sequence,
  }) };
  // Artifact receipts are persisted with the accepted snapshot before terminal publication.
  acceptOutputEvent(record, event);
  const storeEvent = shouldStoreEvent(event);
  if (storeEvent) {
    event = { ...event, sequence: (record.eventSequence ?? record.events.at(-1)?.sequence ?? record.events.length) + 1 };
    record.eventSequence = event.sequence;
    record.persistedEventCount = (record.persistedEventCount ?? record.events.length) + 1;
    record.events.push(event);
    (record.eventCreatedAt ??= []).push(new Date().toISOString());
  }
  for (const listener of record.listeners) {
    listener(event);
  }

  // completed/failed/cancelled are terminal events; SSE subscribers can close after them.
  if (isTerminalRunEvent(event)) {
    record.terminal = true;
    record.metadata = {
      ...(record.metadata ?? { createdAt: new Date().toISOString() }),
      completedAt: record.metadata?.completedAt ?? new Date().toISOString(),
    };
  }

  if (storeEvent) {
    void record.persist?.(record, event);
  }
}
