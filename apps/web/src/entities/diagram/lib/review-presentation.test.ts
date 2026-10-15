// Checks safe historical classification, duplicate merging and truthful repair attribution.
import { describe, expect, it } from "vitest";
import type { DiagramVisualReview } from "@uml-platform/contracts";
import { reviewProblemGroups, reviewProblemTreatment } from "./review-presentation";

const review: DiagramVisualReview = { status: "pending_review", issues: [], reason: "待确认", attempts: 1, checkedAt: "now" };
describe("review presentation", () => {
  it("filters layout-only history, retains mixed structural errors and leaves unknown text unverified", () => {
    const old = { ...review, issues: ["连线交叉", "节点间距太大；连线缺失且交叉", "其他建议", "其他建议", "标签不可辨认"] };
    const before = JSON.stringify(old);
    const groups = reviewProblemGroups(old);
    expect(groups.map((group) => group.category)).toEqual(["business_content", "render_mismatch", "check_execution"]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(3);
    expect(groups[0].items[0]).toMatchObject({ verification: "unverified", inferred: true });
    expect(JSON.stringify(old)).toBe(before);
  });
  it("merges plain text with structured findings and prefers service-verified evidence", () => {
    const finding = { id: "one", modelId: "model", layer: "model" as const, category: "business_constraint" as const, code: "constraint-marker", observation: "外键标记错误", verification: "unverified" as const, repairable: false, evidence: [] };
    const groups = reviewProblemGroups({ ...review, issues: ["外键标记错误。"], findings: [finding, { ...finding, id: "two", verification: "verified", repairable: true }] });
    expect(groups).toHaveLength(1); expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].finding?.id).toBe("two");
  });
  it("associates actual repair records by finding ID without claiming a rejected candidate was fixed", () => {
    const finding = { id: "boundary", modelId: "model", layer: "model" as const, code: "confirmed-comparator", observation: "比较符错误", verification: "verified" as const, repairable: true, evidence: [] };
    const result = { ...review, findings: [finding], repairHistory: [{ round: 1, target: "model" as const, issueIds: [finding.id], beforeFingerprint: "before", status: "rejected" as const, changes: [], reason: "候选越界" }] };
    expect(reviewProblemTreatment(reviewProblemGroups(result)[0].items[0], result)).toContain("已拒绝 · 候选越界");
  });
  it("keeps execution failure visible even when no problem text was returned", () => {
    expect(reviewProblemGroups({ ...review, checkOutcome: "not_completed" })[0]).toMatchObject({ category: "check_execution", items: [{ observation: "检查未完成", verification: "inconclusive" }] });
    expect(reviewProblemGroups({ ...review, checkOutcome: "skipped" })).toEqual([]);
    expect(reviewProblemGroups({ ...review, checkOutcome: "inconclusive", issues: ["连线交叉"] })).toEqual([]);
  });
});
