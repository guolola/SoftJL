// Builds strict JSON prompts for feasibility context and implementation stages.
import type {
  ContextDiagramSpec,
  FeasibilityInputs,
  FeasibilityBusinessFlow,
  FeasibilityRepairSection,
  RequirementBaseline,
  RequirementRule,
} from "@uml-platform/contracts";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "./feasibility-example.js";
import { getModelReviewProfile } from "@uml-platform/contracts";

const JSON_ONLY = "只返回一个 JSON 对象，不要 Markdown、代码围栏或解释文字。";

function sourcePayload(
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline | null,
  inputs: FeasibilityInputs,
) {
  return JSON.stringify({ rules, requirementBaseline, inputs }, null, 2);
}

export function buildGenerateFeasibilityContextPrompt(input: {
  rules: RequirementRule[];
  requirementBaseline: RequirementBaseline | null;
  inputs: FeasibilityInputs;
}) {
  return `${JSON_ONLY}
根据已确认需求生成系统上下文结构。禁止推测未提供的人员、外部系统、协议、数据库或技术栈；不确定信息应省略。
title 必须使用“<目标系统名称>系统环境图”格式。
所有 people、externalSystems 和 relationships 必须至少引用一个输入 rules.id；system.sourceRequirementIds 必须为空数组。
元素 id 和关系 id 必须唯一；关系端点只能引用 system、people 或 externalSystems 中存在的 id。
对应结构规则：
${getModelReviewProfile("feasibility", "context").structure.join("\n")}
输出结构：
{"diagramKind":"context","modelId":"context","title":"...","summary":"...","notes":[],"system":{"id":"system","name":"...","description":"...","sourceRequirementIds":[]},"people":[{"id":"person-1","name":"...","description":"...","sourceRequirementIds":["R1"]}],"externalSystems":[],"relationships":[{"id":"relationship-1","sourceId":"person-1","targetId":"system","direction":"directed|bidirectional","label":"...","description":"...","sourceRequirementIds":["R1"]}]}
输入：
${sourcePayload(input.rules, input.requirementBaseline, input.inputs)}`;
}

export function buildGenerateFeasibilityImplementationPrompt(input: {
  rules: RequirementRule[];
  requirementBaseline: RequirementBaseline | null;
  inputs: FeasibilityInputs;
  contextModel: ContextDiagramSpec;
  businessFlow: FeasibilityBusinessFlow;
}) {
  return `${JSON_ONLY}
根据系统环境图、业务与系统流程图、需求基线和补充资料生成恰好 2 个可执行候选方案，两个候选都必须包含完整 implementation；recommendedCandidateId 必须引用其中一个候选方案。
contextModel 确定系统边界、参与者和外部集成；businessFlow.model 的泳道、活动、条件分支和关系确定业务顺序、人员职责与系统处理，businessFlow.traceability 说明需求来源。两份候选均须围绕该流程推导模块职责、业务异常风险和里程碑验收条件。
人员泳道中的人工动作不得无依据改为系统自动执行；系统泳道中的处理和已确认的分支条件不得遗漏或改变。沿用流程追踪中的需求规则编号，禁止把流程节点编号当成 sourceRequirementIds。需求规则是事实依据；发现图与规则不一致时，在方案假设、风险和 preconditions 中明确需要确认的问题。
学校、学院、成员、提出者、真实预算和法律事实只能使用输入资料，禁止编造。实现成本、收益和分析年限允许生成合理估算，但必须标记为 ai-estimate，并写明估算依据、置信度或方案假设，不得冒充用户确认事实。
每个候选必须至少有 1 条优势和 1 条不足。每个 implementation 必须完整包含 architecture、dataStrategy、integrations、integrationRationale、deploymentAndOperations、securityAndCompliance、milestones、analysisPeriodAssumption、costEstimates、benefitEstimates、absenceDeclarations、risks、verdicts、decision 和 preconditions。
costEstimates、benefitEstimates 不得为空；risks 必须为 3 到 5 项；每个里程碑必须有交付物、角色和验收条件。
成本估算使用 CNY 区间，minimum 不得大于 maximum；成本类别只能是 capital、other-one-time、recurring。收益类别只能是 one-time、recurring、intangible；不可计量收益的 range 必须为 null，其余收益必须有金额区间。
integrations 只能引用当前 contextModel.externalSystems 中真实存在的元素，每项必须使用 responsibility 描述集成职责，并在 contextExternalSystemId 中填写该外部系统 id。上下文没有外部系统时 integrations 必须为空，并在 integrationRationale 和 scope=integrations 的 absenceDeclaration 中说明原因。
如果确实没有里程碑依赖或某一成本收益类别，不得虚构条目：在 dependencyRationale 或 absenceDeclarations 中返回明确原因。
verdicts 必须且只能包含 technical、operational、schedule、economic、legal 五类各一次。所有候选、implementation、模块、数据策略、集成、部署、安全、里程碑、成本、收益、风险、缺省结论和五类结论的 provenance 均使用 ai-estimate。
所有 sourceRequirementIds 只能引用输入 rules.id；没有直接来源时使用空数组，并在 assumption 中明确记录方案假设，禁止虚构编号。
每个 costEstimate 必须包含 id、name、category、frequency、range、note、sourceRequirementIds、assumption、provenance；range 必须包含 minimum、maximum、currency、basis、confidence。
每个 benefitEstimate 必须包含 id、name、category、frequency、range、outcome、sourceRequirementIds、assumption、provenance。
absenceDeclarations 的每一项必须完整包含 scope、reason、provenance；scope 只能使用 integrations、dependencies、capital-costs、other-one-time-costs、recurring-costs、one-time-benefits、recurring-benefits、intangible-benefits。
只有对应条目确实不存在时才能输出 absenceDeclaration；已有该类成本或收益条目时，禁止再声明该类不存在，scope 也不得重复。
保留旧兼容字段 oneTimeCosts、recurringCosts、quantitativeBenefits、qualitativeBenefits，并根据结构化估算同步生成非空摘要列表。
输出必须是完整 JSON，第二个候选不得使用省略号、引用第一个候选或省略任何字段。
严格沿用以下完整有效对象形状；所有数组中的结构项都必须是对象，禁止把模块、里程碑、风险或结论简写成字符串。示例金额和方案内容不是输入事实，实际输出必须根据输入重新估算：
${JSON.stringify(FEASIBILITY_IMPLEMENTATION_EXAMPLE, null, 2)}
输入：
${JSON.stringify(input, null, 2)}`;
}

export function buildRepairFeasibilityJsonPrompt(input: {
  stage: "context" | "business-flow" | "implementation";
  previousOutput: string;
  error: string;
  originalPrompt: string;
}) {
  if (input.stage === "business-flow") {
    return `${JSON_ONLY}\n仅修复业务与系统流程图的结构、泳道归属、连通性和需求追踪错误，不得编造需求步骤。\n校验错误：${input.error}\n原始任务：${input.originalPrompt}\n待修复输出：${input.previousOutput}`;
  }
  return `${JSON_ONLY}
上一份${input.stage === "context" ? "上下文" : "实现方案"} JSON 不符合契约。只修复校验错误涉及的字段或章节，其余内容必须原样保留。修复结构、引用、枚举值和缺失的必填分析；不得增加输入中不存在的用户事实，但必须补齐契约要求的 AI 估算和明确标注的方案假设。不得把结构对象压缩成字符串，且必须输出 recommendationRationale 与五个带 category 的 verdict 对象。
校验错误：${input.error}
原始任务：${input.originalPrompt}
待修复输出：${input.previousOutput}`;
}

export function buildRepairFeasibilitySectionPrompt(input: {
  candidateIndex: number;
  section: Exclude<FeasibilityRepairSection, "context" | "business-flow" | "plan">;
  currentPlan: unknown;
  issues: string[];
  originalPrompt: string;
}) {
  const sectionFields = {
    technical: "architecture、dataStrategy、integrations、integrationRationale、deploymentAndOperations、securityAndCompliance",
    delivery: "milestones、risks",
    economics: "analysisPeriodAssumption、costEstimates、benefitEstimates、absenceDeclarations、oneTimeCosts、recurringCosts、quantitativeBenefits、qualitativeBenefits",
    verdict: "verdicts、decision、preconditions",
  }[input.section];
  return `${JSON_ONLY}
仅修复候选方案索引 ${input.candidateIndex} 的 ${input.section} 章节。返回：
{"candidateIndex":${input.candidateIndex},"patch":{...}}
patch 必须且只能完整包含这些字段：${sectionFields}。
不得返回完整方案，不得修改其他候选或其他章节，不得增加输入中不存在的需求事实。
校验错误：
${input.issues.join("\n")}
原始任务：
${input.originalPrompt}
当前完整方案（只用于理解上下文）：
${JSON.stringify(input.currentPlan)}`;
}
