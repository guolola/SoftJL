// Exercises repair authorization separately from provider observations and candidate validation.
import assert from "node:assert/strict";
import test from "node:test";
import { deriveTableModel, type RequirementBaseline, type DiagramReviewFinding } from "@uml-platform/contracts";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { acceptRepairCandidate, deriveAuthorizedRepairs, verifyReviewClaims, type DiagramReviewBasis, type ReviewModel } from "./diagram-review.js";

function comparatorFixture() {
  const model = modelFixture("requirements", "activity");
  if (model.diagramKind !== "activity") throw new Error("fixture");
  model.nodes.splice(1, 0, { id: "decision", type: "decision", question: "数量边界" });
  model.relationships = [
    { id: "r0", type: "control_flow", sourceId: "start", targetId: "decision" },
    { id: "yes", type: "control_flow", sourceId: "decision", targetId: "work", guard: "数量>10" },
    { id: "no", type: "control_flow", sourceId: "decision", targetId: "end", guard: "数量<=10" },
    { id: "done", type: "control_flow", sourceId: "work", targetId: "end" },
  ];
  const baseline = { requirements: [{ id: "A1", sourceRuleId: "R1", condition: "数量>=10", status: "accepted", fieldProvenance: { condition: { source: "manual", status: "accepted" } } }] } as RequirementBaseline;
  const basis: DiagramReviewBasis = { stage: "requirements", baseline, traceability: [{ ruleId: "R1", mappingSource: "llm", reviewStatus: "confirmed", target: { modelId: "activity", diagramKind: "activity", elementId: "yes" } }] };
  return { model, basis };
}
test("records a confirmed business comparator discrepancy without automatic content changes", () => {
  const { model, basis } = comparatorFixture();
  const authorized = deriveAuthorizedRepairs(model, basis);
  assert.equal(authorized.findings.length, 2);
  assert.equal(authorized.changes.length, 0);
  assert.deepEqual(authorized.expectedModel, model);
  assert.ok(authorized.findings.every((finding) => finding.category === "business_content" && !finding.repairable));
  assert.equal(model.relationships[1]!.guard, "数量>10");
});
test("similarity mappings, heuristic facts, ambiguity and confirmed markers alone never authorize changes", () => {
  for (const mode of ["similar", "old-confirmed-similar", "heuristic", "ambiguous", "missing-trace"] as const) {
    const { model, basis } = comparatorFixture();
    const row = (basis.traceability as any[])[0];
    if (mode === "similar") row.mappingSource = "auto-filled-pending-review";
    if (mode === "old-confirmed-similar") row.rationale = "名称相似度补齐";
    if (mode === "heuristic") basis.baseline!.requirements[0]!.fieldProvenance.condition!.source = "heuristic";
    if (mode === "ambiguous") basis.baseline!.requirements.push({ ...basis.baseline!.requirements[0]!, id: "A2" });
    if (mode === "missing-trace") basis.traceability = [];
    assert.equal(deriveAuthorizedRepairs(model, basis).changes.length, 0, mode);
  }
});
test("opposite polarity and compound branch conditions remain suggestions", () => {
  const { model, basis } = comparatorFixture();
  model.relationships[1]!.guard = "数量<10";
  assert.equal(deriveAuthorizedRepairs(model, basis).changes.length, 0);
  model.relationships[1]!.guard = "数量>10"; model.relationships[2]!.guard = "数量<=10且账户有效";
  assert.equal(deriveAuthorizedRepairs(model, basis).findings.length, 1);
});
test("candidate cannot change business collections, IDs, unrelated fields or pass invalid references", () => {
  const { model, basis } = comparatorFixture(); const authorized = deriveAuthorizedRepairs(model, basis);
  for (const mutate of [(candidate: any) => candidate.nodes.pop(), (candidate: any) => candidate.nodes[0].id = "invented", (candidate: any) => candidate.title = "自由重写", (candidate: any) => candidate.relationships[1].targetId = "missing"]) {
    const candidate = structuredClone(authorized.expectedModel); mutate(candidate);
    assert.throws(() => acceptRepairCandidate(candidate, model, authorized, basis), /越过授权/);
  }
  assert.throws(() => acceptRepairCandidate(model, model, authorized, basis), /没有有效改动/);
});
test("derives table markers and relationship target set only from valid relational constraints", () => {
  const model = modelFixture("design", "table"); if (model.diagramKind !== "table") throw new Error("fixture");
  const basis: DiagramReviewBasis = { stage: "design" }; const repair = deriveAuthorizedRepairs(model, basis);
  assert.deepEqual(repair.expectedModel, JSON.parse(JSON.stringify(deriveTableModel(model))));
  assert.ok(repair.findings.some((item) => item.code === "constraint-relationship"));
  assert.doesNotThrow(() => acceptRepairCandidate(repair.expectedModel, model, repair, basis));
  model.tables[1]!.relationalConstraints!.push({ id: "bad", type: "foreign-key", columnIds: ["order"], referenceTableId: "missing", referenceColumnIds: ["id"] });
  assert.equal(deriveAuthorizedRepairs(model, basis).changes.length, 0);
});
test("explicit package ownership authorizes the contains endpoint but preserves all other edges", () => {
  const model = modelFixture("design", "architecture"); if (model.diagramKind !== "architecture") throw new Error("fixture");
  model.packages.push({ id: "other", name: "其他" }); model.relationships[0]!.sourceId = "other";
  const repair = deriveAuthorizedRepairs(model, { stage: "design" });
  assert.equal(repair.changes.length, 1);
  assert.equal((repair.expectedModel as typeof model).relationships[0]!.sourceId, "p");
});
test("missing, extra, unknown, endpoint/type/direction/ownership guesses cannot authorize model mutation", () => {
  const model = modelFixture("requirements", "usecase") as ReviewModel;
  for (const code of ["missing-node", "extra-node", "unknown-shape", "wrong-endpoint", "wrong-type", "wrong-direction", "wrong-owner", "swimlane", "legend"]) {
    const claim: DiagramReviewFinding = { id: code, modelId: "usecase", layer: "image", code, observation: "观察到标签 X", expected: "guessed", actual: "seen", verification: "verified", repairable: true, evidence: [{ source: "image", reference: "X", detail: "图左侧" }] };
    const checked = verifyReviewClaims([claim], model, { stage: "requirements" })[0]!;
    assert.equal(checked.repairable, false); assert.notEqual(checked.verification, "verified");
    assert.match(checked.evidence[0]!.source, /provider-observation/);
  }
  const checked = verifyReviewClaims([{ id: "layout", modelId: "usecase", layer: "image", code: "layout", observation: "标签遮挡，无法辨认", verification: "verified", repairable: true, evidence: [] }], model, undefined)[0]!;
  assert.equal(checked.verification, "inconclusive"); assert.equal(checked.repairable, false);
});
