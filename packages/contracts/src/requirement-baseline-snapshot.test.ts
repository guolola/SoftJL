// Verifies rule snapshots preserve facts, identity, edit provenance and complete prompt inputs.
import assert from "node:assert/strict";
import test from "node:test";
import { createRequirementBaselineSnapshot, requirementBaselinePromptContext } from "./requirement-baseline-snapshot.js";
import { requirementBaselineSchema, type RequirementRule } from "./requirements.js";
import { reuseRequirementBaseline } from "./requirement-baseline-identity.js";

const rule: RequirementRule = { id: "r1", type: "functional" as const, text: "系统必须校验学生的登录状态。", sourceFragment: "校验学生登录",  };
const build = (rules = [rule]) => createRequirementBaselineSnapshot({ runId: "extract", requirementText: "校验学生登录", rules, createdAt: "2026-10-17T00:00:00Z" });

test("snapshots keep the complete rule without fabricated semantic or review fields", () => {
  const baseline = build();
  assert.equal(baseline.version, 1);
  assert.equal("requirements" in baseline, false);
  assert.equal(baseline.rules?.[0]?.text, rule.text);
  assert.equal(baseline.rules?.[0]?.sourceFragment, rule.sourceFragment);
  assert.equal(baseline.rules?.[0]?.origin, "generated");
  assert.doesNotMatch(JSON.stringify(baseline), /fieldProvenance|系统满足该需求|"accepted"|"confidence"/);
  assert.deepEqual(requirementBaselineSchema.parse(baseline), baseline);
});

test("manual add, edit, delete and no-op saves preserve identities and immutable versions", () => {
  const original = build();
  const addedRule = { ...rule, id: "r2", text: "管理员可以导出成绩。", sourceFragment: undefined };
  const added = createRequirementBaselineSnapshot({ runId: "extract", requirementText: "校验学生登录", rules: [rule, addedRule], origin: "manual", previousBaseline: original });
  assert.equal(added.version, 2);
  assert.equal(added.rules?.[0]?.origin, "generated");
  assert.equal(added.rules?.[1]?.origin, "manual-added");
  const edited = createRequirementBaselineSnapshot({ runId: "extract", requirementText: "校验学生登录", rules: [{ ...rule, text: "学生只能查询自己的成绩。" }, addedRule], origin: "manual", previousBaseline: added });
  assert.equal(edited.version, 3);
  assert.notEqual(edited.id, added.id);
  assert.equal(edited.rules?.[0]?.requirementId, original.rules?.[0]?.requirementId);
  assert.equal(edited.rules?.[0]?.origin, "manual-edited");
  assert.equal(added.rules?.[0]?.text, rule.text);
  const same = createRequirementBaselineSnapshot({ runId: "model-run", requirementText: "校验学生登录", rules: edited.rules!, previousBaseline: edited });
  assert.deepEqual(same, edited);
  assert.notEqual(same, edited);
  const deleted = createRequirementBaselineSnapshot({ runId: "extract", requirementText: "校验学生登录", rules: [addedRule], origin: "manual", previousBaseline: edited });
  assert.equal(deleted.rules?.[0]?.requirementId, added.rules?.[1]?.requirementId);
  assert.equal(deleted.version, 4);
});

test("large design context keeps every rule and final constraints without truncation", () => {
  const rules = Array.from({ length: 80 }, (_, index) => ({ ...rule, id: `r${index + 1}`, text: `规则${index + 1}：${"完整业务约束；".repeat(70)}` }));
  rules[79] = { ...rules[79]!, type: "quality" as const, text: "尾部约束：服务必须部署在校内网络，响应时间不超过2秒。" };
  const baseline = build(rules);
  const design = requirementBaselinePromptContext(baseline);
  assert.equal(design.rules?.length, 80);
  assert.ok(JSON.stringify(design).length > 24000);
  assert.match(JSON.stringify(design), /尾部约束/);
  assert.deepEqual(requirementBaselinePromptContext(baseline, true), {});
});

test("filtered diagram rules retain the other baseline constraints and corrupt equal-hash snapshots rebuild", () => {
  const second = { ...rule, id: "r2", type: "quality" as const, text: "所有响应必须低于2秒。" };
  const original = build([rule, second]);
  const context = requirementBaselinePromptContext(original, [rule.id]);
  assert.deepEqual(context.rules?.map(item => item.id), ["r2"]);
  const incomplete = structuredClone(original);
  incomplete.rules = incomplete.rules!.slice(0, 1);
  const rebuilt = createRequirementBaselineSnapshot({ runId: "restore", requirementText: "校验学生登录", rules: [rule, second], previousBaseline: incomplete });
  assert.equal(rebuilt.rules?.length, 2);
  assert.equal(reuseRequirementBaseline(incomplete, rebuilt).rules?.length, 2);
  const edited = createRequirementBaselineSnapshot({ runId: "edit", requirementText: "校验学生登录", rules: [{ ...rule, text: "新版规则" }, second], previousBaseline: original });
  const reverted = createRequirementBaselineSnapshot({ runId: "revert", requirementText: "校验学生登录", rules: [rule, second], previousBaseline: edited });
  assert.deepEqual(reverted.rules?.map(item => item.text), [rule.text, second.text]);
  assert.equal(reverted.rules?.[0]?.requirementId, original.rules?.[0]?.requirementId);
});

test("rejects old baseline storage instead of migrating it", () => {
  const { rules: _rules, schemaVersion: _version, ...rest } = build();
  assert.equal(requirementBaselineSchema.safeParse({ ...rest, requirements: [] }).success, false);
  for (const field of ["id", "version", "sourceInputFingerprint"] as const) {
    const incomplete: Record<string, unknown> = { ...build() };
    delete incomplete[field];
    assert.equal(requirementBaselineSchema.safeParse(incomplete).success, false, field);
  }
});

test("type edits create a new snapshot and no removed context is persisted", () => {
  const previous = build();
  const next = createRequirementBaselineSnapshot({ runId: "types", requirementText: "校验学生登录", rules: [{ ...rule, type: "data" }], previousBaseline: previous });
  assert.equal(reuseRequirementBaseline(previous, next), next);
  assert.equal(next.rules[0].type, "data");
  assert.equal("context" in next, false);
});

test("updated quality facts are retained even when the source rules are unchanged", () => {
  const current = build();
  const incoming = structuredClone(current);
  incoming.qualityReport = { ...incoming.qualityReport, status: "pending-review", summary: "需要确认业务范围" };
  assert.equal(reuseRequirementBaseline(current, incoming), incoming);
  const anotherRun = structuredClone(current);
  anotherRun.runId = "models-run";
  anotherRun.qualityReport.runId = "models-run";
  assert.equal(reuseRequirementBaseline(current, anotherRun), current);
});
