// Rejects generated UML boundary logic that contradicts confirmed requirement comparators.
import {
  extractProtectedRequirementFacts,
  type DiagramModelSpec,
  type RequirementRule,
  type RequirementSemanticFact,
} from "@uml-platform/contracts";

export interface RequirementModelSemanticConflict {
  ruleId: string;
  expected: string;
  actual: string;
  number: string;
  unit: string;
}

interface Boundary {
  comparator: string;
  number: string;
  unit: string;
  label: string;
}

const CONTRADICTING_COMPARATORS: Record<string, ReadonlySet<string>> = {
  ">=": new Set([">", "<=", "="]),
  "<=": new Set(["<", ">=", "="]),
  ">": new Set([">=", "<"]),
  "<": new Set(["<=", ">"]),
};

function carrier(text: string) {
  return {
    actor: null,
    subject: null,
    action: text,
    object: null,
    condition: null,
    outcome: null,
  };
}

function boundaryFromFact(fact: RequirementSemanticFact): Boundary | null {
  if (fact.kind !== "boundary") return null;
  const match = fact.key.match(/^boundary:(>=|<=|>|<|=):(\d+(?:\.\d+)?):(.*)$/u);
  if (!match) return null;
  return {
    comparator: match[1],
    number: match[2],
    unit: match[3],
    label: fact.label,
  };
}

function boundaries(text: string) {
  return extractProtectedRequirementFacts(carrier(text))
    .map(boundaryFromFact)
    .filter((item): item is Boundary => Boolean(item));
}

export function findRequirementModelSemanticConflicts(
  rules: RequirementRule[],
  models: DiagramModelSpec[],
): RequirementModelSemanticConflict[] {
  const actualBoundaries = boundaries(JSON.stringify(models));
  const conflicts: RequirementModelSemanticConflict[] = [];

  for (const rule of rules) {
    const expectedBoundaries = boundaries(
      [rule.text, rule.sourceFragment].filter(Boolean).join("；"),
    );
    for (const expected of expectedBoundaries) {
      const contradicting = CONTRADICTING_COMPARATORS[expected.comparator];
      if (!contradicting) continue;
      const sameThreshold = actualBoundaries.filter(
        (actual) =>
          actual.number === expected.number &&
          (actual.unit === expected.unit || actual.unit === ""),
      );
      const preservesInclusiveBoundary = sameThreshold.some(
        (actual) => actual.comparator === expected.comparator,
      );
      for (const actual of sameThreshold) {
        if (
          !contradicting.has(actual.comparator) ||
          (actual.comparator === "=" && preservesInclusiveBoundary)
        ) {
          continue;
        }
        conflicts.push({
          ruleId: rule.id,
          expected: expected.label,
          actual: actual.label,
          number: expected.number,
          unit: expected.unit,
        });
      }
    }
  }

  return conflicts.filter(
    (conflict, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.ruleId === conflict.ruleId &&
          candidate.expected === conflict.expected &&
          candidate.actual === conflict.actual,
      ) === index,
  );
}

export function assertRequirementModelSemanticFidelity(
  rules: RequirementRule[],
  models: DiagramModelSpec[],
) {
  const conflicts = findRequirementModelSemanticConflicts(rules, models);
  if (conflicts.length === 0) return;
  const detail = conflicts
    .slice(0, 8)
    .map(
      (conflict) =>
        `${conflict.ruleId} 的已确认边界“${conflict.expected}”被模型写成“${conflict.actual}”`,
    )
    .join("；");
  throw new Error(
    `requirement model semantic fidelity failed: ${detail}。必须保留包含等号的边界，并同步修正判断条件及其互补分支。`,
  );
}
