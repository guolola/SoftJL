// Regresses exact evidence, complete source coverage and critical fact preservation without candidate mutation.
import assert from "node:assert/strict";
import test from "node:test";
import { validateRequirementRules, RequirementRuleValidationError } from "./requirement-rule-normalizer.js";
import { splitRequirementInput } from "./requirement-source-units.js";
const rule = (text: string, sourceFragment = text, id = "r1") => ({ id, text, sourceFragment, type: "business-rule" as const });
function validate(sourceText: string, rules: unknown[], units = splitRequirementInput(sourceText)) {
  return validateRequirementRules({ rules }, { sourceText, units });
}
function codes(action: () => unknown) {
  try { action(); assert.fail("expected invalid candidate"); } catch (error) {
    assert.ok(error instanceof RequirementRuleValidationError);
    return error.diagnostics.map(issue => issue.code);
  }
}

test("requires canonical fields, unique IDs and a nonempty complete collection", () => {
  const source = "用户提交预约。";
  for (const raw of [[rule(source)], { rules: [] }, { rules: [{ ...rule(source), sourceFragment: undefined }] },
    { rules: [{ ...rule(source), category: "功能需求" }] }, { rules: [{ ...rule(source), classification: { kind: "functional" } }] }]) {
    assert.throws(() => validateRequirementRules(raw, { sourceText: source, units: splitRequirementInput(source) }));
  }
  assert.ok(codes(() => validate(source, [rule(source), rule(source, source, " R1 ")])).includes("rule-id-duplicate"));
});

test("retains exact minimal fragments, marked spacing and candidate IDs without automatic rewriting", () => {
  const source = "[R-1]   用户提交预约。", candidate = rule("用户提交预约。", "用户提交预约");
  const before = structuredClone(candidate);
  assert.deepEqual(validate(source, [candidate]).rules[0], before);
  assert.deepEqual(candidate, before);
  assert.ok(codes(() => validate(source, [rule(source, "不存在")])).includes("source-fragment-invalid"));
});

test("rejects omitted ordinary and confirmed requirements, even when other valid citations exist", () => {
  const a = "学生预约座位。", b = "管理员导出报表。";
  assert.ok(codes(() => validate(a + b, [rule(a)])).includes("source-unit-missing"));
  assert.ok(codes(() => validate(a + "[CONFIRMED-B03] " + b, [rule(a)])).includes("source-unit-missing"));
  assert.ok(codes(() => validate("[R-2] " + b, [])).includes("source-unit-missing"));
});

test("rejects changed inclusive thresholds, invented units and omitted negation", () => {
  const source = "报销总额达到5000元（包含正好5000元）时必须由直属经理审批。";
  assert.doesNotThrow(() => validate(source, [rule("报销总额达到5000元时由直属经理审批。", source)]));
  assert.ok(codes(() => validate(source, [rule("报销总额超过5000元时由直属经理审批。", source)])).includes("source-fact-changed"));
  assert.ok(codes(() => validate("学生不得删除已发布记录。", [rule("学生删除已发布记录。", "学生不得删除已发布记录。")])).includes("source-facts-missing"));
  assert.ok(codes(() => validate("查询应在2秒内完成。", [rule("查询应在2毫秒内完成。", "查询应在2秒内完成。")])).includes("source-fact-changed"));
});

test("split rules preserve one source unit's facts jointly instead of duplicating all clauses", () => {
  const source = "同一学生最多一笔预约，同时预约记录保留30天。";
  const result = validate(source, [rule("同一学生最多一笔预约。", source), rule("预约记录保留30天。", source, "r2")]);
  assert.equal(result.rules.length, 2);
});

test("excluded spans and pending source units cannot be used as confirmed rule evidence", () => {
  const a = "用户预约座位。", ignored = "无关说明。", b = "管理员导出报表。";
  const source = a + ignored + b;
  const units = splitRequirementInput(source).filter(unit => unit.text !== ignored);
  assert.ok(codes(() => validate(source, [rule(a), rule(ignored), rule(b, b, "r3")], units)).includes("source-fragment-invalid"));
  assert.ok(codes(() => validate(source, [rule(a + b, a + b)], units)).includes("source-fragment-invalid"));
  const pending = "[PENDING-P1] 学生可在线支付。管理员可以退款。";
  assert.ok(codes(() => validate(pending, [rule("管理员可以退款。", "管理员可以退款。")])).includes("source-pending"));
});

test("ambiguous fragments need wider evidence while accepted rules keep their content without quality reports", () => {
  const source = "学生可查看记录。教师可查看记录。";
  assert.ok(codes(() => validate(source, [rule("学生可查看记录。", "可查看记录")])).includes("source-fragment-ambiguous"));
  const quality = "95%的查询在2秒内完成。";
  const candidate = { ...rule(quality), type: "functional" as const };
  const result = validate(quality, [candidate, { ...candidate, id: "r2" }]);
  assert.deepEqual(Object.keys(result), ["rules"]);
  assert.deepEqual(result.rules, [candidate, { ...candidate, id: "r2" }]);
  const compound = "用户查询记录，同时导出报表。";
  assert.deepEqual(validate(compound, [rule(compound)]), { rules: [rule(compound)] });
});
