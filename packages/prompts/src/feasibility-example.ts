// Provides the single contract-valid implementation example shared by prompts and schema tests.

const AI_PROVENANCE = "ai-estimate" as const;

function sourceRef(assumption: string) {
  return {
    sourceRequirementIds: [],
    assumption,
    provenance: AI_PROVENANCE,
  };
}

function candidate(index: number) {
  const id = `candidate-${index}`;
  const assumption = "示例中的技术与金额仅用于说明输出结构，实际生成时必须重新估算。";
  return {
    id,
    name: `候选方案 ${index}`,
    summary: "完整候选方案示例。",
    advantages: ["交付边界清晰"],
    disadvantages: ["估算仍需确认"],
    estimatedCost: "以结构化成本区间为准",
    estimatedSchedule: "以里程碑为准",
    ...sourceRef(assumption),
    implementation: {
      provenance: AI_PROVENANCE,
      architecture: {
        summary: "分层应用结构。",
        modules: [{
          id: `${id}-module-1`,
          name: "业务模块",
          responsibility: "承载已确认需求对应的业务能力。",
          ...sourceRef(assumption),
        }],
      },
      dataStrategy: {
        summary: "按业务对象保存必要数据。",
        ...sourceRef(assumption),
      },
      integrations: [],
      integrationRationale: "示例上下文中没有外部系统，因此不生成集成。",
      deploymentAndOperations: {
        summary: "部署方式作为待确认方案假设。",
        ...sourceRef(assumption),
      },
      securityAndCompliance: {
        summary: "仅描述通用访问控制，法规要求待用户确认。",
        ...sourceRef(assumption),
      },
      milestones: [{
        id: `${id}-milestone-1`,
        name: "核心功能交付",
        timeframe: "第 1-4 周",
        deliverables: ["可验收版本"],
        roles: ["开发与测试"],
        dependencies: [],
        dependencyRationale: "首个里程碑没有前置里程碑。",
        acceptanceCriteria: ["已确认需求通过验收"],
        ...sourceRef(assumption),
      }],
      analysisPeriodAssumption: {
        years: 3,
        basis: "以三年作为方案比较窗口，需用户确认。",
        provenance: AI_PROVENANCE,
      },
      costEstimates: [
        {
          id: `${id}-cost-capital`,
          name: "基础设施投入",
          category: "capital",
          frequency: "one-time",
          range: {
            minimum: 1000,
            maximum: 3000,
            currency: "CNY",
            basis: "按小型教学项目估算。",
            confidence: "low",
          },
          note: "不代表用户确认预算。",
          ...sourceRef(assumption),
        },
        {
          id: `${id}-cost-other`,
          name: "实施投入",
          category: "other-one-time",
          frequency: "one-time",
          range: {
            minimum: 2000,
            maximum: 6000,
            currency: "CNY",
            basis: "按实施工时估算。",
            confidence: "low",
          },
          note: "不代表用户确认预算。",
          ...sourceRef(assumption),
        },
        {
          id: `${id}-cost-recurring`,
          name: "年度运维",
          category: "recurring",
          frequency: "annual",
          range: {
            minimum: 500,
            maximum: 1500,
            currency: "CNY",
            basis: "按年度维护工作估算。",
            confidence: "low",
          },
          note: "不代表用户确认预算。",
          ...sourceRef(assumption),
        },
      ],
      benefitEstimates: [
        {
          id: `${id}-benefit-once`,
          name: "一次性交付收益",
          category: "one-time",
          frequency: "one-time",
          range: {
            minimum: 1000,
            maximum: 3000,
            currency: "CNY",
            basis: "按减少一次性整理工时估算。",
            confidence: "low",
          },
          outcome: "减少初始资料整理时间。",
          ...sourceRef(assumption),
        },
        {
          id: `${id}-benefit-recurring`,
          name: "持续效率收益",
          category: "recurring",
          frequency: "annual",
          range: {
            minimum: 1000,
            maximum: 4000,
            currency: "CNY",
            basis: "按年度节省工时估算。",
            confidence: "low",
          },
          outcome: "减少重复操作时间。",
          ...sourceRef(assumption),
        },
        {
          id: `${id}-benefit-intangible`,
          name: "体验改善",
          category: "intangible",
          frequency: "annual",
          range: null,
          outcome: "流程更透明。",
          ...sourceRef(assumption),
        },
      ],
      absenceDeclarations: [
        {
          scope: "integrations",
          reason: "上下文中没有可引用的外部系统。",
          provenance: AI_PROVENANCE,
        },
        {
          scope: "dependencies",
          reason: "首个里程碑没有前置里程碑。",
          provenance: AI_PROVENANCE,
        },
      ],
      oneTimeCosts: ["基础设施与实施投入"],
      recurringCosts: ["年度运维"],
      quantitativeBenefits: ["一次性与持续效率收益"],
      qualitativeBenefits: ["流程透明度提升"],
      risks: [1, 2, 3].map((riskIndex) => ({
        id: `${id}-risk-${riskIndex}`,
        risk: `方案风险 ${riskIndex}`,
        probability: "medium",
        impact: "medium",
        mitigation: "在里程碑评审中验证并调整。",
        owner: "项目组",
        ...sourceRef(assumption),
      })),
      verdicts: [
        "technical",
        "operational",
        "schedule",
        "economic",
        "legal",
      ].map((category) => ({
        category,
        verdict: category === "legal" ? "unknown" : "conditional",
        rationale: "结论依赖已确认需求与明确方案假设。",
        provenance: AI_PROVENANCE,
      })),
      decision: "conditional-go",
      preconditions: ["确认估算与方案假设"],
    },
  };
}

export const FEASIBILITY_IMPLEMENTATION_EXAMPLE = {
  overview: "基于同一需求源比较两套完整候选方案。",
  candidates: [candidate(1), candidate(2)],
  reducedCandidateReason: "",
  recommendedCandidateId: "candidate-1",
  recommendationRationale: "在当前假设下候选方案 1 风险更可控。",
};
