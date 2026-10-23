// Round-trips current run fixtures through JSON without exposing a production snapshot-store format.
import { assertCurrentRunSnapshot, runEventSchema } from "@uml-platform/contracts";
import { createRunRecordStore, type RunRecordStore } from "../../../src/runs/records/run-record-store.js";

export function roundTripRunRecordStore(source: RunRecordStore) {
  const restored = createRunRecordStore();
  for (const [id, record] of source) {
    const { snapshot, events, eventCreatedAt, terminal, metadata } = JSON.parse(JSON.stringify({
      snapshot: record.snapshot, events: record.events, eventCreatedAt: record.eventCreatedAt,
      terminal: record.terminal, metadata: record.metadata,
    }));
    assertCurrentRunSnapshot(snapshot);
    restored.set(id, {
      snapshot, events: events.map((event: unknown) => runEventSchema.parse(event)),
      eventCreatedAt, terminal, metadata, listeners: new Set(),
      documentBuffer: record.documentBuffer ? Buffer.from(record.documentBuffer) : undefined,
    });
  }
  return restored;
}
