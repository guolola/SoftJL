// Validates the canonical extraction contract and preserves source-label coverage.
import { extractProtectedRequirementFacts, extractedRequirementsSchema, requirementRulesResultSchema, type RequirementRule, type RequirementRulesResult } from "@uml-platform/contracts";

function uniqueRequirementRuleId(id: string, usedIds: Set<string>) {
  const baseId = id || "r";
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate.toLowerCase())) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate.toLowerCase());
  return candidate;
}

function semanticFactKeys(text: string) {
  return new Set(
    extractProtectedRequirementFacts({
      actor: null,
      subject: null,
      action: text,
      object: null,
      condition: null,
      outcome: null,
    }).map((fact) => fact.key),
  );
}

function compactRuleText(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]/gu, "");
}

function distinctiveHanBigrams(text: string) {
  const stop = new Set(["必须", "系统", "可以", "不得", "不能", "需求", "满足", "验证"]);
  const grams = new Set<string>();
  for (const match of text.matchAll(/\p{Script=Han}{2,}/gu)) {
    for (let index = 0; index < match[0].length - 1; index += 1) {
      const gram = match[0].slice(index, index + 2);
      if (!stop.has(gram)) grams.add(gram);
    }
  }
  return grams;
}

function extractedRuleCoversSource(
  rule: RequirementRule,
  sourceText: string,
) {
  return ruleTextCoversSourceText(rule.text, sourceText);
}

function ruleTextCoversSourceText(ruleText: string, sourceText: string) {
  const expectedFacts = semanticFactKeys(sourceText);
  const actualFacts = semanticFactKeys(ruleText);
  const expectedBigrams = distinctiveHanBigrams(sourceText);
  const actualBigrams = distinctiveHanBigrams(ruleText);
  const lexicalOverlap = Array.from(expectedBigrams).filter((gram) =>
    actualBigrams.has(gram),
  ).length;
  if (
    expectedFacts.size > 0 &&
    Array.from(expectedFacts).every((fact) => actualFacts.has(fact)) &&
    lexicalOverlap >= 2
  ) {
    return true;
  }
  const expectedText = compactRuleText(sourceText);
  const actualText = compactRuleText(ruleText);
  return Boolean(
    expectedText &&
      actualText &&
      actualText.includes(expectedText),
  );
}

export function mergeConfirmedLabeledRequirementRules(
  rules: RequirementRule[],
  requirementText: string,
) {
  const merged = [...rules];
  const missingLabels: string[] = [];
  const labeledLine =
    /^\s*\[((?:R|AC|CONFIRMED)-[A-Z0-9_-]+)\]\s*(.+?)\s*$/gimu;

  for (const match of requirementText.matchAll(labeledLine)) {
    const sourceLabel = match[1];
    const text = match[2]?.trim();
    if (!text) {
      continue;
    }
    const coveredIndex = merged.findIndex((rule) =>
      extractedRuleCoversSource(rule, text),
    );
    if (coveredIndex >= 0) {
      const covered = merged[coveredIndex]!;
      merged[coveredIndex] = {
        ...covered,
        sourceFragment: match[0].trim(),
      };
      continue;
    }
    missingLabels.push(sourceLabel);
  }

  // Preserve the coverage check without manufacturing uncategorized rules.
  // The repair prompt carries the complete source and must recover these facts.
  if (missingLabels.length) {
    throw new Error(`需求规则遗漏已标记的原文：${missingLabels.join(", ")}。请补齐对应规则、type 和逐字引用的 sourceFragment。`);
  }
  return merged;
}

export function normalizeRequirementRulesResult(raw: unknown, requirementText = ""): RequirementRulesResult {
  const parsed = extractedRequirementsSchema.parse(raw);
  const usedRuleIds = new Set<string>();
  const rules = parsed.rules.map(rule => ({ ...rule, id: uniqueRequirementRuleId(rule.id, usedRuleIds) }));
  // Keep source evidence and labeled coverage checks without manufacturing metadata.
  return requirementRulesResultSchema.parse({ rules: requirementText ? mergeConfirmedLabeledRequirementRules(rules, requirementText) : rules });
}
