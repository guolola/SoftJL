// Defines the in-memory run record boundary shared by routes, pipelines, and SSE.
import { randomUUID } from "node:crypto";
import { acceptOutputEvent } from "./run-output-provenance.js";
import { runEventMetadataSchema } from "@uml-platform/contracts";
import type { DashboardRun, DesignRunSnapshot, DocumentRunSnapshot, FeasibilityRunSnapshot, RunEvent, RunEventInput, RunSnapshot } from "@uml-platform/contracts";

export interface RunRecord {
  snapshot: RunSnapshot | DesignRunSnapshot | DocumentRunSnapshot | FeasibilityRunSnapshot;
  events: RunEvent[];
  /** Persisted totals survive filtered replay and keep new event sequences monotonic. */
  eventSequence?: number;
  persistedEventCount?: number;
  eventCreatedAt?: string[];
  listeners: Set<(event: RunEvent) => void>;
  terminal: boolean;
  /** Local pipeline ownership preserves live listeners and cancellation during database refresh. */
  executionActive?: boolean;
  beforeTerminal?: Set<() => void>;
  beforeTerminalStages?: Set<(event: RunEventInput) => void>;
  documentBuffer?: Buffer;
  metadata?: RunRecordMetadata;
  persist?: (record: RunRecord, event?: RunEvent) => void | Promise<void>;
}

export type RunRecordStore = Map<string, RunRecord> & {
  // Dashboard queries persisted summaries without loading snapshots and event transcripts.
  listDashboardRuns?: (projectIds: string[]) => Promise<DashboardRun[]>;
  refreshRun?: (runId: string, options?: RunRecordReadOptions) => Promise<RunRecord | null>;
  listRecords?: (projectIds?: string[]) => Promise<RunRecord[]>;
  release?: (runId: string) => void;
  /** Wait only for this run before acknowledging a durable workspace transition. */
  flushRun?: (runId: string) => Promise<void>;
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

export function createRunRecordStore(): RunRecordStore {
  return new Map<string, RunRecord>();
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
