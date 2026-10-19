// Verifies API baselines snapshot rules without regex guesses or automatic confirmation.
import assert from "node:assert/strict";
import test from "node:test";
import { buildRequirementBaseline, buildEmptyRequirementBaseline, assertRequirementBaselineAllowsDownstream, reconcileExtractedRuleIds } from "./requirement-baseline.js";

const input = { requirementText: "学生登录", rules: [{ id: "r1", type: "functional" as const, text: "系统必须校验学生的登录状态。", sourceFragment: "学生登录",  }] };

test("unchanged content preserves baseline identity across runs", () => {
  const baseline = buildRequirementBaseline({ ...input, runId: "extraction" });
  assert.deepEqual(buildRequirementBaseline({ ...input, runId: "retry", previousBaseline: baseline }), baseline);
  const changed = buildRequirementBaseline({ ...input, runId: "changed", previousBaseline: baseline, rules: [{ ...input.rules[0]!, text: "学生只能查看自己的成绩。" }] });
  assert.equal(changed.version, 2);
  assert.notEqual(changed.id, baseline.id);
  assert.equal(changed.rules?.[0]?.requirementId, baseline.rules?.[0]?.requirementId);
  assert.equal(baseline.rules?.[0]?.text, input.rules[0]!.text);
});

test("baseline stores rules and original sources without extracting actors or inventing outcomes", () => {
  const baseline = buildRequirementBaseline({ ...input, runId: "rules" });
  assert.equal(baseline.rules?.[0]?.text, input.rules[0]!.text);
  assert.equal(baseline.rules?.[0]?.sourceFragment, "学生登录");
  assert.equal("requirements" in baseline, false);
  assert.doesNotMatch(JSON.stringify(baseline), /fieldProvenance|系统满足该需求|"actor"|"accepted"/);
  assert.doesNotThrow(() => assertRequirementBaselineAllowsDownstream(baseline));
  assert.throws(() => assertRequirementBaselineAllowsDownstream(null), /missing/);
});

test("duplicate rule ids do not share snapshot trace identities", () => {
  const baseline = buildRequirementBaseline({ ...input, runId: "duplicate", rules: [input.rules[0]!, input.rules[0]!] });
  assert.deepEqual(baseline.rules?.map((rule) => rule.id), ["r1", "r1-2"]);
  assert.equal(new Set(baseline.rules?.map((rule) => rule.requirementId)).size, 2);
});

test("empty baselines contain no inferred facts", () => {
  const baseline = buildEmptyRequirementBaseline({ runId: "empty" });
  assert.deepEqual(baseline.rules, []);
  assert.equal("requirements" in baseline, false);
});

test("re-extraction preserves identities through reorder and assigns fresh IDs to changed or added rules", () => {
  const first = input.rules[0]!;
  const second = { ...first, id: "r2", text: "学生只能查看自己的成绩。" };
  const previous = buildRequirementBaseline({ ...input, runId: "old", rules: [first, second] });
  const reordered = reconcileExtractedRuleIds([{ ...second, id: "r1" }, { ...first, id: "r2" }], previous, "again");
  assert.deepEqual(reordered.map(rule => rule.id), ["r2", "r1"]);
  const baseline = buildRequirementBaseline({ ...input, runId: "again", rules: reordered, previousBaseline: previous });
  assert.deepEqual(baseline.rules?.map(rule => rule.requirementId), ["REQ-002", "REQ-001"]);
  const changed = reconcileExtractedRuleIds([{ ...first, text: "管理员可以查看全部成绩。" }, { ...second, id: "r2" }], previous, "changed");
  assert.notEqual(changed[0]?.id, "r1");
  assert.equal(changed[1]?.id, "r2");
  assert.deepEqual(reconcileExtractedRuleIds([first], null, "initial"), [first]);
  assert.deepEqual(reconcileExtractedRuleIds([second], previous, "delete"), [second]);
  const empty = buildRequirementBaseline({ ...input, runId: "delete-all", rules: [], previousBaseline: previous });
  assert.notEqual(reconcileExtractedRuleIds([first], empty, "restore")[0]?.id, "r1");
});

test("ambiguous duplicate content never reuses a prior rule identity", () => {
  const first = input.rules[0]!;
  const previous = buildRequirementBaseline({ ...input, runId: "old" });
  const duplicated = reconcileExtractedRuleIds([first, { ...first, id: "r2" }], previous, "duplicates");
  assert.equal(new Set(duplicated.map(rule => rule.id)).size, 2);
  assert.ok(duplicated.every(rule => rule.id !== "r1"));
  const ambiguous = buildRequirementBaseline({ ...input, runId: "old-duplicates", rules: [first, { ...first, id: "r2" }] });
  assert.notEqual(reconcileExtractedRuleIds([first], ambiguous, "single")[0]?.id, "r1");
});
