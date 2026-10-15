// Verifies the PostgreSQL-backed run record store contract used by API wiring.
import assert from "node:assert/strict";
import test from "node:test";
import type { RunEvent } from "@uml-platform/contracts";
import type { Queryable } from "../../db/transactions.js";
import { createEmptySnapshot } from "./snapshots.js";
import {
  createPostgresRunRecordStore,
} from "./postgres-run-record-store.js";
import { emitEvent, type RunRecord } from "./run-record-store.js";

interface FakeRunRow {
  id: string;
  user_id?: string | null;
  project_id?: string | null;
  source_run_id?: string | null;
  source_action?: "retry" | "rerun" | null;
  source_run_status?: string | null;
  snapshot: RunRecord["snapshot"];
  status: string;
  stage: string;
  model?: string | null;
  provider_config_id?: string | null;
  error_message?: string | null;
  error?: RunRecord["snapshot"]["error"] | null;
  error_code?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

interface FakeRunEventRow {
  run_id: string;
  sequence: number;
  payload: RunEvent | { type: "completed"; snapshotRef: string };
}

class FakeRunDb implements Queryable {
  readonly calls: { sql: string; params: readonly unknown[] }[] = [];
  readonly runRows = new Map<string, FakeRunRow>();
  readonly eventRows: FakeRunEventRow[] = [];

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ) {
    this.calls.push({ sql, params });
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("select id, user_id, project_id")) {
      let rows = Array.from(this.runRows.values());
      if (normalized.includes(" where id = $1")) {
        rows = rows.filter((row) => row.id === params[0]);
      }
      if (normalized.includes(" where project_id = $1")) {
        rows = rows.filter((row) => row.project_id === params[0]);
      }
      if (normalized.includes("where status in ('queued', 'running')")) {
        rows = rows.filter(row => row.status === "queued" || row.status === "running");
      }
      rows = rows.map(row => {
        const events = this.eventRows.filter(event => event.run_id === row.id);
        return { ...row, event_count: events.length, event_sequence: Math.max(0, ...events.map(event => event.sequence)) };
      });
      return {
        rows: rows as T[],
        rowCount: rows.length,
      };
    }

    if (normalized.startsWith("select run_id, sequence, payload")) {
      let rows = this.eventRows.slice();
      if (normalized.includes("where run_id = any")) {
        const ids = new Set(params[0] as string[]);
        rows = rows.filter((row) => ids.has(row.run_id));
      }
      if (normalized.includes("sequence > $2")) rows = rows.filter(row => row.sequence > Number(params[1]));
      return {
        rows: rows.sort((left, right) => left.sequence - right.sequence) as T[],
        rowCount: rows.length,
      };
    }

    if (normalized.startsWith("insert into run_records")) {
      const [
        id,
        userId,
        projectId,
        sourceRunId,
        sourceAction,
        sourceRunStatus,
        stage,
        status,
        model,
        providerConfigId,
        snapshot,
        error,
        errorCode,
        completedAt,
        createdAt,
      ] = params;
      const parsedSnapshot =
        typeof snapshot === "string"
          ? (JSON.parse(snapshot) as RunRecord["snapshot"])
          : (snapshot as RunRecord["snapshot"]);
      this.runRows.set(String(id), {
        id: String(id),
        user_id: typeof userId === "string" ? userId : null,
        project_id: typeof projectId === "string" ? projectId : null,
        source_run_id: typeof sourceRunId === "string" ? sourceRunId : null,
        source_action:
          sourceAction === "retry" || sourceAction === "rerun" ? sourceAction : null,
        source_run_status:
          typeof sourceRunStatus === "string" ? sourceRunStatus : null,
        stage: String(stage),
        status: String(status),
        model: typeof model === "string" ? model : null,
        provider_config_id:
          typeof providerConfigId === "string" ? providerConfigId : null,
        snapshot: parsedSnapshot,
        error:
          typeof error === "string"
            ? (JSON.parse(error) as RunRecord["snapshot"]["error"])
            : (error as RunRecord["snapshot"]["error"] | null),
        error_code: typeof errorCode === "string" ? errorCode : null,
        created_at: String(createdAt),
        updated_at: new Date().toISOString(),
        completed_at: typeof completedAt === "string" ? completedAt : null,
      });
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith("insert into run_events")) {
      const [runId, sequence, eventType, payload] = params;
      const parsedPayload =
        typeof payload === "string"
          ? (JSON.parse(payload) as FakeRunEventRow["payload"])
          : (payload as FakeRunEventRow["payload"]);
      assert.equal(eventType, parsedPayload.type);
      this.eventRows.push({
        run_id: String(runId),
        sequence: Number(sequence),
        payload: parsedPayload,
      });
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }
}

function attachProviderSettings(snapshot: ReturnType<typeof createEmptySnapshot>) {
  snapshot.providerSettings = {
    apiBaseUrl: "https://ai.comfly.org",
    apiKey: "redacted",
    model: "gpt-5.5",
  };
}

function attachManagedProviderSettings(snapshot: ReturnType<typeof createEmptySnapshot>) {
  snapshot.providerSettings = {
    providerConfigId: "provider-deepseek-v4pro",
    model: "deepseek-ai/DeepSeek-V4-Pro",
  };
}

function countRunRecordWrites(db: FakeRunDb) {
  return db.calls.filter((call) =>
    call.sql.replace(/\s+/g, " ").trim().toLowerCase().startsWith("insert into run_records"),
  ).length;
}

test("postgres run store restores offline execution metadata without exposing it in snapshots", async () => {
  const db = new FakeRunDb();
  const runs = await createPostgresRunRecordStore(db);
  const snapshot = createEmptySnapshot("offline-run", "演示需求", [], []);
  attachManagedProviderSettings(snapshot);
  snapshot.status = "completed";
  runs.set(snapshot.runId, { snapshot, events: [], listeners: new Set(), terminal: true,
    metadata: { projectId: "project-1", createdAt: "2026-09-23T00:00:00.000Z", offlineDemoFixture: "library-seat" } });
  await runs.flush();
  assert.equal(db.runRows.get(snapshot.runId)?.provider_config_id, null);
  const restored = (await (await createPostgresRunRecordStore(db)).refreshRun(snapshot.runId))!;
  assert.equal(restored.metadata?.offlineDemoFixture, "library-seat");
  assert.equal("_offlineDemoFixture" in restored.snapshot, false);
});

test("postgres run store persists records and emitted events", async () => {
  const db = new FakeRunDb();
  const runs = await createPostgresRunRecordStore(db);
  const snapshot = createEmptySnapshot("run-1", "需求文本", ["class"], []);
  attachProviderSettings(snapshot);
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      userId: "user-1",
      projectId: "project-1",
      createdAt: "2026-05-22T00:00:00.000Z",
    },
  };

  runs.set("run-1", record);
  emitEvent(record, { type: "queued" });
  snapshot.status = "completed";
  emitEvent(record, { type: "completed", snapshot } as RunEvent);
  await runs.flush();

  assert.equal(db.runRows.get("run-1")?.project_id, "project-1");
  assert.equal(db.runRows.get("run-1")?.status, "completed");
  assert.equal(db.runRows.get("run-1")?.model, "gpt-5.5");
  assert.equal(db.runRows.get("run-1")?.provider_config_id, null);
  assert.equal(db.eventRows.length, 2);
  assert.equal(db.eventRows[1]?.sequence, 2);
  assert.deepEqual(db.eventRows[1]?.payload, {
    type: "completed",
    snapshotRef: "run-1",
    eventId: record.events[1]?.eventId,
    createdAt: record.events[1]?.createdAt,
  });
  assert.deepEqual(db.eventRows.map((event) => event.sequence), [1, 2]);
  assert.equal("snapshot" in (record.events[1] ?? {}), true);

  const restored = await createPostgresRunRecordStore(db);
  assert.equal(restored.size, 0);
  const restoredRecord = await restored.refreshRun("run-1");
  assert.equal(restoredRecord?.snapshot.status, "completed");
  assert.equal(restoredRecord?.events.length, 2);
  assert.equal(restoredRecord?.events[1]?.type, "completed");
  assert.equal(
    restoredRecord?.events[1]?.type === "completed"
      ? restoredRecord.events[1].snapshot.runId
      : null,
    "run-1",
  );
  assert.equal(restoredRecord?.metadata?.userId, "user-1");
});

test("postgres run store restores legacy snapshots with removed extra JSON", async () => {
  const db = new FakeRunDb();
  const runs = await createPostgresRunRecordStore(db);
  const snapshot = createEmptySnapshot("run-legacy-json", "历史需求", [], []);
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: true,
    metadata: {
      projectId: "project-legacy",
      createdAt: "2026-07-30T00:00:00.000Z",
    },
  };
  snapshot.status = "completed";
  runs.set(snapshot.runId, record);
  await runs.flush();

  const persisted = db.runRows.get(snapshot.runId);
  assert.ok(persisted);
  const removedFieldName = ["evidence", "Package"].join("");
  persisted.snapshot = {
    ...persisted.snapshot,
    [removedFieldName]: {
      runId: snapshot.runId,
      status: "complete",
      generatedAt: "2026-07-30T00:00:00.000Z",
    },
  } as RunRecord["snapshot"];

  const restored = await createPostgresRunRecordStore(db);
  const loaded = await restored.refreshRun(snapshot.runId);
  assert.equal(loaded?.snapshot.status, "completed");
  assert.equal(loaded?.metadata?.projectId, "project-legacy");
});

test("postgres run store persists managed provider config ids", async () => {
  const db = new FakeRunDb();
  const runs = await createPostgresRunRecordStore(db);
  const snapshot = createEmptySnapshot("run-managed", "需求文本", ["usecase"], []);
  attachManagedProviderSettings(snapshot);
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      userId: "user-1",
      projectId: "project-1",
      createdAt: "2026-05-22T00:00:00.000Z",
    },
  };

  runs.set("run-managed", record);
  await runs.flush();

  const row = db.runRows.get("run-managed");
  assert.equal(row?.model, "deepseek-ai/DeepSeek-V4-Pro");
  assert.equal(row?.provider_config_id, "provider-deepseek-v4pro");
});

test("postgres run store persists retry and rerun source metadata", async () => {
  const db = new FakeRunDb();
  const runs = await createPostgresRunRecordStore(db);
  const snapshot = createEmptySnapshot("run-retry", "需求文本", ["usecase"], []);
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      userId: "user-1",
      projectId: "project-1",
      sourceRunId: "run-source",
      sourceAction: "retry",
      sourceRunStatus: "failed",
      createdAt: "2026-05-22T00:00:00.000Z",
    },
  };

  runs.set("run-retry", record);
  await runs.flush();

  const row = db.runRows.get("run-retry");
  assert.equal(row?.source_run_id, "run-source");
  assert.equal(row?.source_action, "retry");
  assert.equal(row?.source_run_status, "failed");

  const restored = await createPostgresRunRecordStore(db);
  const restoredRecord = await restored.refreshRun("run-retry");
  assert.equal(restoredRecord?.metadata?.sourceRunId, "run-source");
  assert.equal(restoredRecord?.metadata?.sourceAction, "retry");
  assert.equal(restoredRecord?.metadata?.sourceRunStatus, "failed");
});

test("postgres run store restores abandoned active runs as interrupted", async () => {
  const db = new FakeRunDb();
  const snapshot = createEmptySnapshot("run-interrupted", "需求文本", ["usecase"], []);
  snapshot.status = "running";
  snapshot.currentStage = "generate_models";
  snapshot.providerSettings = {
    apiBaseUrl: "https://ai.comfly.org",
    apiKey: "redacted",
    model: "gpt-5.5",
  };
  db.runRows.set("run-interrupted", {
    id: "run-interrupted",
    user_id: "user-1",
    project_id: "project-1",
    snapshot,
    status: "running",
    stage: "generate_models",
    error_message: null,
    created_at: "2026-05-22T00:00:00.000Z",
    updated_at: "2026-05-22T00:01:00.000Z",
    completed_at: null,
  });

  const restored = await createPostgresRunRecordStore(db);
  const record = await restored.refreshRun("run-interrupted");
  await restored.flush();

  assert.equal(record?.terminal, true);
  assert.equal(record?.snapshot.status, "failed");
  assert.equal(record?.snapshot.error?.message, "Run interrupted by server restart");
  assert.equal(record?.snapshot.error?.code, "RUN_INTERNAL_ERROR");
  assert.equal(record?.events.at(-1)?.type, "failed");
  assert.equal(db.runRows.get("run-interrupted")?.status, "failed");
  assert.equal(db.runRows.get("run-interrupted")?.error_code, "RUN_INTERNAL_ERROR");
  assert.ok(db.runRows.get("run-interrupted")?.completed_at);
});

test("postgres run store preserves active rows when bullmq queue mode is enabled", async () => {
  const previousQueueMode = process.env.UML_RUN_QUEUE_MODE;
  process.env.UML_RUN_QUEUE_MODE = "bullmq";

  try {
    const db = new FakeRunDb();
    const snapshot = createEmptySnapshot("run-worker-owned", "需求文本", ["usecase"], []);
    snapshot.status = "running";
    snapshot.currentStage = "generate_models";
    db.runRows.set("run-worker-owned", {
      id: "run-worker-owned",
      user_id: "user-1",
      project_id: "project-1",
      snapshot,
      status: "running",
      stage: "generate_models",
      error_message: null,
      created_at: "2026-05-22T00:00:00.000Z",
      updated_at: "2026-05-22T00:01:00.000Z",
      completed_at: null,
    });

    const restored = await createPostgresRunRecordStore(db);
    assert.equal(restored.size, 0);
    assert.equal(db.calls.length, 0);
    const record = await restored.refreshRun("run-worker-owned");
    await restored.flush();

    assert.equal(record?.terminal, false);
    assert.equal(record?.snapshot.status, "running");
    assert.equal(record?.events.some((event) => event.type === "failed"), false);
    assert.equal(db.runRows.get("run-worker-owned")?.status, "running");
  } finally {
    if (previousQueueMode === undefined) {
      delete process.env.UML_RUN_QUEUE_MODE;
    } else {
      process.env.UML_RUN_QUEUE_MODE = previousQueueMode;
    }
  }
});

test("postgres run store refreshes records updated by another process", async () => {
  const db = new FakeRunDb();
  const runs = await createPostgresRunRecordStore(db);
  const snapshot = createEmptySnapshot("run-refresh", "需求文本", ["class"], []);
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      userId: "user-1",
      projectId: "project-1",
      createdAt: "2026-05-22T00:00:00.000Z",
    },
  };
  const listener = () => undefined;
  record.listeners.add(listener);
  runs.set("run-refresh", record);
  await runs.flush();

  const failedSnapshot = createEmptySnapshot("run-refresh", "需求文本", ["class"], []);
  failedSnapshot.status = "failed";
  failedSnapshot.currentStage = "generate_models";
  failedSnapshot.error = {
    code: "PLATFORM_PROVIDER_BALANCE_INSUFFICIENT",
    message: "当前模型服务额度不足，请稍后重试或联系管理员。",
    category: "platform_provider",
    retryable: true,
  };
  db.runRows.set("run-refresh", {
    ...(db.runRows.get("run-refresh") as FakeRunRow),
    snapshot: failedSnapshot,
    status: "failed",
    stage: "generate_models",
    error: failedSnapshot.error,
    error_code: failedSnapshot.error.code,
    completed_at: "2026-05-22T00:02:00.000Z",
  });
  db.eventRows.push({
    run_id: "run-refresh",
    sequence: 1,
    payload: {
      type: "failed",
      stage: "generate_models",
      error: failedSnapshot.error,
    },
  });

  const refreshed = await runs.refreshRun("run-refresh");

  assert.equal(refreshed?.snapshot.status, "failed");
  assert.equal(refreshed?.terminal, true);
  assert.equal(refreshed?.events.at(-1)?.type, "failed");
  assert.equal(refreshed?.listeners.has(listener), true);
});

test("postgres run store normalizes active rows that already have completed timestamps", async () => {
  const db = new FakeRunDb();
  const snapshot = createEmptySnapshot("run-stale-active", "需求文本", ["class"], []);
  snapshot.status = "running";
  snapshot.currentStage = "generate_models";
  db.runRows.set("run-stale-active", {
    id: "run-stale-active",
    user_id: "user-1",
    project_id: "project-1",
    snapshot,
    status: "running",
    stage: "generate_models",
    error_message: "Run interrupted by server restart",
    created_at: "2026-05-22T00:00:00.000Z",
    updated_at: "2026-05-22T00:01:00.000Z",
    completed_at: "2026-05-22T00:02:00.000Z",
  });

  const restored = await createPostgresRunRecordStore(db);
  const record = await restored.refreshRun("run-stale-active");
  await restored.flush();

  assert.equal(record?.terminal, true);
  assert.equal(record?.snapshot.status, "failed");
  assert.equal(record?.events.at(-1)?.type, "failed");
  assert.equal(db.runRows.get("run-stale-active")?.status, "failed");
  assert.equal(db.runRows.get("run-stale-active")?.completed_at, "2026-05-22T00:02:00.000Z");
});

test("postgres run store skips snapshot upserts for streaming progress by default", async () => {
  const previousPersistProgress = process.env.UML_PERSIST_PROGRESS_SNAPSHOT;
  const previousPersistChunks = process.env.UML_PERSIST_LLM_CHUNKS;
  delete process.env.UML_PERSIST_PROGRESS_SNAPSHOT;
  delete process.env.UML_PERSIST_LLM_CHUNKS;

  try {
    const db = new FakeRunDb();
    const runs = await createPostgresRunRecordStore(db);
    const snapshot = createEmptySnapshot("run-progress", "需求文本", ["class"], []);
    attachProviderSettings(snapshot);
    const record: RunRecord = {
      snapshot,
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata: {
        userId: "user-1",
        projectId: "project-1",
        createdAt: "2026-05-22T00:00:00.000Z",
      },
    };

    runs.set("run-progress", record);
    await runs.flush();
    const writesAfterInitialSave = countRunRecordWrites(db);

    emitEvent(record, {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "partial",
    });
    emitEvent(record, {
      type: "stage_progress",
      stage: "generate_models",
      progress: 20,
      message: "解析中",
    });
    await runs.flush();

    assert.equal(countRunRecordWrites(db), writesAfterInitialSave);
    assert.equal(record.events.length, 1);
    assert.equal(record.events[0]?.type, "stage_progress");
    assert.equal(db.eventRows.length, 1);
    assert.equal(db.eventRows[0]?.payload.type, "stage_progress");
  } finally {
    if (previousPersistProgress === undefined) {
      delete process.env.UML_PERSIST_PROGRESS_SNAPSHOT;
    } else {
      process.env.UML_PERSIST_PROGRESS_SNAPSHOT = previousPersistProgress;
    }
    if (previousPersistChunks === undefined) {
      delete process.env.UML_PERSIST_LLM_CHUNKS;
    } else {
      process.env.UML_PERSIST_LLM_CHUNKS = previousPersistChunks;
    }
  }
});

test("postgres run store can persist llm chunks for temporary diagnostics", async () => {
  const previousPersistChunks = process.env.UML_PERSIST_LLM_CHUNKS;
  process.env.UML_PERSIST_LLM_CHUNKS = "true";

  try {
    const db = new FakeRunDb();
    const runs = await createPostgresRunRecordStore(db);
    const snapshot = createEmptySnapshot("run-debug-chunks", "需求文本", ["class"], []);
    attachProviderSettings(snapshot);
    const record: RunRecord = {
      snapshot,
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata: {
        userId: "user-1",
        projectId: "project-1",
        createdAt: "2026-05-22T00:00:00.000Z",
      },
    };

    runs.set("run-debug-chunks", record);
    emitEvent(record, {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "partial",
    });
    await runs.flush();

    assert.equal(record.events[0]?.type, "llm_chunk");
    assert.equal(db.eventRows[0]?.payload.type, "llm_chunk");
  } finally {
    if (previousPersistChunks === undefined) {
      delete process.env.UML_PERSIST_LLM_CHUNKS;
    } else {
      process.env.UML_PERSIST_LLM_CHUNKS = previousPersistChunks;
    }
  }
});

test("postgres run store keeps terminal status when later persistence observes a stale snapshot", async () => {
  const db = new FakeRunDb();
  const runs = await createPostgresRunRecordStore(db);
  const snapshot = createEmptySnapshot("run-terminal", "需求文本", ["class"], []);
  attachProviderSettings(snapshot);
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      userId: "user-1",
      projectId: "project-1",
      createdAt: "2026-05-22T00:00:00.000Z",
    },
  };

  runs.set("run-terminal", record);
  snapshot.status = "running";
  emitEvent(record, { type: "completed", snapshot } as RunEvent);
  snapshot.status = "running";
  emitEvent(record, {
    type: "stage_progress",
    stage: "render_svg",
    progress: 100,
    message: "late progress",
  });
  await runs.flush();

  assert.equal(db.runRows.get("run-terminal")?.status, "completed");
  assert.ok(db.runRows.get("run-terminal")?.completed_at);
});
