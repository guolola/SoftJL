// Verifies structured categories, duplicate evidence and truthful repair attribution.
import { describe, expect, it } from "vitest";
import type { DiagramReviewFinding, DiagramVisualReview } from "@uml-platform/contracts";
import { reviewProblemGroups, reviewProblemTreatment } from "./review-presentation";

const review: DiagramVisualReview = { status: "pending_review", issues: [], findings: [], reason: "待确认", attempts: 1, checkedAt: "now" };
const finding = (id: string, category: DiagramReviewFinding["category"], observation: string): DiagramReviewFinding => ({
  id, modelId: "model", layer: "model", category, code: "review-finding", observation, verification: "unverified", repairable: false, evidence: [],
});
describe("review presentation", () => {
  it("uses explicit finding categories without projecting issue prose", () => {
    const current = { ...review, issues: ["连线缺失"], findings: [finding("content", "business_content", "其他建议"), finding("render", "render_mismatch", "连线缺失且交叉"), finding("execution", "check_execution", "标签不可辨认")] };
    const before = JSON.stringify(current);
    const groups = reviewProblemGroups(current);
    expect(groups.map(group => group.category)).toEqual(["business_content", "render_mismatch", "check_execution"]);
    expect(groups.flatMap(group => group.items)).toHaveLength(3);
    expect(JSON.stringify(current)).toBe(before);
    expect(reviewProblemGroups({ ...review, issues: ["连线缺失"] })).toEqual([]);
  });
  it("deduplicates structured findings and prefers service-verified evidence", () => {
    const item = finding("one", "business_constraint", "外键标记错误");
    const groups = reviewProblemGroups({ ...review, issues: ["外键标记错误。"], findings: [item, { ...item, id: "two", verification: "verified", repairable: true }] });
    expect(groups).toHaveLength(1); expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].finding?.id).toBe("two");
  });
  it("associates repairs by finding ID without claiming a rejected candidate was fixed", () => {
    const item = { ...finding("boundary", "model_structure", "比较符错误"), verification: "verified" as const, repairable: true };
    const result = { ...review, findings: [item], repairHistory: [{ round: 1, target: "model" as const, issueIds: [item.id], beforeFingerprint: "before", status: "rejected" as const, changes: [], reason: "候选越界" }] };
    expect(reviewProblemTreatment(reviewProblemGroups(result)[0].items[0], result)).toContain("已拒绝 · 候选越界");
  });
  it("keeps execution failure visible without inventing business defects", () => {
    expect(reviewProblemGroups({ ...review, checkOutcome: "not_completed" })[0]).toMatchObject({ category: "check_execution", items: [{ observation: "检查未完成", verification: "inconclusive" }] });
    expect(reviewProblemGroups({ ...review, checkOutcome: "skipped" })).toEqual([]);
    expect(reviewProblemGroups({ ...review, checkOutcome: "inconclusive", findings: [finding("layout", "other", "连线交叉")] })).toEqual([]);
  });
});
