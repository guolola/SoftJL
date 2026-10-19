// Covers persisted visual acceptance and invalidation when the inspected diagram changes.
import { describe, expect, it } from "vitest";
import { createMockWorkspaceRepository } from "./mock-repository";
import { isConfirmedVisualReview } from "../../features/workspace-session/lib/visual-review-message";

const review = { findings: [], status: "pending_review" as const, issues: ["业务条件是否合适需要确认"], reason: "请人工确认", attempts: 3, checkedAt: "check-1" };

describe("visual review acceptance", () => {
  it("never clears structural defects or unreadable checks with a content confirmation", () => {
    for (const issues of [["三个角色与任何用例之间都没有关联线"], ["标签不可读"]]) {
      const structural = { ...review, issues, findings: [{ id: "finding", modelId: "usecase", layer: "model" as const, category: issues[0].includes("标签") ? "check_execution" as const : "model_structure" as const, code: "test", observation: issues[0], evidence: [], verification: "inconclusive" as const, repairable: false }] };
      expect(isConfirmedVisualReview(structural, { ...structural, confirmedAt: "confirmed" })).toBe(false);
    }
  });
  it("never inherits human confirmation when input fingerprints differ even with the same timestamp", () => {
    const current = { ...review, inputFingerprint: "before", confirmedAt: "confirmed" };
    expect(isConfirmedVisualReview({ ...review, inputFingerprint: "after" }, current)).toBe(false);
    expect(isConfirmedVisualReview({ ...review, inputFingerprint: "before" }, current)).toBe(true);
  });
  it("persists acceptance without changing the automated verdict and rejects stale checks", async () => {
    const repository = createMockWorkspaceRepository({ visualReviews: { "requirements:usecase": review } });
    const saved = await repository.confirmVisualReview!("requirements:usecase", "check-1");
    expect(saved.status).toBe("pending_review");
    expect(saved.confirmedAt).toBeTruthy();
    expect((await repository.loadWorkspace()).visualReviews?.["requirements:usecase"]?.confirmedAt).toBe(saved.confirmedAt);
    await expect(repository.confirmVisualReview!("requirements:usecase", "check-2")).rejects.toThrow("视觉检查结果已更新");
    expect(isConfirmedVisualReview({ ...review, checkedAt: "check-2" }, saved)).toBe(false);
  });

  it("invalidates acceptance when a manual rerender replaces the current graph", async () => {
    const repository = createMockWorkspaceRepository({ visualReviews: { "requirements:usecase": review } });
    await repository.confirmVisualReview!("requirements:usecase", "check-1");
    await repository.saveManualModelRerender!("usecase", { status: "rerendered", warning: null, editedAt: "now" }, {
      plantUmlSource: "@startuml\n@enduml",
      svgArtifact: { diagramKind: "usecase", svg: "<svg />", renderMeta: { engine: "test", generatedAt: "later", sourceLength: 18, durationMs: 1 } },
    });
    expect((await repository.loadWorkspace()).visualReviews?.["requirements:usecase"]).toBeUndefined();
  });
});
