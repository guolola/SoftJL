import type {
  RequirementRule as ContractRequirementRule,
  RuleCategory as ContractRuleCategory,
} from "@uml-platform/contracts";

export type RuleCategory = ContractRuleCategory;
export type RequirementRule = ContractRequirementRule;

export const RULE_CATEGORY_ORDER: RuleCategory[] = [
  "业务规则",
  "功能需求",
  "外部接口",
  "界面需求",
  "数据需求",
  "非功能需求",
  "部署需求",
  "异常处理",
];
