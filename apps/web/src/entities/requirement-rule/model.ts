// Provides labels for the single requirement type used by forms and fixed model routing.
import type { RequirementRule as ContractRequirementRule, RequirementRuleType } from "@uml-platform/contracts";
import type { TFunction } from "i18next";

export const REQUIREMENT_KIND_ORDER: RequirementRuleType[] = ["business-rule", "functional", "data", "interaction", "interface", "exception", "quality", "operations"];
export const REQUIREMENT_KIND_LABELS: Record<RequirementRuleType, string> = { functional: "功能需求", "business-rule": "业务规则", data: "数据需求", interaction: "界面交互", interface: "外部接口", exception: "异常处理", quality: "质量需求", operations: "部署运行" };
export function getRuleDisplayLabel(rule: ContractRequirementRule, t?: TFunction) {
  return t ? t(`requirementSemantics.kinds.${rule.type}`) : REQUIREMENT_KIND_LABELS[rule.type];
}
export type RequirementRule = ContractRequirementRule;
