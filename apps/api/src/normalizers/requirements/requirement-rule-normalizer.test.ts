// Verifies canonical extraction rejects obsolete shapes without guessing classifications.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRequirementRulesResult } from "./requirement-rule-normalizer.js";
const rule = { id: "r1", text: "用户提交预约", sourceFragment: "用户提交预约", type: "functional" as const };
test("preserves supplied semantics and exposes no association metadata", () => {
  const result = normalizeRequirementRulesResult({ rules: [rule] });
  assert.deepEqual(result.rules, [rule]);
  assert.deepEqual(Object.keys(result.rules[0]!).sort(), ["id", "sourceFragment", "text", "type"]);
  assert.equal("relatedDiagrams" in result.rules[0]!, false);
});
test("rejects old category aliases, top-level arrays and incomplete classifications", () => {
  for (const raw of [[rule], { rules: [{ ...rule, sourceFragment: undefined }] }, { rules: [{ id: "r1", text: rule.text, sourceFragment: rule.text, category: "功能需求" }] }, { rules: [{ ...rule, classification: { kind: "functional" } }] }]) {
    assert.throws(() => normalizeRequirementRulesResult(raw));
  }
});

test("missing labeled facts must be repaired by the model instead of manufactured", () => {
  assert.throws(() => normalizeRequirementRulesResult({ rules: [rule] }, "[R-2] 管理员导出订单"), /R-2/);
  assert.equal(normalizeRequirementRulesResult({ rules: [rule] }, "[R-1] 用户提交预约").rules[0]!.sourceFragment, "[R-1] 用户提交预约");
});
