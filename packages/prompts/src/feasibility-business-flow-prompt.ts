// Defines a rule-driven, high-level activity workflow independent of later requirement models.
import { requirementBaselinePromptContext } from "@uml-platform/contracts";
import type { RequirementBaseline, RequirementRule } from "@uml-platform/contracts";
import { getModelReviewProfile } from "@uml-platform/contracts";

export function buildGenerateFeasibilityBusinessFlowPrompt(input: {
  rules: RequirementRule[];
  requirementBaseline: RequirementBaseline | null;
}) {
  return `只返回一个 JSON 对象，不要 Markdown、代码围栏或解释文字。
根据已确认需求规则生成可行性分析阶段的“业务与系统流程图”，使用一张 UML 泳道活动图展示目标系统参与的核心端到端业务流程。
这是需求规则驱动的业务流程，不是技术调用时序、页面跳转或实现方案；不依赖已生成的需求模型。
按责任主体划分泳道：目标系统泳道 id 固定为 system，人员和外部系统仅在需求明确提到时添加。每个 activity 的 actorOrLane 必须引用泳道 id。
明确区分人员执行的业务动作与目标系统的自动处理。保留规则中的条件、阈值、顺序、失败/拒绝/重试路径，不能把“超过”改成“大于等于”。不添加需求没有规定的登录、审批、支付、通知、数据库或接口。
平台高层业务流程约定（非 UML 标准的普遍限制）：全图必须恰有一个 start、至少一个 end 和至少一个目标系统 activity；所有节点从 start 可达且可到达 end。条件分支用 decision，至少两条带不同 guard 的出边；需要汇合时用 merge，并行仅在有明确依据时使用 fork/join。所有关系使用 control_flow。
对应结构规则：
${getModelReviewProfile("feasibility", "activity").structure.join("\n")}
不要把互不相关的功能强行串成前后步骤。优先表达核心业务闭环，范围边界和无法确定的步骤在 notes 中注明，不得为了覆盖所有规则而虚构流程。
traceability 中 requirementId 只能取自输入 rules.id；每个 activity 和 decision 至少映射一条规则；每个非 system 泳道也必须映射规则。可追踪关系条件时使用 targetKind=relationship。
modelId 固定为 feasibility-business-flow，title 使用“<系统名称>业务与系统流程图”。严格使用以下对象形状，示例仅说明结构，不是输入事实：
{"model":{"diagramKind":"activity","modelId":"feasibility-business-flow","title":"示例系统业务与系统流程图","summary":"核心业务闭环","notes":[],"swimlanes":[{"id":"system","name":"目标系统"}],"nodes":[{"id":"start","type":"start","name":"开始"},{"id":"process","type":"activity","name":"处理业务","actorOrLane":"system","input":[],"output":[]},{"id":"end","type":"end","name":"结束"}],"relationships":[{"id":"flow-1","type":"control_flow","sourceId":"start","targetId":"process"},{"id":"flow-2","type":"control_flow","sourceId":"process","targetId":"end"}]},"traceability":[{"requirementId":"R1","targetId":"process","targetKind":"node"}]}
输入：
${JSON.stringify({ ...input, requirementBaseline: input.requirementBaseline ? requirementBaselinePromptContext(input.requirementBaseline, true) : null })}`;
}
