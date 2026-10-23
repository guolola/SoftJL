// Verifies current history error summaries keep internal diagnostics out of the UI.
import { describe, expect, it } from "vitest";
import { formatRunHistoryDiagramErrorSummary } from "./index";

describe("formatRunHistoryDiagramErrorSummary", () => {
  it("keeps internal stages and scoped identifiers out of historical error summaries", () => {
    const summary = formatRunHistoryDiagramErrorSummary([
      { diagramId: "sequence:UC-DIAL", stage: "generate_design_sequence", error: { code: "PLATFORM_PROVIDER_UNAVAILABLE", category: "platform_provider", retryable: true, message: "private payload" }, message: "private payload" },
    ], { design: true });
    expect(summary).toContain("用例实现设计（当前模型服务暂不可用，请稍后重试。）");
    expect(summary).not.toMatch(/generate_design_sequence|PLATFORM_PROVIDER_UNAVAILABLE|sequence:UC-DIAL|private payload/);
  });
});
