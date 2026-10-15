// Verifies legacy review compatibility and durable structural repair records.
import assert from "node:assert/strict";
import test from "node:test";
import { diagramReviewFindingSchema, diagramVisualReviewSchema, classifyDiagramReviewIssue, isExcludedDiagramReviewIssue } from "./visual-review.js";

const legacy = { status: "pending_review", issues: ["标签待确认"], reason: "待确认", attempts: 1, checkedAt: "check-1" };

test("historical image reviews remain readable without new fields", () => {
  assert.deepEqual(diagramVisualReviewSchema.parse(legacy), legacy);
});

test("optional categories survive replay and unsupported values fail validation", () => {
  const finding = { id: "f", layer: "model", code: "constraint-marker", modelId: "table", observation: "外键标记错误", verification: "verified", evidence: [], repairable: true };
  assert.equal(diagramReviewFindingSchema.parse(finding).category, undefined);
  for (const category of ["model_structure", "business_constraint", "render_mismatch", "check_execution", "other"]) assert.equal(diagramReviewFindingSchema.parse({ ...finding, category }).category, category);
  assert.equal(diagramReviewFindingSchema.safeParse({ ...finding, category: "layout" }).success, false);
});

test("layout preferences are excluded but structural errors and uncertain evidence survive", () => {
  for (const text of ["连线交叉", "位置不正确", "节点间距太大", "连线绕行", "标签遮挡", "字体太小", "分支条件文字遮挡", "关系端点间距不足", "外键标签位置不正确", "Font is too small", "Wrong layout"]) assert.equal(isExcludedDiagramReviewIssue(text), true, text);
  for (const text of ["连线缺失且交叉", "关系归属错误", "标签内容与模型不一致", "标签不可辨认", "关系端点错误且标签重叠", "分支条件不符且连线交叉"]) assert.equal(isExcludedDiagramReviewIssue(text), false, text);
  assert.equal(classifyDiagramReviewIssue("标签不可辨认", "image"), "check_execution");
  assert.equal(classifyDiagramReviewIssue("", "model", "wrong-endpoint"), "model_structure");
  assert.equal(classifyDiagramReviewIssue("", "image", "wrong-direction"), "render_mismatch");
  assert.equal(classifyDiagramReviewIssue("", "model", "confirmed-comparator"), "business_constraint");
  assert.equal(classifyDiagramReviewIssue("方向相反", "image"), "render_mismatch");
  assert.equal(classifyDiagramReviewIssue("分支的条件错误", "model"), "business_constraint");
  assert.equal(classifyDiagramReviewIssue("三个角色与任何用例之间都没有关联线"), "model_structure");
});

test("review replay retains evidence, shared repair rounds, outcome and input fingerprint", () => {
  const review = { ...legacy, repairAttempts: 1, structureAttempts: 2, checkOutcome: "inconclusive", inputFingerprint: "input-1", stopReason: "标签无法辨认",
    findings: [{ id: "unknown", layer: "image", code: "unknown-shape", modelId: "model-1", observation: "图右侧标签无法辨认", evidence: [{ source: "image", reference: "右侧", detail: "图片观察" }], verification: "inconclusive", repairable: false }],
    repairHistory: [{ round: 1, target: "model", issueIds: ["boundary"], callId: "call-1", beforeFingerprint: "before", afterFingerprint: "after", status: "accepted", changes: ["恢复比较符"], reason: "已确认字段" }],
  };
  assert.deepEqual(diagramVisualReviewSchema.parse(JSON.parse(JSON.stringify(review))), review);
  assert.equal(diagramVisualReviewSchema.safeParse({ ...review, repairHistory: [{ ...review.repairHistory[0], round: 3 }] }).success, false);
  assert.equal(diagramVisualReviewSchema.safeParse({ ...review, findings: [{ ...review.findings[0], observation: "" }] }).success, false);
});
