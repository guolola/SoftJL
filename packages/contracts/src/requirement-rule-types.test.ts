// Protects the simplified storage contract and every entry of the fixed model routing matrix.
import assert from "node:assert/strict";
import test from "node:test";
import { requirementRuleSchema, extractedRequirementsSchema, requirementBaselineSchema } from "./requirements.js";
import { requirementModelsForType, REQUIREMENT_MODEL_RULE_TYPES, requirementRuleTypeSchema } from "./requirement-rule-types.js";
import { candidateRulesForDiagram } from "./requirement-model-inputs.js";
import { createRequirementBaselineSnapshot } from "./requirement-baseline-snapshot.js";

const rule = { id: "r1", type: "data" as const, text: "预约记录包含学生和座位编号" };
test("manual rules require only identity, type and text; obsolete attributes are rejected", () => {
  assert.deepEqual(requirementRuleSchema.parse(rule), rule);
  for (const field of ["classification", "topics", "subtype", "scopes", "lifecycle", "acceptanceCriteria", "participantIds", "goalIds", "assumptionIds", "status", "relatedDiagrams"]) {
    assert.equal(requirementRuleSchema.safeParse({ ...rule, [field]: [] }).success, false, field);
  }
  assert.equal(requirementRuleSchema.safeParse({ ...rule, type: "constraint" }).success, false);
  assert.equal(extractedRequirementsSchema.safeParse({ rules: [rule] }).success, false);
  assert.equal(extractedRequirementsSchema.safeParse({ rules: [{ ...rule, sourceFragment: rule.text }] }).success, true);
  assert.equal(extractedRequirementsSchema.safeParse({ rules: [], context: {} }).success, false);
});

test("all eight types route to the agreed model sets, independently of rule wording", () => {
  const expected = {
    functional: ["function", "activity", "usecase", "prototype", "analysis"],
    "business-rule": ["activity", "usecase", "class", "analysis"],
    data: ["usecase", "class", "analysis"],
    interaction: ["prototype"],
    interface: ["activity", "usecase", "deployment", "analysis"],
    exception: ["activity", "usecase", "analysis"],
    quality: ["usecase", "prototype", "deployment", "analysis"],
    operations: ["deployment"],
  };
  for (const type of requirementRuleTypeSchema.options) {
    assert.deepEqual(requirementModelsForType(type), expected[type]);
    for (const diagram of Object.keys(REQUIREMENT_MODEL_RULE_TYPES) as (keyof typeof REQUIREMENT_MODEL_RULE_TYPES)[]) {
      const input = [{ ...rule, type, text: "文案不决定模型归属" }];
      const expectedMember = (REQUIREMENT_MODEL_RULE_TYPES[diagram] as readonly string[]).includes(type);
      assert.equal(candidateRulesForDiagram(input, diagram).length, Number(expectedMember), `${type}/${diagram}`);
    }
  }
});

test("snapshots keep source evidence optional and reject previous baseline versions", () => {
  const baseline = createRequirementBaselineSnapshot({ runId: "manual", requirementText: "预约系统", rules: [rule], origin: "manual" });
  assert.equal(baseline.rules[0].sourceFragment, undefined);
  assert.equal(baseline.schemaVersion, 3);
  assert.equal(requirementBaselineSchema.safeParse({ ...baseline, schemaVersion: 2 }).success, false);
});
