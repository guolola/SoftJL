// Verifies project run API summaries are projected into local history items.
import { describe, expect, it } from "vitest";
import { normalizeProjectHistoryResponse, projectRunSummaryToHistoryItem } from "./project-history";
import { createRunSnapshot } from "@test/fixtures/contract-fixtures";

describe("projectRunSummaryToHistoryItem", () => {
  it("rejects obsolete detail snapshots and summaries without current identity or recorded dates", () => {
    const snapshot = createRunSnapshot();
    delete (snapshot as unknown as Record<string, unknown>).outputManifest;
    expect(() => projectRunSummaryToHistoryItem({ runId: "old-run" }, snapshot)).toThrow();
    const summary = { runId: "current-run", operationType: "requirement_modeling" as const, runKind: "requirements", status: "completed", startedAt: "2026-10-23T01:00:00.000Z" };
    expect(projectRunSummaryToHistoryItem(summary)?.snapshot).toBeNull();
    for (const field of ["runId", "operationType", "runKind", "startedAt"]) {
      const obsolete = { ...summary }; delete (obsolete as Record<string, unknown>)[field];
      expect(() => projectRunSummaryToHistoryItem(obsolete)).toThrow();
    }
    for (const payload of [null, {}, { runs: [{ runId: "old-run", status: "completed" }] }])
      expect(() => normalizeProjectHistoryResponse(payload)).toThrow();
  });
  it("keeps modeling summaries and source links", () => {
    const item = projectRunSummaryToHistoryItem({ operationType: "design_modeling" as const, runId: "design-one", runKind: "design", status: "completed", createdAt: "2026-10-08", model: "test-model", sourceRunId: "requirements-one" });
    expect(item.id).toBe("design-one");
    expect(item.runKind).toBe("design");
    expect(item.sourceRunId).toBe("requirements-one");
  });
});
