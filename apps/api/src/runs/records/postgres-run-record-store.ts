// Persists run records/events to PostgreSQL while preserving the existing Map API.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertCurrentRunSnapshot, runEventSchema, runEventMetadataSchema, type DashboardRun, type RunEvent } from "@uml-platform/contracts";
import type { Queryable } from "../../db/transactions.js";
import type { RunRecord, RunRecordMetadata, RunRecordReadOptions, RunRecordStore } from "./run-record-store.js";
import { createRunError } from "../pipelines/shared/errors.js";
import { dashboardArtifactTimings, type DashboardTimingEvent, type DashboardTimingSnapshot } from "./dashboard-artifact-timings.js";
import { RUN_SUMMARY_SNAPSHOT_SQL } from "./run-summary-projection.js";

interface RunRecordRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  source_run_id: string | null;
  source_action: RunRecordMetadata["sourceAction"] | null;
  source_run_status: string | null;
  snapshot: RunRecord["snapshot"];
  status: string;
  stage: string;
  model: string | null;
  provider_config_id: string | null;
  error: RunRecord["snapshot"]["error"] | null;
  error_code: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
  event_count: number | string;
  event_sequence: number | string;
}

interface RunEventRow {
  run_id: string;
  sequence: number;
  payload: unknown;
  created_at: Date | string;
}

// Completed rows reference their owning record; embedded snapshots are not a storage contract.
const persistedCompletedRunEventSchema = runEventMetadataSchema.extend({
  type: z.literal("completed"),
  snapshotRef: z.string().min(1),
}).strict();
type PersistedRunEvent = Exclude<RunEvent, { type: "completed" }> | z.infer<typeof persistedCompletedRunEventSchema>;
type PersistJob = Promise<void>;

export interface PersistentRunRecordStore extends RunRecordStore {
  flush(): Promise<void>;
  refreshRun(runId: string, options?: RunRecordReadOptions): Promise<RunRecord | null>;

}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function requiredTimestamp(value: Date | string | null | undefined) {
  const timestamp = toIsoString(value);
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) throw new Error("Run record is missing a current timestamp");
  return timestamp;
}

function readModel(snapshot: RunRecord["snapshot"]) {
  const settings: unknown = "standardRun" in snapshot && snapshot.standardRun ? snapshot.standardRun : "providerSettings" in snapshot ? snapshot.providerSettings : undefined;
  if (!settings || typeof settings !== "object" || !("model" in settings)) {
    return null;
  }
  const model = (settings as { model?: unknown }).model;
  return typeof model === "string" ? model : null;
}

function readProviderConfigId(snapshot: RunRecord["snapshot"]) {
  const settings: unknown = "standardRun" in snapshot && snapshot.standardRun ? snapshot.standardRun : "providerSettings" in snapshot ? snapshot.providerSettings : undefined;
  if (!settings || typeof settings !== "object" || !("providerConfigId" in settings)) {
    return null;
  }
  const providerConfigId = (settings as { providerConfigId?: unknown }).providerConfigId;
  return typeof providerConfigId === "string" && providerConfigId.trim()
    ? providerConfigId
    : null;
}

function readStage(snapshot: RunRecord["snapshot"]) {
  return snapshot.currentStage ?? "queued";
}

function terminalStatusFromEvent(event: RunEvent | undefined) {
  if (!event) return null;
  if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
    return event.type;
  }
  return null;
}

function readPersistedStatus(record: RunRecord, event?: RunEvent) {
  const eventStatus = terminalStatusFromEvent(event);
  if (eventStatus) return eventStatus;
  if (record.terminal) {
    for (let index = record.events.length - 1; index >= 0; index -= 1) {
      const status = terminalStatusFromEvent(record.events[index]);
      if (status) return status;
    }
  }
  return record.snapshot.status;
}

function readCompletedAt(record: RunRecord, event?: RunEvent) {
  if (record.metadata?.completedAt) return record.metadata.completedAt;
  if (!record.terminal && !terminalStatusFromEvent(event)) return null;
  return new Date().toISOString();
}

function persistedSystemName(snapshot: unknown) {
  const value = (snapshot as { _systemName?: unknown } | null)?._systemName;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function createMetadata(row: RunRecordRow): RunRecordMetadata | undefined {
  if (
    !row.user_id &&
    !row.project_id &&
    !row.source_run_id &&
    !row.source_action &&
    !row.source_run_status &&
    !row.completed_at &&
    !row.model
  ) {
    return undefined;
  }
  return {
    userId: row.user_id ?? undefined,
    offlineDemoFixture: (row.snapshot as { _offlineDemoFixture?: unknown })._offlineDemoFixture === "library-seat" ? "library-seat" : undefined,
    systemName: persistedSystemName(row.snapshot),
    projectId: row.project_id ?? undefined,
    sourceRunId: row.source_run_id ?? undefined,
    sourceAction: row.source_action ?? undefined,
    sourceRunStatus: row.source_run_status ?? undefined,
    model: row.model ?? undefined,
    createdAt: requiredTimestamp(row.created_at),
    completedAt: toIsoString(row.completed_at),
  };
}

function shouldPersistProgressSnapshots() {
  return process.env.UML_PERSIST_PROGRESS_SNAPSHOT === "true";
}

function shouldPersistSnapshotForEvent(event: RunEvent) {
  if (event.type === "llm_chunk" || event.type === "run_activity") {
    return false;
  }
  if (event.type === "stage_progress") {
    return shouldPersistProgressSnapshots();
  }
  return true;
}

function serializeEventForPersistence(event: RunEvent, snapshot: RunRecord["snapshot"]): PersistedRunEvent {
  if (event.type === "completed") {
    return { type: "completed", snapshotRef: snapshot.runId, eventId: event.eventId, createdAt: event.createdAt };
  }
  return event;
}

function hydratePersistedEvent(
  event: unknown,
  snapshot: RunRecord["snapshot"],
): RunEvent {
  if (event && typeof event === "object" && "type" in event && event.type === "completed") {
    const completed = persistedCompletedRunEventSchema.parse(event);
    if (completed.snapshotRef !== snapshot.runId) throw new Error("Completed event references a different run snapshot");
    return { type: "completed", snapshot, eventId: completed.eventId, createdAt: completed.createdAt };
  }
  return runEventSchema.parse(event);
}

function shouldMarkActiveRunsInterruptedOnRestore(env: NodeJS.ProcessEnv = process.env) {
  const queueMode = env.UML_RUN_QUEUE_MODE?.trim().toLowerCase();
  return queueMode !== "bullmq";
}

function cloneSnapshot(snapshot: RunRecord["snapshot"]) {
  return JSON.parse(JSON.stringify(snapshot)) as RunRecord["snapshot"];
}

function isActiveStatus(status: string) {
  return status === "queued" || status === "running";
}

class PostgresRunRecordStore extends Map<string, RunRecord> implements PersistentRunRecordStore {
  private readonly pending = new Set<PersistJob>();
  private readonly chains = new Map<string, PersistJob>();
  private readonly failures: unknown[] = [];

  constructor(private readonly db: Queryable) {
    super();
  }

  override set(runId: string, record: RunRecord) {
    this.attachPersistence(record);
    super.set(runId, record);
    this.enqueue(runId, () => this.saveRecord(record));
    return this;
  }

  override delete(runId: string) {
    const deleted = super.delete(runId);
    // Historical records need not be cached before an authorized history deletion.
    this.enqueue(runId, () =>
      this.db.query("delete from run_records where id = $1", [runId]).then(() => undefined),
    );
    return deleted;
  }

  release(runId: string) {
    super.delete(runId);
  }

  async restore() {
    // BullMQ owns recovery. Starting API/worker processes must never hydrate history.
    if (!shouldMarkActiveRunsInterruptedOnRestore()) return;
    const records = await this.db.query<RunRecordRow>(`
      select id, user_id, project_id, source_run_id, source_action, source_run_status, snapshot, status, stage, model, provider_config_id, error, error_code, created_at, completed_at,
        (select count(*) from run_events where run_id = run_records.id) as event_count,
        (select coalesce(max(sequence), 0) from run_events where run_id = run_records.id) as event_sequence
      from run_records
      where status in ('queued', 'running')
      order by created_at asc
    `);
    this.applyLoadedRows(records.rows, [], { markActiveInterrupted: true });
    await this.flush();
  }

  async refreshRun(runId: string, options: RunRecordReadOptions = {}) {
    const local = super.get(runId);
    // A pipeline's live record owns cancellation/listeners and must retain object identity.
    if (local && !local.terminal && local.executionActive) return local;
    await this.flush();
    const records = await this.db.query<RunRecordRow>(
      `
        select id, user_id, project_id, source_run_id, source_action, source_run_status, snapshot, status, stage, model, provider_config_id, error, error_code, created_at, completed_at,
          (select count(*) from run_events where run_id = run_records.id) as event_count,
          (select coalesce(max(sequence), 0) from run_events where run_id = run_records.id) as event_sequence
        from run_records
        where id = $1
      `,
      [runId],
    );
    const events = await this.loadEventsForRunIds(records.rows.map((row) => row.id), options);
    // Request-scoped history is released with the response, rather than accumulating in every process.
    return this.applyLoadedRows(records.rows, events, { markActiveInterrupted: false })[0] ?? null;
  }

async listRecords(projectIds?: string[]) {
    if (projectIds?.length === 0) return [];
    await this.flush();
    const result: RunRecord[] = [];
    let cursor = "";
    // Database batches carry compact metadata only; list views never populate the execution cache.
    for (;;) {
      const rows = await this.db.query<RunRecordRow>(`
        select id, user_id, project_id, source_run_id, source_action, source_run_status,
          (${RUN_SUMMARY_SNAPSHOT_SQL}) as snapshot,
          status, stage, model, provider_config_id, error, error_code, created_at, completed_at,
          (select count(*) from run_events where run_id = run_records.id) as event_count,
          (select coalesce(max(sequence), 0) from run_events where run_id = run_records.id) as event_sequence
        from run_records
        where ($1::text[] is null or project_id = any($1::text[])) and id > $2
        order by id asc limit 100
      `, [projectIds ?? null, cursor]);
      if (!rows.rows.length) break;
      const ids = rows.rows.map(row => row.id);
      const actions = await this.db.query<RunEventRow>(`
        select run_id, sequence,
          case when event_type = 'artifact_ready' then jsonb_strip_nulls(jsonb_build_object(
            'type', payload->'type', 'eventId', payload->'eventId', 'createdAt', payload->'createdAt',
            'stage', payload->'stage', 'artifactKind', payload->'artifactKind',
            'modelId', payload->'modelId', 'diagramKind', payload->'diagramKind', 'subtaskId', payload->'subtaskId', 'subtaskStatus', payload->'subtaskStatus'))
          else payload end as payload, created_at from run_events
        where run_id = any($1::text[]) and event_type in ('run_action', 'artifact_ready')
        order by run_id asc, sequence asc
      `, [ids]);
      const records = this.applyLoadedRows(rows.rows, actions.rows, { markActiveInterrupted: false, readOnly: true });
      result.push(...records);
      cursor = ids.at(-1)!;
      if (ids.length < 100) break;
    }
    return result;
  }

  async listDashboardRuns(projectIds: string[]): Promise<DashboardRun[]> {
    if (projectIds.length === 0) return [];
    await this.flush();
    // Read only summary fields from persisted records. Stage timestamps are real events, not
    // substitutes based on queue creation; absent stage events have no stage timing.
    const result = await this.db.query<{
      id: string; project_id: string; status: DashboardRun["status"]; model: string | null;
      run_kind: DashboardRun["runKind"]; created_at: Date | string;
      started_at: Date | string | null; completed_at: Date | string | null;
      timing_snapshot: Omit<DashboardTimingSnapshot, "runKind">;
      timing_events: { event: DashboardTimingEvent; at: string }[] | null;
    }>(`
      select r.id, r.project_id,
        case when r.status in ('queued', 'running') and r.completed_at is not null then 'failed' else r.status end as status,
        coalesce(nullif(trim(r.model), ''), nullif(trim(r.snapshot->'providerSettings'->>'model'), '')) as model,
        case when r.snapshot ? 'selectedArtifacts' then 'feasibility'
          when r.snapshot ? 'documentKind' then 'document'
          when r.snapshot ? 'designModelTraceability' then 'design' else 'requirements' end as run_kind,
        r.created_at, r.completed_at,
        jsonb_build_object('documentId', r.snapshot->>'documentId', 'documentKind', r.snapshot->>'documentKind',
          'fileName', r.snapshot->>'fileName', 'models', coalesce((select jsonb_agg(jsonb_build_object(
            'modelId', m->>'modelId', 'diagramKind', m->>'diagramKind', 'title', m->>'title'))
            from jsonb_array_elements(case when jsonb_typeof(r.snapshot->'models') = 'array'
              then r.snapshot->'models' else '[]'::jsonb end) m), '[]'::jsonb)) as timing_snapshot,
        (select jsonb_agg(jsonb_build_object('at', e.created_at, 'event', jsonb_build_object(
          'type', e.payload->>'type', 'eventId', e.payload->>'eventId', 'createdAt', e.payload->>'createdAt',
          'stage', e.payload->>'stage', 'subtaskId', e.payload->>'subtaskId',
          'subtaskStatus', e.payload->>'subtaskStatus', 'diagramKind', e.payload->>'diagramKind',
          'modelId', e.payload->>'modelId', 'artifactKind', e.payload->>'artifactKind', 'phase', e.payload->>'phase',
          'callId', e.payload->>'callId', 'operation', e.payload->>'operation')) order by e.sequence)
          from run_events e where e.run_id = r.id and (e.payload->>'type' in ('stage_started', 'stage_progress', 'artifact_ready')
            or (e.payload->>'type'='run_activity' and e.payload->>'phase' in ('started','completed','failed')))) as timing_events,
        (select e.created_at from run_events e where e.run_id = r.id and e.payload->>'type' = 'stage_started'
          order by e.sequence asc limit 1) as started_at
      from run_records r where r.project_id = any($1::text[])
    `, [projectIds]);
    return result.rows.map(row => ({ runId: row.id, projectId: row.project_id,
      status: row.status, model: row.model, runKind: row.run_kind,
      createdAt: toIsoString(row.created_at) ?? null, startedAt: toIsoString(row.started_at) ?? null,
      completedAt: toIsoString(row.completed_at) ?? null,
      artifactTimings: dashboardArtifactTimings({ ...row.timing_snapshot, runKind: row.run_kind, status: row.status },
        (row.timing_events ?? []).map(item => { runEventMetadataSchema.parse(item.event); return item.event; }),
        (row.timing_events ?? []).map(item => item.at)),
    }));
  }

  async flushRun(runId: string) {
    await this.chains.get(runId);
  }

  async flush() {
    while (this.pending.size > 0) {
      await Promise.all(Array.from(this.pending));
    }
    if (this.failures.length > 0) {
      throw this.failures.shift();
    }
  }

  private attachPersistence(record: RunRecord) {
    record.persist = (nextRecord, event) => {
      // Capture before enqueue: later stream chunks must not overwrite this event's row.
      const sequence = event?.sequence ?? nextRecord.eventSequence ?? nextRecord.events.length;
      this.enqueue(nextRecord.snapshot.runId, () => this.saveRecord(nextRecord, event, sequence));
    };
  }

  private async loadEventsForRunIds(runIds: string[], options: RunRecordReadOptions = {}) {
    if (runIds.length === 0 || options.events === "none") return [];
    const filtered = options.events === "progress" || options.events === "diagnostic";
    const events = await this.db.query<RunEventRow>(
      `
        select run_id, sequence, ${filtered ? `case
          when payload->>'type' = 'run_activity' then payload - 'text' - 'inputImages'
          when payload->>'type' = 'artifact_ready' then payload - 'coverageMatrix' - 'traceabilityMatrix'
          else payload end as payload` : "payload"}, created_at
        from run_events
        where run_id = any($1::text[]) and sequence > $2
          ${filtered ? "and payload->>'type' != 'llm_chunk' and not (payload->>'type' = 'run_activity' and payload->>'phase' in ('reasoning', 'output', 'summary'))" : ""}
        order by run_id asc, sequence asc
      `,
      [runIds, options.afterSequence ?? 0],
    );
    return events.rows;
  }

  private applyLoadedRows(
    rows: RunRecordRow[],
    eventRows: RunEventRow[],
    { markActiveInterrupted, readOnly = false }: { markActiveInterrupted: boolean; readOnly?: boolean },
  ) {
    const loaded: RunRecord[] = [];
    const eventRowsByRun = new Map<string, RunEventRow[]>();
    for (const row of eventRows) {
      const list = eventRowsByRun.get(row.run_id) ?? [];
      list.push(row);
      eventRowsByRun.set(row.run_id, list);
    }

    for (const row of rows) {
      const existing = super.get(row.id);
      const snapshot = cloneSnapshot(row.snapshot);
      snapshot.status = row.status as RunRecord["snapshot"]["status"];
      // Keep the server-only execution marker outside public run snapshots and events.
      if ("_offlineDemoFixture" in snapshot) delete snapshot._offlineDemoFixture;
      if ("_systemName" in snapshot) delete snapshot._systemName;
      // Compact list projections omit full model content; detail/worker restores must satisfy current contracts.
      if (!readOnly) assertCurrentRunSnapshot(snapshot);
      const events = (eventRowsByRun.get(row.id) ?? []).map((eventRow) =>
        ({ ...hydratePersistedEvent(eventRow.payload, snapshot), sequence: eventRow.sequence }),
      );
      const eventCreatedAt = (eventRowsByRun.get(row.id) ?? []).map(
        (eventRow) => requiredTimestamp(eventRow.created_at),
      );
      const activeStatus = isActiveStatus(row.status);
      const staleActiveWithCompletedAt = activeStatus && Boolean(row.completed_at);
      const restoredInterruptedRun =
        staleActiveWithCompletedAt || (markActiveInterrupted && activeStatus);
      const record: RunRecord = {
        snapshot,
        events,
        eventSequence: Number(row.event_sequence),
        persistedEventCount: Number(row.event_count),
        eventCreatedAt,
        listeners: existing?.listeners ?? new Set(),
        terminal:
          restoredInterruptedRun ||
          row.status === "completed" ||
          row.status === "failed" ||
          row.status === "cancelled" ||
          Boolean(row.completed_at),
        metadata: createMetadata(row),
        documentBuffer: existing?.documentBuffer,
      };
      if (restoredInterruptedRun && !record.snapshot.error) {
        record.snapshot.error = createRunError(
          "RUN_INTERNAL_ERROR",
          "Run interrupted by server restart",
        );
      }
      if (restoredInterruptedRun) {
        record.snapshot.status = "failed";
        if (!record.events.some((event) => event.type === "failed")) {
          record.events.push({
            type: "failed",
            eventId: randomUUID(),
            createdAt: new Date().toISOString(),
            sequence: (record.eventSequence ?? 0) + 1,
            stage: record.snapshot.currentStage ?? undefined,
            error:
              record.snapshot.error ??
              createRunError("RUN_INTERNAL_ERROR", "Run interrupted by server restart"),
          });
        }
      }
      if (!readOnly) this.attachPersistence(record);
      loaded.push(record);
      if (restoredInterruptedRun && !readOnly) {
        const event = record.events.at(-1);
        record.eventSequence = event?.sequence ?? record.eventSequence;
        this.enqueue(row.id, () => this.saveRecord(record, event));
      }
    }
    return loaded;
  }

  private enqueue(runId: string, job: () => PersistJob) {
    const previous = this.chains.get(runId) ?? Promise.resolve();
    const chained = previous.catch(() => undefined).then(job);
    this.chains.set(runId, chained);

    const tracked = chained
      .catch((error) => {
        this.failures.push(error);
      })
      .finally(() => {
        this.pending.delete(tracked);
        if (this.chains.get(runId) === chained) {
          this.chains.delete(runId);
          const local = super.get(runId);
          if (local?.terminal && local.listeners.size === 0) super.delete(runId);
        }
      });
    this.pending.add(tracked);
  }

  private async saveRecord(record: RunRecord, event?: RunEvent, sequence = event?.sequence ?? record.eventSequence ?? record.events.length) {
    const snapshot = record.snapshot;
    const metadata = record.metadata;
    if (!event || shouldPersistSnapshotForEvent(event)) {
      await this.db.query(
        `
          insert into run_records (
            id, user_id, project_id, source_run_id, source_action, source_run_status,
            stage, status, model, provider_config_id,
            snapshot, error, error_code, completed_at, created_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, now())
          on conflict (id) do update set
            user_id = excluded.user_id,
            project_id = excluded.project_id,
            source_run_id = excluded.source_run_id,
            source_action = excluded.source_action,
            source_run_status = excluded.source_run_status,
            stage = excluded.stage,
            status = excluded.status,
            model = excluded.model,
            provider_config_id = excluded.provider_config_id,
            snapshot = excluded.snapshot,
            error = excluded.error,
            error_code = excluded.error_code,
            completed_at = coalesce(excluded.completed_at, run_records.completed_at),
            updated_at = now()
        `,
        [
          snapshot.runId,
          metadata?.userId ?? null,
          metadata?.projectId ?? null,
          metadata?.sourceRunId ?? null,
          metadata?.sourceAction ?? null,
          metadata?.sourceRunStatus ?? null,
          readStage(snapshot),
          readPersistedStatus(record, event),
          readModel(snapshot),
          metadata?.offlineDemoFixture ? null : readProviderConfigId(snapshot),
          // Server-only execution markers ride inside the snapshot JSON and are stripped on load.
          JSON.stringify({
            ...snapshot,
            ...(metadata?.offlineDemoFixture ? { _offlineDemoFixture: metadata.offlineDemoFixture } : {}),
            ...(metadata?.systemName ? { _systemName: metadata.systemName } : {}),
          }),
          snapshot.error ? JSON.stringify(snapshot.error) : null,
          snapshot.error?.code ?? null,
          readCompletedAt(record, event),
          metadata?.createdAt ?? new Date().toISOString(),
        ],
      );
    }

    if (!event) return;
    const persistedEvent = serializeEventForPersistence(event, snapshot);
    await this.db.query(
      `
        insert into run_events (run_id, sequence, event_type, payload)
        values ($1, $2, $3, $4::jsonb)
        on conflict (run_id, sequence) do update set
          event_type = excluded.event_type,
          payload = excluded.payload
      `,
      [snapshot.runId, sequence, event.type, JSON.stringify(persistedEvent)],
    );
  }
}

export async function createPostgresRunRecordStore(
  db: Queryable,
): Promise<PersistentRunRecordStore> {
  const store = new PostgresRunRecordStore(db);
  await store.restore();
  return store;
}
