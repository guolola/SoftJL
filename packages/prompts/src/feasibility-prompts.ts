// Builds strict JSON prompts for feasibility context and implementation stages.
import type { ContextDiagramSpec, FeasibilityInputs, FeasibilityBusinessFlow, RequirementRule } from "@uml-platform/contracts";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "./feasibility-example.js";
import { getModelReviewProfile } from "@uml-platform/contracts";
import { compactPromptRules, compactPromptTraceability } from "./prompt-context.js";
import { GENERATION_BUSINESS_SELF_CHECK, modelGenerationSelfCheck } from "./generation-self-check.js";

const JSON_ONLY = "只返回一个 JSON 对象，不要 Markdown、代码围栏或解释文字。";

export const FEASIBILITY_CONTEXT_INSTRUCTION = "请根据下方需求规则和补充资料，识别目标系统、外部参与者及其信息交互，生成可行性分析阶段的系统环境图。使用 JSON 描述系统边界、人员、外部系统及交互关系。";
export const FEASIBILITY_IMPLEMENTATION_INSTRUCTION = "请根据下方需求规则、补充资料、系统环境图和业务流程图，生成恰好 2 个可执行的可行性分析候选方案，并给出推荐方案。使用 JSON 描述各候选的实现方案、成本收益估算、风险和可行性结论。";

function sourcePayload(
  rules: RequirementRule[],
  inputs: FeasibilityInputs,
) {
  return JSON.stringify({ rules: compactPromptRules(rules), inputs });
}

export function buildGenerateFeasibilityContextPrompt(input: {
  rules: RequirementRule[];
  inputs: FeasibilityInputs;
}) {
  return `${JSON_ONLY}
${FEASIBILITY_CONTEXT_INSTRUCTION}
直接上游与映射依据：下方输入中的 rules 和 inputs 是本次生成的全部上游资料；rules 提供已确认需求，inputs 提供补充背景与约束。sourceRequirementIds 只能引用本次 rules 中真实存在且支撑对应元素的 id，不能引用补充资料字段名、数组位置或未提供的规则。
仅依据本次输入识别系统边界与外部交互，不读取未提供的需求模型或设计模型。JSON Schema、结构规则和示例只规定表达方式，不是新增业务事实或来源引用的依据；示例中的 R1 必须替换为实际规则 ID。
禁止推测未提供的人员、外部系统、协议、数据库或技术栈；不确定信息应省略。不得按名称相似或轮流分配规则来凑来源覆盖。
title 必须使用“<目标系统名称>系统环境图”格式。
system、所有 people、externalSystems 和 relationships 都必须至少引用一个真实输入 rules.id。
元素 id 和关系 id 必须唯一；关系端点只能引用 system、people 或 externalSystems 中存在的 id。
对应结构规则：
${getModelReviewProfile("feasibility", "context").structure.join("\n")}
${modelGenerationSelfCheck("feasibility", ["context"])}
输出结构：
{"diagramKind":"context","modelId":"context","title":"...","summary":"...","notes":[],"system":{"id":"system","name":"...","description":"...","sourceRequirementIds":["R1"]},"people":[{"id":"person-1","name":"...","description":"...","sourceRequirementIds":["R1"]}],"externalSystems":[],"relationships":[{"id":"relationship-1","sourceId":"person-1","targetId":"system","direction":"directed|bidirectional","label":"...","description":"...","sourceRequirementIds":["R1"]}]}
输入：
${sourcePayload(input.rules, input.inputs)}`;
}

export function buildGenerateFeasibilityImplementationPrompt(input: {
  rules: RequirementRule[];
  inputs: FeasibilityInputs;
  contextModel: ContextDiagramSpec;
  businessFlow: FeasibilityBusinessFlow;
}) {
  return `${JSON_ONLY}
${FEASIBILITY_IMPLEMENTATION_INSTRUCTION}
直接上游与映射依据：下方实际提供的 rules、inputs、contextModel 和 businessFlow 构成本次生成的全部上游资料；不补入其他需求模型、设计模型或未提供的规则。
sourceRequirementIds 只能引用本次 rules 中真实存在且支撑对应条目的 id；contextExternalSystemId 只能引用本次 contextModel.externalSystems 中真实存在的 id。两类引用各自匹配其上游，不得将流程节点 ID、模型 ID、资料字段名或数组位置当成规则 ID，也不得把规则 ID 当成外部系统 ID。
JSON Schema、结构规则和示例只规定表达方式，不是业务事实或映射目标；方案假设与估算不得冒充输入已确认事实，来源关联不得按名称相似、数组位置或轮流分配来猜测。
两个候选都必须包含完整 implementation；recommendedCandidateId 必须引用其中一个候选方案。
${GENERATION_BUSINESS_SELF_CHECK}
contextModel 确定系统边界、参与者和外部集成；businessFlow.model 的泳道、活动、条件分支和关系确定业务顺序、人员职责与系统处理，businessFlow.traceability 说明需求来源。两份候选均须围绕该流程推导模块职责、业务异常风险和里程碑验收条件。
人员泳道中的人工动作不得无依据改为系统自动执行；系统泳道中的处理和已确认的分支条件不得遗漏或改变。沿用流程追踪中的需求规则编号，禁止把流程节点编号当成 sourceRequirementIds。需求规则是事实依据；发现图与规则不一致时，在方案假设、风险和 preconditions 中明确需要确认的问题。
学校、学院、成员、提出者、真实预算和法律事实只能使用输入资料，禁止编造。实现成本、收益和分析年限允许生成合理估算，但必须标记为 ai-estimate，并写明估算依据、置信度或方案假设，不得冒充用户确认事实。
每个候选必须至少有 1 条优势和 1 条不足。每个 implementation 必须完整包含 architecture、dataStrategy、integrations、integrationRationale、deploymentAndOperations、securityAndCompliance、milestones、analysisPeriodAssumption、costEstimates、benefitEstimates、absenceDeclarations、risks、verdicts、decision 和 preconditions。
costEstimates、benefitEstimates 不得为空；risks 必须为 3 到 5 项；每个里程碑必须有交付物、角色和验收条件。
成本估算使用 CNY 区间，minimum 不得大于 maximum；成本类别只能是 capital、other-one-time、recurring。收益类别只能是 one-time、recurring、intangible；不可计量收益的 range 必须为 null，其余收益必须有金额区间。
integrations 只能引用当前 contextModel.externalSystems 中真实存在的元素，每项必须使用 responsibility 描述集成职责，并在 contextExternalSystemId 中填写该外部系统 id。上下文没有外部系统时 integrations 必须为空，并在 integrationRationale 和 scope=integrations 的 absenceDeclaration 中说明原因。
如果确实没有里程碑依赖或某一成本收益类别，不得虚构条目：在 dependencyRationale 或 absenceDeclarations 中返回明确原因。
verdicts 必须且只能包含 technical、operational、schedule、economic、legal 五类各一次。所有候选、implementation、模块、数据策略、集成、部署、安全、里程碑、成本、收益、风险、缺省结论和五类结论的 provenance 均使用 ai-estimate。
首次生成时，每个候选方案、业务模块和外部集成都必须在 sourceRequirementIds 中携带至少一个真实输入 rules.id，不得以方案假设代替来源。所有带 id 的元素（含里程碑、风险、成本与收益估算）也必须至少引用一个真实上游规则 ID，不得遗漏或虚构编号。示例中的 R1 仅说明结构，实际输出必须替换为本次输入中的真实规则 ID。
每个 costEstimate 必须包含 id、name、category、frequency、range、note、sourceRequirementIds、assumption、provenance；range 必须包含 minimum、maximum、currency、basis、confidence。
每个 benefitEstimate 必须包含 id、name、category、frequency、range、outcome、sourceRequirementIds、assumption、provenance。
absenceDeclarations 的每一项必须完整包含 scope、reason、provenance；scope 只能使用 integrations、dependencies、capital-costs、other-one-time-costs、recurring-costs、one-time-benefits、recurring-benefits、intangible-benefits。
只有对应条目确实不存在时才能输出 absenceDeclaration；已有该类成本或收益条目时，禁止再声明该类不存在，scope 也不得重复。
经济分析仅使用 analysisPeriodAssumption、costEstimates、benefitEstimates、absenceDeclarations，不输出旧版摘要字段。
输出必须是完整 JSON，第二个候选不得使用省略号、引用第一个候选或省略任何字段。
严格沿用以下对象形状；示例只展示一个候选的完整结构，实际必须生成两份完整候选。所有数组中的结构项都必须是对象，禁止把模块、里程碑、风险或结论简写成字符串。示例金额和方案内容不是输入事实，实际输出必须根据输入重新估算：
${JSON.stringify({ ...FEASIBILITY_IMPLEMENTATION_EXAMPLE, candidates: FEASIBILITY_IMPLEMENTATION_EXAMPLE.candidates.slice(0, 1) })}
输入：
${JSON.stringify({ rules: compactPromptRules(input.rules), inputs: input.inputs, contextModel: input.contextModel, businessFlow: { model: input.businessFlow.model, traceability: compactPromptTraceability(input.businessFlow.traceability) } })}`;
}
