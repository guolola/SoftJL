// Defines deterministic marketing case project templates for one-click sample project creation.
import {
  buildAcceptedRequirementSnapshot,
  buildFeasibilityImplementationFingerprint,
  type FeasibilityBusinessFlow,
  
  completeFeasibilityImplementationPlanSchema,
  contextDiagramSpecSchema,
  designRunSnapshotSchema,
  feasibilityInputsSchema,
  feasibilityRunSnapshotSchema,
  runSnapshotSchema,
  
  type ContextTraceRow,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DesignPlantUmlArtifact,
  type DesignRunSnapshot,
  type DiagramKind,
  type DiagramModelSpec,
  type FeasibilityRunSnapshot,
  type PlantUmlArtifact,
  type ProjectBackgroundKey,
  type AtomicRequirement,
  type RequirementBaseline,
  type RequirementRule,
  type RunSnapshot,
} from "@uml-platform/contracts";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import { generatePlantUmlArtifacts } from "../plantuml.js";
import { normalizeFeasibilityBusinessFlow } from "../normalizers/feasibility/business-flow-normalizer.js";

export type CaseProjectTemplate = {
  id: string;
  title: string;
  description: string;
  backgroundKey: ProjectBackgroundKey;
  requirementSnapshot: RunSnapshot;
  feasibilitySnapshot: FeasibilityRunSnapshot;
  businessFlow: FeasibilityBusinessFlow & { plantUml: PlantUmlArtifact };
  designSnapshot: DesignRunSnapshot;
  
};

type CaseSeed = {
  id: string;
  title: string;
  description: string;
  backgroundKey: ProjectBackgroundKey;
  requirementText: string;
  actors: [string, string, string];
  entityNames: [string, string, string];
  primaryAction: string;
  secondaryAction: string;
  approvalAction: string;
  statusEntity: string;
  states: [string, string, string, string];
  externalSystem: string;
  notificationRule: string;
  dashboardTitle: string;
};

const generatedAt = "2026-06-26T00:00:00.000Z";
const requirementDiagrams = ["usecase", "class", "activity"] as const satisfies DiagramKind[];
const designDiagrams = ["architecture", "sequence", "class", "table"] as const satisfies DesignDiagramKind[];

const seeds = [
  {
    id: "lab-booking",
    title: "实验室预约系统",
    description: "已预置实验室预约、审批、资源占用和通知链路。",
    backgroundKey: "booking",
    requirementText:
      "高校实验室预约平台。学生可以查看实验室空闲时段并提交预约申请，教师审核预约，管理员维护实验室设备和开放时间。系统需要避免时段冲突，并在审核通过或驳回时通知申请人。",
    actors: ["学生", "教师", "实验室管理员"],
    entityNames: ["实验室", "预约申请", "通知"],
    primaryAction: "提交预约申请",
    secondaryAction: "查看实验室空闲时段",
    approvalAction: "审核预约",
    statusEntity: "预约申请",
    states: ["草稿", "待审核", "已通过", "已驳回"],
    externalSystem: "消息通知服务",
    notificationRule: "审核通过或驳回时通知申请人。",
    dashboardTitle: "实验室预约控制台",
  },
  {
    id: "order-management",
    title: "订单管理系统",
    description: "已预置订单创建、库存校验、发货通知和状态跟踪。",
    backgroundKey: "orders",
    requirementText:
      "面向中小商家的订单管理系统。商家可以维护商品、创建订单、查看库存，客户可以提交订单并查询订单状态。系统需要在下单前校验库存，库存不足时给出明确提示，订单创建后通知仓储系统发货。",
    actors: ["客户", "商家", "仓储系统"],
    entityNames: ["商品", "订单", "库存记录"],
    primaryAction: "提交订单",
    secondaryAction: "查询订单状态",
    approvalAction: "确认发货",
    statusEntity: "订单",
    states: ["待支付", "待发货", "已发货", "库存不足"],
    externalSystem: "仓储系统",
    notificationRule: "订单创建后通知仓储系统发货。",
    dashboardTitle: "订单履约控制台",
  },
  {
    id: "device-monitoring",
    title: "设备监控系统",
    description: "已预置设备数据采集、告警确认、严重告警通知和监控看板。",
    backgroundKey: "iot",
    requirementText:
      "工业设备监控系统。边缘网关采集设备温度、振动和运行状态，平台实时展示异常告警，运维人员可以确认告警并记录处理结果。系统需要接入第三方短信服务，在严重告警时发送通知。",
    actors: ["边缘网关", "运维人员", "短信服务"],
    entityNames: ["设备", "告警", "处理记录"],
    primaryAction: "确认告警",
    secondaryAction: "查看设备状态",
    approvalAction: "记录处理结果",
    statusEntity: "告警",
    states: ["正常", "预警", "严重", "已处理"],
    externalSystem: "第三方短信服务",
    notificationRule: "严重告警时发送短信通知运维人员。",
    dashboardTitle: "设备监控看板",
  },
  {
    id: "library-lending",
    title: "图书馆借阅系统",
    description: "已预置图书检索、借阅登记、归还处理和逾期提醒。",
    backgroundKey: "campus",
    requirementText:
      "校园图书馆借阅系统。读者可以检索图书、提交借阅申请并查看借阅状态，馆员负责登记借出和归还。系统需要维护图书库存，自动识别逾期记录，并向读者发送归还提醒。",
    actors: ["读者", "馆员", "系统通知服务"],
    entityNames: ["图书", "借阅记录", "逾期提醒"],
    primaryAction: "提交借阅申请",
    secondaryAction: "检索图书",
    approvalAction: "登记借出和归还",
    statusEntity: "借阅记录",
    states: ["可借", "申请中", "已借出", "已逾期"],
    externalSystem: "系统通知服务",
    notificationRule: "逾期时向读者发送归还提醒。",
    dashboardTitle: "图书借阅工作台",
  },
] as const satisfies CaseSeed[];

export const caseProjectTemplates = seeds.map(buildCaseProjectTemplate);

export function getCaseProjectTemplate(caseId: string) {
  return caseProjectTemplates.find((template) => template.id === caseId) ?? null;
}

function buildCaseProjectTemplate(seed: CaseSeed): CaseProjectTemplate {
  const requirementSnapshot = buildRequirementSnapshot(seed);
  const activity = requirementSnapshot.models.find((model) => model.diagramKind === "activity");
  if (!activity || activity.diagramKind !== "activity") throw new Error("Case activity model is missing");
  const flow = normalizeFeasibilityBusinessFlow({
    model: {
      ...activity, modelId: "feasibility-business-flow", title: `${seed.title}业务与系统流程图`,
      notes: ["展示案例核心业务闭环，通知按需求中规定的触发条件执行。"],
      swimlanes: [...activity.swimlanes.slice(0, 2), { id: "system", name: seed.title }],
      nodes: activity.nodes.map((node) => node.type === "activity" && node.actorOrLane === "lane-3"
        ? { ...node, actorOrLane: "system" } : node),
    },
    traceability: [
      ...["act-query", "act-submit"].map((targetId) => ({ requirementId: `${seed.id}-R1`, targetId, targetKind: "node" })),
      { requirementId: `${seed.id}-R3`, targetId: "act-review", targetKind: "node" },
      { requirementId: `${seed.id}-R4`, targetId: "act-notify", targetKind: "node" },
      { requirementId: `${seed.id}-R1`, targetId: "lane-1", targetKind: "swimlane" },
      { requirementId: `${seed.id}-R3`, targetId: "lane-2", targetKind: "swimlane" },
    ],
  }, new Set(requirementSnapshot.rules.map((rule) => rule.id)));
  const businessFlow = { ...flow, plantUml: generatePlantUmlArtifacts([flow.model])[0]! };
  const feasibilitySnapshot = buildFeasibilitySnapshot(seed, requirementSnapshot, businessFlow);
  const designSnapshot = buildDesignSnapshot(seed, requirementSnapshot);
  
  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    backgroundKey: seed.backgroundKey,
    requirementSnapshot,
    feasibilitySnapshot,
    businessFlow,
    designSnapshot,
    
  };
}

function buildRequirementSnapshot(seed: CaseSeed): RunSnapshot {
  const runId = `${seed.id}-requirements`;
  const rules = buildRules(seed);
  const baseline = buildRequirementBaseline(seed, runId, rules);
  const models = buildRequirementModels(seed);
  return runSnapshotSchema.parse({
    runId,
    requirementText: seed.requirementText,
    selectedDiagrams: requirementDiagrams,
    requestedDiagrams: requirementDiagrams,
    rules,
    requirementBaseline: baseline,
    coverageMatrix: null,
    traceabilityMatrix: null,
    models,
    requirementModelTraceability: buildRequirementTraceability(seed),
    plantUml: buildRequirementPlantUml(seed),
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
  });
}

function buildFeasibilitySnapshot(
  seed: CaseSeed,
  requirementSnapshot: RunSnapshot,
  businessFlow: FeasibilityBusinessFlow,
): FeasibilityRunSnapshot {
  const requirementSource = buildAcceptedRequirementSnapshot(
    requirementSnapshot.rules,
    requirementSnapshot.requirementBaseline,
  );
  const ruleIds = requirementSource.snapshot.ruleIds;
  const primaryRuleId = `${seed.id}-R1`;
  const reviewerRuleId = `${seed.id}-R3`;
  const integrationRuleId = `${seed.id}-R4`;
  const contextModel = contextDiagramSpecSchema.parse({
    diagramKind: "context",
    modelId: "context",
    title: `${seed.title}系统上下文`,
    summary: `明确${seed.actors[0]}、${seed.actors[1]}、${seed.externalSystem}与${seed.title}的业务边界。`,
    notes: ["案例上下文只引用已确认需求规则，外部集成与实现方案保持一致。"],
    system: {
      id: "system",
      name: seed.title,
      description: seed.description,
      sourceRequirementIds: [],
    },
    people: [
      {
        id: "person-primary",
        name: seed.actors[0],
        description: `${seed.secondaryAction}并${seed.primaryAction}`,
        sourceRequirementIds: [primaryRuleId],
      },
      {
        id: "person-reviewer",
        name: seed.actors[1],
        description: seed.approvalAction,
        sourceRequirementIds: [reviewerRuleId],
      },
    ],
    externalSystems: [{
      id: "external-main",
      name: seed.externalSystem,
      description: seed.notificationRule,
      sourceRequirementIds: [integrationRuleId],
    }],
    relationships: [
      {
        id: "context-rel-primary",
        sourceId: "person-primary",
        targetId: "system",
        direction: "directed",
        label: seed.primaryAction,
        description: `${seed.actors[0]}通过系统完成${seed.primaryAction}`,
        sourceRequirementIds: [primaryRuleId],
      },
      {
        id: "context-rel-reviewer",
        sourceId: "person-reviewer",
        targetId: "system",
        direction: "directed",
        label: seed.approvalAction,
        description: `${seed.actors[1]}通过系统完成${seed.approvalAction}`,
        sourceRequirementIds: [reviewerRuleId],
      },
      {
        id: "context-rel-external",
        sourceId: "system",
        targetId: "external-main",
        direction: "directed",
        label: seed.notificationRule,
        description: `系统调用${seed.externalSystem}完成外部协作`,
        sourceRequirementIds: [integrationRuleId],
      },
    ],
  });
  const contextTraceability: ContextTraceRow[] = [
    {
      requirementId: primaryRuleId,
      targetId: "person-primary",
      targetKind: "person",
      targetLabel: seed.actors[0],
    },
    {
      requirementId: reviewerRuleId,
      targetId: "person-reviewer",
      targetKind: "person",
      targetLabel: seed.actors[1],
    },
    {
      requirementId: integrationRuleId,
      targetId: "external-main",
      targetKind: "external-system",
      targetLabel: seed.externalSystem,
    },
    ...contextModel.relationships.map((relationship) => ({
      requirementId: relationship.sourceRequirementIds[0]!,
      targetId: relationship.id,
      targetKind: "relationship" as const,
      targetLabel: relationship.label,
    })),
  ];
  const inputs = feasibilityInputsSchema.parse({
    projectName: seed.title,
    expectedUsers: seed.actors.join("、"),
    targetEnvironment: "课程实验与小型团队部署环境",
    expectedLifetimeYears: 3,
    teamSize: 4,
    teamSkills: "TypeScript、React、关系型数据库与基础运维",
    availableResources: "案例模板假设具备基础开发、测试和部署资源",
    references: "成本、收益和周期均为预置估算，需结合实际项目确认",
    analysisYears: 3,
  });
  const implementationPlan = completeFeasibilityImplementationPlanSchema.parse({
    ...FEASIBILITY_IMPLEMENTATION_EXAMPLE,
    overview: `基于${seed.title}同一份已确认需求和系统上下文，比较两套完整实施方案。`,
    candidates: FEASIBILITY_IMPLEMENTATION_EXAMPLE.candidates.map(
      (candidate, index) => {
        const candidateId = `${seed.id}-candidate-${index + 1}`;
        const implementation = candidate.implementation;
        return {
          ...candidate,
          id: candidateId,
          name: index === 0 ? "模块化单体实施方案" : "托管服务实施方案",
          summary: index === 0
            ? `以模块化单体承载${seed.statusEntity}主流程和外部通知集成。`
            : `以托管服务组合承载${seed.statusEntity}主流程和外部通知集成。`,
          estimatedSchedule: index === 0 ? "预计 8–12 周" : "预计 6–10 周",
          sourceRequirementIds: ruleIds,
          assumption: "",
          implementation: {
            ...implementation,
            architecture: {
              summary: index === 0
                ? `采用模块化单体划分${seed.statusEntity}、规则和通知能力。`
                : `采用托管服务与轻量业务层组合${seed.statusEntity}、规则和通知能力。`,
              modules: implementation.architecture.modules.map((module) => ({
                ...module,
                id: `${candidateId}-module-main`,
                name: `${seed.statusEntity}业务模块`,
                responsibility: `${seed.secondaryAction}、${seed.primaryAction}、${seed.approvalAction}`,
                sourceRequirementIds: [
                  `${seed.id}-R1`,
                  `${seed.id}-R2`,
                  `${seed.id}-R3`,
                ],
                assumption: "",
              })),
            },
            dataStrategy: {
              ...implementation.dataStrategy,
              summary: `围绕${seed.entityNames.join("、")}保存状态和操作记录。`,
              sourceRequirementIds: [`${seed.id}-R2`],
              assumption: "",
            },
            integrations: [{
              id: `${candidateId}-integration-main`,
              name: seed.externalSystem,
              responsibility: seed.notificationRule,
              contextExternalSystemId: "external-main",
              sourceRequirementIds: [integrationRuleId],
              assumption: "",
              provenance: "ai-estimate",
            }],
            integrationRationale: `已确认需求要求对接${seed.externalSystem}，并引用上下文中的 external-main。`,
            deploymentAndOperations: {
              ...implementation.deploymentAndOperations,
              summary: index === 0
                ? "单应用容器化部署并配置日志、备份和健康检查。"
                : "托管运行环境部署并配置日志、备份和健康检查。",
            },
            milestones: implementation.milestones.map((milestone) => ({
              ...milestone,
              id: `${candidateId}-milestone-main`,
              name: `${seed.title}核心流程交付`,
              deliverables: [
                `${seed.dashboardTitle}可运行版本`,
                `${seed.externalSystem}集成验证`,
              ],
              acceptanceCriteria: ruleIds.map((ruleId) => `${ruleId} 对应规则通过验收`),
              sourceRequirementIds: ruleIds,
              assumption: "",
            })),
            absenceDeclarations: implementation.absenceDeclarations.filter(
              (declaration) => declaration.scope !== "integrations",
            ),
            risks: implementation.risks.map((risk, riskIndex) => ({
              ...risk,
              id: `${candidateId}-risk-${riskIndex + 1}`,
            })),
          },
        };
      },
    ),
    recommendedCandidateId: `${seed.id}-candidate-1`,
    recommendationRationale:
      "在案例假设下，模块化单体方案的边界更清晰、教学部署复杂度更低；真实项目仍需复核预算、团队能力和合规约束。",
  });
  const contextPlantUml: PlantUmlArtifact = {
    diagramKind: "context",
    modelId: "context",
    source: `@startuml\nleft to right direction\nactor "${seed.actors[0]}" as Primary\nactor "${seed.actors[1]}" as Reviewer\nrectangle "${seed.title}" as System\ncloud "${seed.externalSystem}" as External\nPrimary --> System : ${seed.primaryAction}\nReviewer --> System : ${seed.approvalAction}\nSystem --> External : ${seed.notificationRule}\n@enduml`,
  };
  const contextFingerprint = requirementSource.snapshot.fingerprint;
  const implementationFingerprint = buildFeasibilityImplementationFingerprint({
    rules: requirementSource.rules,
    requirementBaseline: requirementSource.baseline,
    contextModel,
    businessFlow,
    inputs,
  });

  return feasibilityRunSnapshotSchema.parse({
    runId: `${seed.id}-feasibility`,
    projectId: `case-template-${seed.id}`,
    selectedArtifacts: ["context", "business-flow", "implementation"],
    providerSettings: {
      providerConfigId: "case-template",
      model: "case-template",
    },
    rules: requirementSource.rules,
    requirementBaseline: requirementSource.baseline,
    requirementSource: requirementSource.snapshot,
    inputs,
    contextModel,
    contextTraceability,
    contextPlantUml,
    contextSvg: null,
    implementationPlan,
    contextFingerprint,
    implementationFingerprint,
    generationDiagnostics: null,
    currentStage: null,
    status: "completed",
    error: null,
  });
}

function buildDesignSnapshot(seed: CaseSeed, requirementSnapshot: RunSnapshot): DesignRunSnapshot {
  const models = buildDesignModels(seed);
  return designRunSnapshotSchema.parse({
    runId: `${seed.id}-design`,
    requirementText: seed.requirementText,
    selectedDiagrams: designDiagrams,
    requestedDiagrams: designDiagrams,
    rules: requirementSnapshot.rules,
    requirementBaseline: requirementSnapshot.requirementBaseline,
    coverageMatrix: null,
    traceabilityMatrix: null,
    requirementModels: requirementSnapshot.models,
    requirementModelTraceability: requirementSnapshot.requirementModelTraceability,
    models,
    designModelTraceability: buildDesignTraceability(seed),
    plantUml: buildDesignPlantUml(seed),
    svgArtifacts: [],
    diagramErrors: {},
    designTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
  });
}



function buildRules(seed: CaseSeed): RequirementRule[] {
  return [
    {
      id: `${seed.id}-R1`,
      category: "功能需求",
      text: `${seed.actors[0]}可以${seed.secondaryAction}并${seed.primaryAction}。`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["usecase", "activity"],
    },
    {
      id: `${seed.id}-R2`,
      category: "业务规则",
      text: `系统必须维护${seed.statusEntity}状态，状态包括${seed.states.join("、")}。`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["class", "activity"],
    },
    {
      id: `${seed.id}-R3`,
      category: "功能需求",
      text: `${seed.actors[1]}可以${seed.approvalAction}。`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["usecase", "activity"],
    },
    {
      id: `${seed.id}-R4`,
      category: "外部接口",
      text: `系统需要对接${seed.externalSystem}，${seed.notificationRule}`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["deployment", "activity"],
    },
    {
      id: `${seed.id}-R5`,
      category: "界面需求",
      text: `系统需要提供${seed.dashboardTitle}，集中展示关键数据、待处理事项和状态分布。`,
      sourceFragment: seed.requirementText,
      relatedDiagrams: ["prototype", "usecase"],
    },
  ];
}

function buildRequirementBaseline(
  seed: CaseSeed,
  runId: string,
  rules: RequirementRule[],
): RequirementBaseline {
  const requirements = rules.map((rule, index) => ({
    id: `${seed.id}-REQ-${index + 1}`,
    sourceFragment: rule.text,
    type: requirementTypeForRule(index),
    actor: index === 3 ? "系统" : seed.actors[Math.min(index, 1)],
    subject: seed.title,
    action: rule.text,
    object: seed.entityNames[Math.min(index, 2)],
    condition: index === 3 ? `需要触发${seed.externalSystem}` : null,
    outcome: index === 4 ? `展示${seed.dashboardTitle}` : "形成可追踪业务结果",
    confidence: 0.96,
    status: "accepted",
    criticality: index < 3 ? "high" : "medium",
    acceptanceCriteria: [`当执行“${rule.text}”时，系统给出明确状态和结果。`],
    fieldProvenance: {},
    priority: index < 3 ? "must" : "should",
    sourceRuleId: rule.id,
  })) satisfies AtomicRequirement[];
  return {
    runId,
    sourceDocumentId: `${seed.id}-source`,
    requirements,
    assumptions: [
      {
        id: `${seed.id}-A1`,
        text: "案例模板采用单组织、单租户教学演示边界。",
        rationale: "营销案例需要稳定展示完整链路，不引入课程组织绑定。",
        confidence: 0.9,
        status: "accepted",
      },
    ],
    conflicts: [],
    qualityReport: {
      runId,
      status: "passed",
      summary: `已建立 ${requirements.length} 条${seed.title}原子需求基线。`,
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
    createdAt: generatedAt,
  };
}

function requirementTypeForRule(index: number): AtomicRequirement["type"] {
  if (index === 1) return "business-rule";
  if (index === 3) return "interface";
  return "functional";
}

function buildRequirementModels(seed: CaseSeed): DiagramModelSpec[] {
  return [
    {
      diagramKind: "usecase",
      title: `${seed.title}用例模型`,
      summary: `覆盖${seed.actors.join("、")}围绕${seed.statusEntity}的核心交互。`,
      notes: ["营销案例模板生成，适合课程实验快速浏览。"],
      actors: [
        { id: "actor-primary", name: seed.actors[0], actorType: "human", responsibilities: [seed.primaryAction] },
        { id: "actor-reviewer", name: seed.actors[1], actorType: "human", responsibilities: [seed.approvalAction] },
        { id: "actor-external", name: seed.actors[2], actorType: "external", responsibilities: [seed.notificationRule] },
      ],
      useCases: [
        {
          id: "uc-main",
          name: seed.primaryAction,
          systemBoundaryId: "boundary-main",
          goal: `${seed.actors[0]}完成${seed.primaryAction}`,
          preconditions: [`${seed.entityNames[0]}可用`],
          postconditions: [`${seed.statusEntity}进入${seed.states[1]}`],
          primaryActorId: "actor-primary",
          supportingActorIds: ["actor-reviewer"],
          eventFlows: [
            {
              id: "flow-main",
              name: "主成功场景",
              flowType: "main",
              steps: [
                { order: 1, actor: "actor", actorAction: seed.secondaryAction, sourceRequirementId: `${seed.id}-R1` },
                { order: 2, actor: "system", systemAction: `展示${seed.entityNames[0]}状态` },
                { order: 3, actor: "actor", actorAction: seed.primaryAction },
                { order: 4, actor: "system", systemAction: `生成${seed.statusEntity}` },
              ],
            },
          ],
        },
        {
          id: "uc-review",
          name: seed.approvalAction,
          systemBoundaryId: "boundary-main",
          goal: `${seed.actors[1]}处理${seed.statusEntity}`,
          preconditions: [`${seed.statusEntity}为${seed.states[1]}`],
          postconditions: [`${seed.statusEntity}进入${seed.states[2]}或${seed.states[3]}`],
          primaryActorId: "actor-reviewer",
          supportingActorIds: ["actor-external"],
          eventFlows: [],
        },
      ],
      systemBoundaries: [{ id: "boundary-main", name: seed.title, description: seed.description }],
      relationships: [
        { id: "rel-1", type: "association", sourceId: "actor-primary", targetId: "uc-main" },
        { id: "rel-2", type: "association", sourceId: "actor-reviewer", targetId: "uc-review" },
        { id: "rel-3", type: "association", sourceId: "uc-review", targetId: "actor-external", label: "通知" },
      ],
    },
    {
      diagramKind: "class",
      modelId: "class:requirement",
      title: `${seed.title}领域类模型`,
      summary: `沉淀${seed.entityNames.join("、")}及其关系。`,
      notes: ["字段以教学案例最小闭环为准。"],
      classes: seed.entityNames.map((name, index) => ({
        id: `c-${index + 1}`,
        name,
        constraints: [],
        classKind: index === 1 ? "aggregate" : "entity",
        attributes: [
          { name: "id", type: "string", visibility: "private", required: true, constraints: [] },
          { name: "status", type: "string", visibility: "private", required: index === 1, constraints: [] },
        ],
        operations: [],
      })),
      interfaces: [],
      enums: [{ id: "enum-status", name: `${seed.statusEntity}状态`, literals: [...seed.states] }],
      relationships: [
        { id: "class-rel-1", type: "association", sourceId: "c-1", targetId: "c-2", targetMultiplicity: "*" },
        { id: "class-rel-2", type: "association", sourceId: "c-2", targetId: "c-3", targetMultiplicity: "*" },
      ],
    },
    {
      diagramKind: "activity",
      modelId: "activity:requirement",
      title: `${seed.title}业务活动模型`,
      summary: `描述从${seed.secondaryAction}到${seed.notificationRule}的闭环。`,
      notes: ["已覆盖正常和异常状态分支。"],
      swimlanes: seed.actors.map((actor, index) => ({ id: `lane-${index + 1}`, name: actor })),
      nodes: [
        { id: "start", type: "start", name: "开始" },
        { id: "act-query", type: "activity", name: seed.secondaryAction, actorOrLane: "lane-1", input: [], output: [seed.entityNames[0]] },
        { id: "act-submit", type: "activity", name: seed.primaryAction, actorOrLane: "lane-1", input: [seed.entityNames[0]], output: [seed.statusEntity] },
        { id: "act-review", type: "activity", name: seed.approvalAction, actorOrLane: "lane-2", input: [seed.statusEntity], output: [seed.states[2]] },
        { id: "act-notify", type: "activity", name: seed.notificationRule, actorOrLane: "lane-3", input: [seed.statusEntity], output: [seed.entityNames[2]] },
        { id: "end", type: "end", name: "结束" },
      ],
      relationships: [
        { id: "flow-1", type: "control_flow", sourceId: "start", targetId: "act-query" },
        { id: "flow-2", type: "control_flow", sourceId: "act-query", targetId: "act-submit" },
        { id: "flow-3", type: "control_flow", sourceId: "act-submit", targetId: "act-review" },
        { id: "flow-4", type: "control_flow", sourceId: "act-review", targetId: "act-notify" },
        { id: "flow-5", type: "control_flow", sourceId: "act-notify", targetId: "end" },
      ],
    },
  ];
}

function buildRequirementTraceability(seed: CaseSeed) {
  return [
    {
      ruleId: `${seed.id}-R1`,
      target: { diagramKind: "usecase", elementId: "uc-main", elementKind: "useCase", label: seed.primaryAction },
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "high",
      rationale: "核心提交动作映射到主用例。",
    },
    {
      ruleId: `${seed.id}-R2`,
      target: { modelId: "class:requirement", diagramKind: "class", elementId: "enum-status", elementKind: "enum", label: `${seed.statusEntity}状态` },
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "high",
      rationale: "状态规则映射到领域枚举。",
    },
    {
      ruleId: `${seed.id}-R4`,
      target: { modelId: "activity:requirement", diagramKind: "activity", elementId: "act-notify", elementKind: "activity", label: seed.notificationRule },
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "medium",
      rationale: "外部通知规则映射到通知活动。",
    },
  ];
}

function buildDesignModels(seed: CaseSeed): DesignDiagramModelSpec[] {
  return [
    {
      diagramKind: "architecture",
      modelId: "architecture-main",
      title: `${seed.title}分层架构`,
      summary: "前端原型、业务服务、数据存储和外部系统分层。",
      notes: ["案例模板采用浏览器端模拟数据。"],
      packages: [
        { id: "pkg-ui", name: "界面层" },
        { id: "pkg-domain", name: "业务层" },
      ],
      components: [
        { id: "cmp-app", name: seed.dashboardTitle, componentType: "React Page", packageId: "pkg-ui", sourceRequirementIds: [`${seed.id}-R5`] },
        { id: "cmp-service", name: `${seed.statusEntity}服务`, componentType: "Domain Service", packageId: "pkg-domain", sourceRequirementIds: [`${seed.id}-R2`] },
        { id: "cmp-external", name: seed.externalSystem, componentType: "External Adapter", sourceRequirementIds: [`${seed.id}-R4`] },
      ],
      relationships: [
        { id: "arch-rel-1", type: "dependency", sourceId: "cmp-app", targetId: "cmp-service" },
        { id: "arch-rel-2", type: "communication", sourceId: "cmp-service", targetId: "cmp-external" },
      ],
    },
    {
      diagramKind: "sequence",
      modelId: "sequence-main",
      sourceUseCaseId: "uc-main",
      sourceUseCaseName: seed.primaryAction,
      title: `${seed.primaryAction}时序设计`,
      summary: `从界面提交到状态变更和${seed.externalSystem}通知。`,
      notes: ["用于指导 React 原型交互。"],
      participants: [
        { id: "p-actor", name: seed.actors[0], participantType: "actor" },
        { id: "p-page", name: seed.dashboardTitle, participantType: "boundary" },
        { id: "p-service", name: `${seed.statusEntity}服务`, participantType: "service" },
        { id: "p-external", name: seed.externalSystem, participantType: "external" },
      ],
      messages: [
        { id: "msg-1", type: "sync", sourceId: "p-actor", targetId: "p-page", name: seed.primaryAction, parameters: [] },
        { id: "msg-2", type: "sync", sourceId: "p-page", targetId: "p-service", name: "createOrUpdate", parameters: [seed.statusEntity] },
        { id: "msg-3", type: "async", sourceId: "p-service", targetId: "p-external", name: "notify", parameters: [seed.notificationRule] },
      ],
      fragments: [],
    },
    {
      diagramKind: "class",
      modelId: "class-design",
      title: `${seed.title}设计类图`,
      summary: "将领域对象拆分为页面状态、服务和数据记录。",
      notes: ["与代码中的 mock 数据结构保持一致。"],
      classes: [
        { id: "d-record", name: `${seed.statusEntity}Record`, constraints: [], classKind: "entity", attributes: [{ name: "status", type: "string", visibility: "private", required: true, constraints: [] }], operations: [] },
        { id: "d-service", name: `${seed.statusEntity}Service`, constraints: [], classKind: "service", attributes: [], operations: [{ name: "transition", returnType: "Record", visibility: "public", parameters: [{ name: "nextStatus", type: "string" }] }] },
        { id: "d-page", name: "DashboardState", constraints: [], classKind: "valueObject", attributes: [{ name: "selectedStatus", type: "string", visibility: "private", constraints: [] }], operations: [] },
      ],
      interfaces: [],
      enums: [{ id: "d-status", name: `${seed.statusEntity}Status`, literals: [...seed.states] }],
      relationships: [
        { id: "d-class-rel-1", type: "dependency", sourceId: "d-page", targetId: "d-service" },
        { id: "d-class-rel-2", type: "association", sourceId: "d-service", targetId: "d-record" },
      ],
    },
    {
      diagramKind: "table",
      modelId: "table-design",
      title: `${seed.title}数据表设计`,
      summary: `围绕${seed.entityNames[0]}、${seed.statusEntity}和${seed.entityNames[2]}组织存储。`,
      notes: ["案例模板使用前端 mock 数据，表结构用于教学说明。"],
      tables: [
        {
          relationalConstraints: [{ id: "pk-resource", type: "primary-key", columnIds: ["col-resource-id"] }],
          id: "tbl-resource",
          name: "resources",
          chineseName: seed.entityNames[0],
          constraints: [],
          columns: [
            { id: "col-resource-id", name: "id", constraints: [], dataType: "varchar(36)", isPrimaryKey: true, isForeignKey: false, nullable: false },
            { id: "col-resource-name", name: "name", constraints: [], dataType: "varchar(120)", isPrimaryKey: false, isForeignKey: false, nullable: false },
          ],
        },
        {
          relationalConstraints: [{ id: "pk-request", type: "primary-key", columnIds: ["col-request-id"] }, { id: "fk-resource", type: "foreign-key", columnIds: ["col-request-resource-id"], referenceTableId: "tbl-resource", referenceColumnIds: ["col-resource-id"] }],
          id: "tbl-request",
          name: "requests",
          chineseName: seed.statusEntity,
          constraints: [],
          columns: [
            { id: "col-request-id", name: "id", constraints: [], dataType: "varchar(36)", isPrimaryKey: true, isForeignKey: false, nullable: false },
            { id: "col-request-status", name: "status", constraints: [], dataType: "varchar(32)", isPrimaryKey: false, isForeignKey: false, nullable: false },
            { id: "col-request-resource-id", name: "resource_id", constraints: [], dataType: "varchar(36)", isPrimaryKey: false, isForeignKey: true, nullable: false, references: { tableId: "tbl-resource", columnId: "col-resource-id" } },
          ],
        },
      ],
      relationships: [
        { id: "table-rel-1", type: "one-to-many", sourceTableId: "tbl-resource", targetTableId: "tbl-request", label: "资源关联申请" },
      ],
    },
  ];
}

function buildDesignTraceability(seed: CaseSeed) {
  return [
    {
      source: { diagramKind: "usecase", elementId: "uc-main", elementKind: "useCase", label: seed.primaryAction },
      targets: [{ modelId: "sequence-main", diagramKind: "sequence", elementId: "msg-1", elementKind: "message", label: seed.primaryAction }],
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "high",
      rationale: "主用例落到时序入口消息。",
    },
    {
      source: { modelId: "class:requirement", diagramKind: "class", elementId: "enum-status", elementKind: "enum", label: `${seed.statusEntity}状态` },
      targets: [
        { modelId: "class-design", diagramKind: "class", elementId: "d-status", elementKind: "enum", label: `${seed.statusEntity}Status` },
        { modelId: "table-design", diagramKind: "table", elementId: "tbl-request", elementKind: "table", label: seed.statusEntity },
      ],
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "high",
      rationale: "领域状态进入设计类和数据表。",
    },
    {
      source: { modelId: "activity:requirement", diagramKind: "activity", elementId: "act-notify", elementKind: "activity", label: seed.notificationRule },
      targets: [{ modelId: "architecture-main", diagramKind: "architecture", elementId: "cmp-external", elementKind: "component", label: seed.externalSystem }],
      mappingSource: "llm",
      reviewStatus: "confirmed",
      confidence: "medium",
      rationale: "通知活动映射到外部系统适配组件。",
    },
  ];
}

function buildRequirementPlantUml(seed: CaseSeed): PlantUmlArtifact[] {
  return [
    {
      diagramKind: "usecase",
      source: `@startuml\nleft to right direction\nactor "${seed.actors[0]}" as Primary\nactor "${seed.actors[1]}" as Reviewer\nrectangle "${seed.title}" {\n  usecase "${seed.primaryAction}" as UC1\n  usecase "${seed.approvalAction}" as UC2\n}\nPrimary --> UC1\nReviewer --> UC2\n@enduml`,
    },
    {
      diagramKind: "class",
      modelId: "class:requirement",
      source: `@startuml\nclass "${seed.entityNames[0]}"\nclass "${seed.statusEntity}" {\n  status\n}\nclass "${seed.entityNames[2]}"\n"${seed.entityNames[0]}" --> "${seed.statusEntity}"\n"${seed.statusEntity}" --> "${seed.entityNames[2]}"\n@enduml`,
    },
    {
      diagramKind: "activity",
      modelId: "activity:requirement",
      source: `@startuml\nstart\n:${seed.secondaryAction};\n:${seed.primaryAction};\n:${seed.approvalAction};\n:${seed.notificationRule};\nstop\n@enduml`,
    },
  ];
}

function buildDesignPlantUml(seed: CaseSeed): DesignPlantUmlArtifact[] {
  return [
    {
      diagramKind: "architecture",
      modelId: "architecture-main",
      source: `@startuml\npackage "界面层" {\n  component "${seed.dashboardTitle}" as UI\n}\npackage "业务层" {\n  component "${seed.statusEntity}服务" as SVC\n}\ncloud "${seed.externalSystem}" as EXT\nUI --> SVC\nSVC --> EXT\n@enduml`,
    },
    {
      diagramKind: "sequence",
      modelId: "sequence-main",
      source: `@startuml\nactor "${seed.actors[0]}" as A\nboundary "${seed.dashboardTitle}" as UI\ncontrol "${seed.statusEntity}服务" as SVC\nentity "${seed.externalSystem}" as EXT\nA -> UI: ${seed.primaryAction}\nUI -> SVC: createOrUpdate()\nSVC -> EXT: notify()\n@enduml`,
    },
    {
      diagramKind: "class",
      modelId: "class-design",
      source: `@startuml\nclass "${seed.statusEntity}Record" as Record {\n  status\n}\nclass "${seed.statusEntity}Service" as Service {\n  transition(nextStatus)\n}\nclass "DashboardState" as DashboardState {\n  selectedStatus\n}\nDashboardState --> Service\nService --> Record\n@enduml`,
    },
    {
      diagramKind: "table",
      modelId: "table-design",
      source: `@startuml\nentity resources {\n  * id\n  name\n}\nentity requests {\n  * id\n  status\n  resource_id\n}\nresources ||--o{ requests\n@enduml`,
    },
  ];
}






