// Keeps replayable conversation events separate from truncated diagnostics and ignores duplicate delivery.
import type { RunEventInput } from "@uml-platform/contracts";

export function appendTranscriptEvent<T extends RunEventInput>(events: T[], event: T): T[] {
  return mergeTranscriptEvents(events, [event]);
}

export function mergeTranscriptEvents<T extends RunEventInput>(events: T[], incoming: T[]) {
  if (!incoming.length || events.some((item) => ["completed", "failed", "cancelled"].includes(item.type))) return events;
  const seen = new Set(events.flatMap((event) => event.eventId ? [event.eventId] : []));
  const activityStages = new Set(events.flatMap((event) => event.type === "run_activity" ? [event.stage] : []));
  let merged = events;
  // Bulk restoration must remain linear; copying and scanning the entire history per event freezes large runs.
  for (const event of incoming) {
    if (event.eventId && seen.has(event.eventId)) continue;
    if (event.type === "llm_chunk" && activityStages.has(event.stage)) continue;
    if (merged === events) merged = [...events];
    merged.push(event);
    if (event.eventId) seen.add(event.eventId);
    if (event.type === "run_activity") activityStages.add(event.stage);
    if (["completed", "failed", "cancelled"].includes(event.type)) break;
  }
  return merged;
}

export function progressTranscriptEvents<T extends RunEventInput>(events: T[]): T[] {
  return events.flatMap((event): T[] => {
    if (event.type === "llm_chunk") return [];
    if (event.type !== "run_activity") return [event];
    if (["reasoning", "summary", "output"].includes(event.phase)) return [];
    const { text: _text, inputImages: _images, ...progress } = event;
    // Only optional content fields are removed; the event identity and lifecycle payload stay intact.
    return [progress as T];
  });
}

// One accumulator owns a reconnecting subscription. Its indexes grow with new
// progress only, so replay never rescans accumulated history or retains text.
export function createProgressTranscriptAccumulator<T extends RunEventInput>() {
  const ids = new Set<string>();
  const events: T[] = [];
  let terminal = false;
  return (incoming: T[]) => {
    let changed = false;
    for (const event of progressTranscriptEvents(incoming)) {
      if (terminal) break;
      if (event.eventId && ids.has(event.eventId)) continue;
      if (event.eventId) ids.add(event.eventId);
      events.push(event);
      changed = true;
      terminal = ["completed", "failed", "cancelled"].includes(event.type);
    }
    return changed ? [...events] : null;
  };
}
