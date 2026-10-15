// Verifies project run API summaries are projected into local history items.
import { describe, expect, it } from "vitest";
import { projectRunSummaryToHistoryItem } from "./project-history";

describe("projectRunSummaryToHistoryItem", () => {
  it("keeps modeling summaries and source links", () => {
    const item = projectRunSummaryToHistoryItem({ runId: "design-one", runKind: "design", status: "completed", createdAt: "2026-10-08", model: "test-model", sourceRunId: "requirements-one" });
    expect(item.id).toBe("design-one");
    expect(item.runKind).toBe("design");
    expect(item.sourceRunId).toBe("requirements-one");
  });
});
