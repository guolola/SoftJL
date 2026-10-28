// Validates complete extracted rules against exact task-bound evidence without rewriting candidates.
import { extractedRequirementsSchema, extractProtectedRequirementFacts, type RequirementRule } from "@uml-platform/contracts";
import { repairDiagnostics, type RepairDiagnostic } from "../structured-output/repair-diagnostics.js";
import type { RequirementSourceUnit } from "./requirement-source-units.js";

export interface ValidatedRequirementRules { rules: RequirementRule[] }
export class RequirementRuleValidationError extends Error {
  constructor(readonly diagnostics: RepairDiagnostic[]) {
    super(diagnostics.map(issue => `[${issue.code}] ${issue.path}: ${issue.message}`).join("\n"));
    this.name = "RequirementRuleValidationError";
  }
}
const pending = (text: string) => /^\s*(?:\[PENDING(?:[-_][A-Z0-9_-]+)?\]|(?:待确认|尚未确认)\s*[:：])/iu.test(text);
const content = (text: string) => text.replace(/^\s*\[(?:R|AC|CONFIRMED|PENDING)-[A-Z0-9_-]+\]\s*/iu, "");
function facts(text: string) {
  const digits: Record<string, string> = { 一: "1", 二: "2", 两: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };
  const normalized = content(text).replace(/不得回滚|不回滚/gu, "禁止回滚").replace(/不得|不能|不允许|不准/gu, "禁止")
    .replace(/(最多|至多|至少|超过|不超过|不少于)([一二两三四五六七八九十])(?=笔|次|个|条|人|天)/gu, (_, comparator: string, number: string) => comparator + digits[number]);
  const extracted = extractProtectedRequirementFacts({ actor: null, subject: null, action: normalized, object: null, condition: null, outcome: null });
  const keys = new Set(extracted.map(fact => fact.key));
  return extracted.filter(fact => {
    // Bare numbers may be list labels; explicit units and comparators carry business facts.
    if (fact.kind === "boundary" && /^boundary::[^:]+:$/u.test(fact.key)) return false;
    // A parenthetical inclusive example does not introduce a separate equality requirement.
    if (fact.key.startsWith("boundary:=:") && /包含(?:正好)?\s*\d+|含正好\s*\d+/u.test(normalized) &&
        [">=", "<="].some(op => keys.has(fact.key.replace("boundary:=:", `boundary:${op}:`)))) return false;
    return ["boundary", "temporal", "status"].includes(fact.kind) || fact.kind === "modality" && ["不得", "不能", "禁止", "只能", "no-rollback"].some(value => fact.key === `modality:${value}`);
  });
}
function citations(fragment: string, source: string, units: RequirementSourceUnit[]) {
  const matches: RequirementSourceUnit[][] = [];
  for (let at = source.indexOf(fragment); at >= 0; at = source.indexOf(fragment, at + 1)) {
    const end = at + fragment.length;
    const overlapping = units.filter(unit => unit.startOffset < end && unit.endOffset > at);
    let cursor = at, allowed = true;
    for (const unit of overlapping) {
      if (source.slice(cursor, Math.max(cursor, unit.startOffset)).trim()) { allowed = false; break; }
      cursor = Math.max(cursor, Math.min(end, unit.endOffset));
    }
    if (allowed && overlapping.length && !source.slice(cursor, end).trim()) matches.push(overlapping);
  }
  return matches;
}
export function validateRequirementRules(raw: unknown, input: { sourceText: string; units: RequirementSourceUnit[] }): ValidatedRequirementRules {
  const errors: RepairDiagnostic[] = [];
  const parsed = extractedRequirementsSchema.safeParse(raw);
  if (!parsed.success) errors.push(...repairDiagnostics(parsed.error));
  const rawRules = raw && typeof raw === "object" && "rules" in raw && Array.isArray(raw.rules) ? raw.rules : [];
  const rules: RequirementRule[] = [];
  const ids = new Map<string, number>();
  const coverage = new Map<string, Array<{ rule: RequirementRule; index: number }>>();
  const issue = (code: string, path: string, message: string, extras: Partial<RepairDiagnostic> = {}) => errors.push({ code, path, message, ...extras });
  if (!rawRules.length) issue("rules-empty", "rules", "存在明确需求时规则集合不能为空，请抽取完整需求集合");
  rawRules.forEach((rawRule, index) => {
    const result = extractedRequirementsSchema.shape.rules.element.safeParse(rawRule);
    if (!result.success) return;
    const rule = result.data;
    rules.push(rule);
    const path = `rules.${index}`;
    if (!rule.id.trim() || !rule.text.trim() || !rule.sourceFragment.trim()) issue("rule-blank-field", path, "规则编号、正文和来源均不能只包含空白");
    const id = rule.id.trim().toLowerCase(), previous = ids.get(id);
    if (previous !== undefined) issue("rule-id-duplicate", `${path}.id`, `规则 ID 与 rules.${previous}.id 重复，请返回唯一临时候选 ID`);
    else ids.set(id, index);
    if (!rule.sourceFragment.trim()) return;
    const matches = citations(rule.sourceFragment, input.sourceText, input.units);
    if (!matches.length) {
      issue("source-fragment-invalid", `${path}.sourceFragment`, "sourceFragment 必须逐字引用本次预检通过的原文，不能来自已排除内容或跨越排除片段拼接", {
        actual: rule.sourceFragment.slice(0, 2000), expected: { sourceType: "requirement_source", sourceId: "requirements:source", sourceUnitCount: input.units.length },
        repairHint: "从已提供原文或 get_upstream_artifact 返回的固定来源中逐字选取片段；完整原文保持可查询，诊断不重复整份资料。",
      });
      return;
    }
    const sourceUnits = [...new Map(matches.flat().map(unit => [unit.id, unit])).values()];
    if (matches.length > 1 && new Set(matches.map(group => group.map(unit => unit.text).join(""))).size > 1) {
      issue("source-fragment-ambiguous", `${path}.sourceFragment`, "来源片段重复出现在不同需求中，请扩大逐字引用范围以唯一定位业务依据", {
        expected: { sourceType: "requirement_source", sourceId: "requirements:source", sourceUnitCount: sourceUnits.length,
          legalSources: sourceUnits.slice(0, 5).map(unit => ({ sourceUnitId: unit.id, startOffset: unit.startOffset, endOffset: unit.endOffset })) },
      });
      return;
    }
    if (sourceUnits.some(unit => unit.pending || pending(unit.text))) {
      issue("source-pending", `${path}.sourceFragment`, "待确认内容不能作为已明确需求提交", { sourceUnitId: sourceUnits[0]!.id });
      return;
    }
    if (sourceUnits.some(unit => unit.imageAttachmentIndex !== undefined)) {
      if (sourceUnits.length !== 1 || sourceUnits[0]!.text !== rule.sourceFragment) {
        issue("source-image-reference-invalid", `${path}.sourceFragment`, "图片需求必须完整引用单个图片来源标记，不能与文本来源混合或只引用文件名");
        return;
      }
      // Image facts are read by the vision model; text fact checks cannot validate pixels or file names.
      const unit = sourceUnits[0]!;
      coverage.set(unit.id, [...coverage.get(unit.id) ?? [], { rule, index }]);
      return;
    }
    for (const unit of sourceUnits) coverage.set(unit.id, [...coverage.get(unit.id) ?? [], { rule, index }]);
    const supported = new Set(sourceUnits.flatMap(unit => facts(unit.text)).map(fact => fact.key));
    for (const fact of facts(rule.text)) if (!supported.has(fact.key)) issue("source-fact-changed", `${path}.text`, `规则加入或改写了原文未支持的关键事实：${fact.label}`, {
      sourceUnitId: sourceUnits[0]!.id, actual: fact.label, expected: { facts: sourceUnits.flatMap(unit => facts(unit.text)).map(fact => fact.label) },
      repairHint: "保留原文的数值、单位、包含边界、否定和时序；不能改成更宽或更窄的业务条件。",
    });
  });
  // Split rules jointly preserve their source's facts; each rule need not repeat every clause.
  for (const unit of input.units.filter(unit => (unit.category !== "context" || /^\s*\[(?:R|AC|CONFIRMED)-/iu.test(unit.text)) && !unit.pending && !pending(unit.text))) {
    const cited = coverage.get(unit.id) ?? [];
    if (!cited.length) {
      issue("source-unit-missing", "rules", `遗漏明确需求来源 ${unit.id}：${unit.text}`, { sourceUnitId: unit.id, expected: { legalSources: [unit] }, repairHint: "补齐该来源中的需求，保留其他已抽取规则，不得删除来源来规避遗漏。" });
      continue;
    }
    if (unit.imageAttachmentIndex !== undefined) continue;
    const actual = new Set(cited.flatMap(({ rule }) => facts(rule.text)).map(fact => fact.key));
    const missing = facts(unit.text).filter(fact => !actual.has(fact.key));
    if (missing.length) issue("source-facts-missing", `rules.${cited[0]!.index}.text`, `来源 ${unit.id} 的关键事实未被规则集合完整保留：${missing.map(fact => fact.label).join("、")}`, {
      sourceUnitId: unit.id, expected: { facts: missing.map(fact => fact.label) }, repairHint: "由引用同一来源的规则共同保留这些条件；可以合理拆分，不能弱化或遗漏条件。",
    });
  }
  if (errors.length) throw new RequirementRuleValidationError(errors);
  return { rules: parsed.success ? parsed.data.rules : rules };
}
