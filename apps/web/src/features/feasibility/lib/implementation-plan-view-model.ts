// Derives deterministic dashboard metrics and validates editable implementation-plan drafts.
import {
  feasibilityImplementationPlanSchema,
  type FeasibilityCandidateImplementation,
  type FeasibilityImplementationPlan,
  type FeasibilityInputs,
} from "@uml-platform/contracts";

export type FeasibilityInputField = {
  key: Exclude<keyof FeasibilityInputs, "costItems" | "benefitItems">;
  group: "cover" | "facts";
  type?: "number" | "date";
};

export const FEASIBILITY_INPUT_FIELDS: FeasibilityInputField[] = [
  { key: "projectName", group: "cover" },
  { key: "school", group: "cover" },
  { key: "college", group: "cover" },
  { key: "groupNumber", group: "cover" },
  { key: "members", group: "cover" },
  { key: "gradeClass", group: "cover" },
  { key: "submissionDate", group: "cover", type: "date" },
  { key: "proposedBy", group: "facts" },
  { key: "developedBy", group: "facts" },
  { key: "expectedUsers", group: "facts" },
  { key: "targetEnvironment", group: "facts" },
  { key: "deadline", group: "facts" },
  { key: "expectedLifetimeYears", group: "facts", type: "number" },
  { key: "budgetLimit", group: "facts", type: "number" },
  { key: "teamSize", group: "facts", type: "number" },
  { key: "teamSkills", group: "facts" },
  { key: "availableResources", group: "facts" },
  { key: "legalConstraints", group: "facts" },
  { key: "references", group: "facts" },
  { key: "analysisYears", group: "facts", type: "number" },
];

function hasValue(value: unknown) {
  return typeof value === "number"
    ? Number.isFinite(value)
    : typeof value === "string"
      ? value.trim().length > 0
      : value !== null && value !== undefined;
}

export function filterApplicableAbsenceDeclarations(implementation: FeasibilityCandidateImplementation) {
  const populatedScopes = new Set<string>();
  implementation.costEstimates.forEach((item) => populatedScopes.add(item.category === "capital" ? "capital-costs" : item.category === "other-one-time" ? "other-one-time-costs" : "recurring-costs"));
  implementation.benefitEstimates.forEach((item) => populatedScopes.add(item.category === "one-time" ? "one-time-benefits" : item.category === "recurring" ? "recurring-benefits" : "intangible-benefits"));
  if (implementation.integrations.length) populatedScopes.add("integrations");
  return implementation.absenceDeclarations.filter((item) => !populatedScopes.has(item.scope));
}

function moneyItemsComplete(items: FeasibilityInputs["costItems"]) {
  return items.length > 0 && items.every((item) => item.name.trim() && item.amount !== null);
}

export function buildInputCompleteness(inputs: FeasibilityInputs) {
  const scalarCompleted = FEASIBILITY_INPUT_FIELDS.filter((field) => hasValue(inputs[field.key])).length;
  const completed = scalarCompleted + Number(moneyItemsComplete(inputs.costItems)) + Number(moneyItemsComplete(inputs.benefitItems));
  const total = FEASIBILITY_INPUT_FIELDS.length + 2;
  return {
    completed,
    total,
    pending: total - completed,
    percent: Math.round((completed / total) * 100),
  };
}

export function buildCostBenefitMetrics(
  inputs: FeasibilityInputs,
  implementation?: FeasibilityCandidateImplementation | null,
) {
  if (implementation?.costEstimates.length && implementation.benefitEstimates.length) {
    const years = inputs.analysisYears ?? implementation.analysisPeriodAssumption?.years ?? null;
    const factor = (frequency: "one-time" | "monthly" | "annual", horizon: number) =>
      frequency === "monthly" ? horizon * 12 : frequency === "annual" ? horizon : 1;
    type EstimateInput = {
      frequency?: "one-time" | "monthly" | "annual";
      range?: { minimum?: number; maximum?: number } | null;
    };
    const addRanges = (items: EstimateInput[], horizon: number) => items.reduce((total, item) => {
      if (!item.frequency || typeof item.range?.minimum !== "number" || typeof item.range.maximum !== "number") return total;
      return {
        minimum: total.minimum + item.range.minimum * factor(item.frequency, horizon),
        maximum: total.maximum + item.range.maximum * factor(item.frequency, horizon),
      };
    }, { minimum: 0, maximum: 0 });
    const quantifiedBenefits = implementation.benefitEstimates.filter((item) => item.range !== null);
    if (years) {
      const totalCostRange = addRanges(implementation.costEstimates, years);
      const totalBenefitRange = addRanges(quantifiedBenefits, years);
      const ratioRange = totalCostRange.minimum > 0 && totalCostRange.maximum > 0
        ? {
            minimum: totalBenefitRange.minimum / totalCostRange.maximum,
            maximum: totalBenefitRange.maximum / totalCostRange.minimum,
          }
        : null;
      const oneTimeCostRange = addRanges(
        implementation.costEstimates.filter((item) => item.frequency === "one-time"),
        1,
      );
      const annualBenefitRange = addRanges(
        quantifiedBenefits.filter((item) => item.frequency !== "one-time"),
        1,
      );
      const paybackRange = annualBenefitRange.minimum > 0 && annualBenefitRange.maximum > 0
        ? {
            minimum: oneTimeCostRange.minimum / annualBenefitRange.maximum,
            maximum: oneTimeCostRange.maximum / annualBenefitRange.minimum,
          }
        : null;
      return {
        totalCost: (totalCostRange.minimum + totalCostRange.maximum) / 2,
        totalBenefit: (totalBenefitRange.minimum + totalBenefitRange.maximum) / 2,
        ratio: ratioRange ? (ratioRange.minimum + ratioRange.maximum) / 2 : null,
        payback: paybackRange ? (paybackRange.minimum + paybackRange.maximum) / 2 : null,
        totalCostRange,
        totalBenefitRange,
        ratioRange,
        paybackRange,
        analysisYears: years,
        analysisPeriodSource: inputs.analysisYears !== null
          ? "user-confirmed" as const
          : implementation.analysisPeriodAssumption?.provenance ?? "legacy",
      };
    }
  }
  const complete = moneyItemsComplete(inputs.costItems) && moneyItemsComplete(inputs.benefitItems);
  const totalCost = complete ? inputs.costItems.reduce((sum, item) => sum + (item.amount ?? 0), 0) : null;
  const totalBenefit = complete ? inputs.benefitItems.reduce((sum, item) => sum + (item.amount ?? 0), 0) : null;
  const calculable = totalCost !== null && totalBenefit !== null && totalCost > 0 && totalBenefit > 0;
  return {
    totalCost: calculable ? totalCost : null,
    totalBenefit: calculable ? totalBenefit : null,
    ratio: calculable ? totalBenefit / totalCost : null,
    payback: calculable ? totalCost / totalBenefit : null,
    totalCostRange: calculable ? { minimum: totalCost!, maximum: totalCost! } : null,
    totalBenefitRange: calculable ? { minimum: totalBenefit!, maximum: totalBenefit! } : null,
    ratioRange: calculable ? { minimum: totalBenefit! / totalCost!, maximum: totalBenefit! / totalCost! } : null,
    paybackRange: calculable ? { minimum: totalCost! / totalBenefit!, maximum: totalCost! / totalBenefit! } : null,
    analysisYears: inputs.analysisYears,
    analysisPeriodSource: "user-confirmed" as const,
  };
}

const riskWeight = { low: 1, medium: 2, high: 3 } as const;

export function riskScore(risk: FeasibilityCandidateImplementation["risks"][number]) {
  return riskWeight[risk.probability] * riskWeight[risk.impact];
}

export function findCandidateImplementation(
  plan: FeasibilityImplementationPlan,
  candidateId?: string | null,
) {
  const candidate = plan.candidates.find((item) => item.id === candidateId)
    ?? plan.candidates.find((item) => item.id === plan.recommendedCandidateId)
    ?? plan.candidates[0];
  return { candidate, implementation: candidate?.implementation ?? null };
}

export function buildImplementationStats(plan: FeasibilityImplementationPlan, candidateId?: string | null) {
  const { implementation } = findCandidateImplementation(plan, candidateId);
  return {
    candidates: plan.candidates.length,
    modules: implementation?.architecture.modules.length ?? 0,
    milestones: implementation?.milestones.length ?? 0,
    highRisks: implementation?.risks.filter((risk) => riskScore(risk) >= 6).length ?? 0,
  };
}

export type PlanValidationCode =
  | "invalidCandidates"
  | "reducedReasonRequired"
  | "invalidRecommendation"
  | "incompleteCandidateImplementations"
  | "missingSources"
  | "missingEstimates"
  | "invalidEstimateRanges"
  | "invalidRiskCount"
  | "missingAbsenceReason"
  | "invalidVerdicts"
  | "invalidPlan";

export function validateImplementationDraft(
  plan: FeasibilityImplementationPlan,
  validRuleIds: string[],
): PlanValidationCode[] {
  const errors = new Set<PlanValidationCode>();
  if (plan.candidates.length < 1 || plan.candidates.length > 3) errors.add("invalidCandidates");
  if (plan.candidates.length < 2 && !plan.reducedCandidateReason.trim()) errors.add("reducedReasonRequired");
  if (!plan.candidates.some((candidate) => candidate.id === plan.recommendedCandidateId)) errors.add("invalidRecommendation");
  if (plan.candidates.some((candidate) => !candidate.implementation)) errors.add("incompleteCandidateImplementations");
  const validIds = new Set(validRuleIds);
  const traced = plan.candidates.flatMap((candidate) => [
    candidate,
    ...(candidate.implementation?.architecture.modules ?? []),
    ...(candidate.implementation?.integrations ?? []),
    ...(candidate.implementation?.milestones ?? []),
    ...(candidate.implementation?.costEstimates ?? []),
    ...(candidate.implementation?.benefitEstimates ?? []),
    ...(candidate.implementation?.risks ?? []),
  ]);
  if (traced.some((item) =>
    item.sourceRequirementIds.some((id) => !validIds.has(id))
    || (item.sourceRequirementIds.length === 0 && !("assumption" in item && item.assumption.trim())),
  )) {
    errors.add("missingSources");
  }
  for (const candidate of plan.candidates) {
    const expectedCategories = new Set(["technical", "operational", "schedule", "economic", "legal"]);
    const verdicts = candidate.implementation?.verdicts ?? [];
    if (verdicts.length !== 5 || verdicts.some((verdict) => !expectedCategories.delete(verdict.category)) || expectedCategories.size) {
      errors.add("invalidVerdicts");
    }
    const implementation = candidate.implementation;
    if (!implementation) continue;
    if (!implementation.costEstimates.length || !implementation.benefitEstimates.length || !implementation.analysisPeriodAssumption) {
      errors.add("missingEstimates");
    }
    if (implementation.costEstimates.some((item) => item.range.maximum < item.range.minimum)
      || implementation.benefitEstimates.some((item) => item.range && item.range.maximum < item.range.minimum)) {
      errors.add("invalidEstimateRanges");
    }
    if (implementation.risks.length < 3 || implementation.risks.length > 5) errors.add("invalidRiskCount");
    if ((implementation.integrations.length === 0 && !implementation.integrationRationale.trim())
      || implementation.milestones.some((item) => item.dependencies.length === 0 && !item.dependencyRationale.trim())) {
      errors.add("missingAbsenceReason");
    }
  }
  if (!feasibilityImplementationPlanSchema.safeParse(plan).success) errors.add("invalidPlan");
  return Array.from(errors);
}

export function splitLines(value: string) {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

export function joinLines(items: string[]) {
  return items.join("\n");
}
