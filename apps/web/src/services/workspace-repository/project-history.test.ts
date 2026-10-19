// Verifies project run API summaries are projected into local history items.
import { describe, expect, it } from "vitest";
import { projectRunSummaryToHistoryItem } from "./project-history";
import { createRunSnapshot } from "@/test/contract-fixtures";

describe("projectRunSummaryToHistoryItem", () => {
  it("keeps summaries available while rejecting obsolete detail snapshots", () => {
    const snapshot = createRunSnapshot();
    delete (snapshot as unknown as Record<string, unknown>).outputManifest;
    expect(() => projectRunSummaryToHistoryItem({ runId: "old-run" }, snapshot)).toThrow();
    expect(projectRunSummaryToHistoryItem({ runId: "old-run", status: "completed" })?.snapshot).toBeNull();
  });
  it("keeps modeling summaries and source links", () => {
    const item = projectRunSummaryToHistoryItem({ operationType: "design_modeling" as const, runId: "design-one", runKind: "design", status: "completed", createdAt: "2026-10-08", model: "test-model", sourceRunId: "requirements-one" });
    expect(item.id).toBe("design-one");
    expect(item.runKind).toBe("design");
    expect(item.sourceRunId).toBe("requirements-one");
  });
});
