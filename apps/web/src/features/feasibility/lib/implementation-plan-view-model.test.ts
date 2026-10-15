import { describe, expect, it } from "vitest";
import type { FeasibilityCandidateImplementation, FeasibilityImplementationPlan, FeasibilityInputs } from "@uml-platform/contracts";
import { buildCostBenefitMetrics, buildImplementationStats, buildInputCompleteness, filterApplicableAbsenceDeclarations, validateImplementationDraft } from "./implementation-plan-view-model";

const inputs = {
  projectName: "项目", school: "", college: "", groupNumber: "", members: "", gradeClass: "", submissionDate: "",
  proposedBy: "", developedBy: "", expectedUsers: "", targetEnvironment: "", deadline: "", expectedLifetimeYears: null,
  budgetLimit: null, teamSize: null, teamSkills: "", availableResources: "", legalConstraints: "", references: "",
  costItems: [{ id: "c1", name: "开发", amount: 100, frequency: "one-time" as const, note: "" }],
  benefitItems: [{ id: "b1", name: "节省", amount: 200, frequency: "annual" as const, note: "" }], analysisYears: null,
} satisfies FeasibilityInputs;

const implementation = {
    architecture: { summary: "模块化", modules: [{ id: "m1", name: "模块", responsibility: "处理", sourceRequirementIds: ["r1"] }] },
    dataStrategy: { summary: "数据", sourceRequirementIds: ["r1"] }, integrations: [], integrationRationale: "无需外部集成",
    deploymentAndOperations: { summary: "部署", sourceRequirementIds: ["r1"] },
    securityAndCompliance: { summary: "安全", sourceRequirementIds: ["r1"] },
    milestones: [{ id: "ms1", name: "阶段", timeframe: "1周", deliverables: ["系统"], roles: ["开发者"], dependencies: [], dependencyRationale: "无外部依赖", acceptanceCriteria: ["通过"], sourceRequirementIds: ["r1"] }],
    analysisPeriodAssumption: { years: 2, basis: "教学项目周期", provenance: "ai-estimate" as const },
    costEstimates: [{ id: "ce1", name: "开发", category: "other-one-time" as const, frequency: "one-time" as const, range: { minimum: 100, maximum: 120, currency: "CNY", basis: "人工时", confidence: "medium" as const }, sourceRequirementIds: ["r1"], provenance: "ai-estimate" as const }],
    benefitEstimates: [{ id: "be1", name: "节省", category: "recurring" as const, frequency: "annual" as const, range: { minimum: 200, maximum: 240, currency: "CNY", basis: "人工时", confidence: "medium" as const }, outcome: "节省时间", sourceRequirementIds: ["r1"], provenance: "ai-estimate" as const }],
    absenceDeclarations: [],
    oneTimeCosts: [], recurringCosts: [], quantitativeBenefits: [], qualitativeBenefits: [],
    risks: ["延期", "质量", "运维"].map((risk, index) => ({ id: `risk-${index}`, risk, probability: "medium" as const, impact: index === 0 ? "high" as const : "medium" as const, mitigation: "缓冲", owner: "PM", sourceRequirementIds: ["r1"], provenance: "ai-estimate" as const })),
    verdicts: ["technical", "operational", "schedule", "economic", "legal"].map((category) => ({ category, verdict: "feasible", rationale: "可行" })) as FeasibilityCandidateImplementation["verdicts"],
    decision: "conditional-go" as const, preconditions: [],
  } satisfies FeasibilityCandidateImplementation;

const plan = {
  overview: "概述",
  candidates: [
    { id: "a", name: "A", summary: "A", advantages: ["快"], disadvantages: ["限制"], estimatedCost: "100", estimatedSchedule: "2周", sourceRequirementIds: ["r1"], implementation },
    { id: "b", name: "B", summary: "B", advantages: ["稳"], disadvantages: ["较慢"], estimatedCost: "120", estimatedSchedule: "3周", sourceRequirementIds: ["r1"], implementation: { ...implementation, architecture: { ...implementation.architecture, modules: [{ ...implementation.architecture.modules[0]!, id: "m2" }] } } },
  ],
  reducedCandidateReason: "", recommendedCandidateId: "a", recommendationRationale: "成本低",
} satisfies FeasibilityImplementationPlan;

describe("implementation plan view model", () => {
  it("computes completeness and report-compatible cost metrics", () => {
    expect(buildInputCompleteness(inputs)).toMatchObject({ completed: 3, total: 22, percent: 14 });
    expect(buildCostBenefitMetrics(inputs)).toMatchObject({ totalCost: 100, totalBenefit: 200, ratio: 2, payback: 0.5 });
    expect(buildCostBenefitMetrics({ ...inputs, benefitItems: [{ ...inputs.benefitItems[0]!, amount: null }] }).ratio).toBeNull();
    expect(buildCostBenefitMetrics(inputs, implementation)).toMatchObject({
      totalCostRange: { minimum: 100, maximum: 120 },
      totalBenefitRange: { minimum: 400, maximum: 480 },
      ratioRange: { minimum: 400 / 120, maximum: 480 / 100 },
      analysisYears: 2,
    });
  });

  it("derives high risks and validates traceable plan structures", () => {
    expect(buildImplementationStats(plan)).toMatchObject({ candidates: 2, modules: 1, milestones: 1, highRisks: 1 });
    expect(validateImplementationDraft(plan, ["r1"])).toEqual([]);
    expect(validateImplementationDraft({ ...plan, candidates: [{ ...plan.candidates[0]!, sourceRequirementIds: [] }] }, ["r1"]))
      .toContain("missingSources");
  });

  it("hides legacy absence declarations when the matching estimate exists", () => {
    expect(filterApplicableAbsenceDeclarations({
      ...implementation,
      absenceDeclarations: [
        { scope: "other-one-time-costs", reason: "旧数据重复声明", provenance: "legacy" },
        { scope: "capital-costs", reason: "未产生资本支出", provenance: "ai-estimate" },
      ],
    })).toEqual([{ scope: "capital-costs", reason: "未产生资本支出", provenance: "ai-estimate" }]);
  });
});
