// Verifies queued workers accept recorded events only after current-contract validation.
import assert from "node:assert/strict";
import test from "node:test";
import { reviveQueuedRunRecord, type QueuedRunJob } from "./run-queue.js";
import { createEmptySnapshot } from "../records/snapshots.js";

test("queued records preserve current event metadata and reject obsolete events", () => {
  const event = { type: "queued" as const, eventId: "queued", createdAt: "2026-10-18T00:00:00.000Z" };
  const job: QueuedRunJob = {
    runId: "run", record: {
      snapshot: createEmptySnapshot("run", "需求", []), events: [event], terminal: false,
    },
  };
  assert.deepEqual(reviveQueuedRunRecord(job).events, [event]);
  for (const field of ["eventId", "createdAt"]) {
    const obsolete: Record<string, unknown> = { ...event };
    delete obsolete[field];
    const before = structuredClone(obsolete);
    job.record.events = [obsolete] as never;
    assert.throws(() => reviveQueuedRunRecord(job));
    assert.deepEqual(obsolete, before);
  }
});
