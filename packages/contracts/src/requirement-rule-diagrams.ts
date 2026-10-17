// Infers which requirement models a rule feeds from its category and wording, shared by
// rule extraction and manually added rules so both map rules to models the same way.
import type { DiagramKind, RuleCategory } from "./requirements.js";

export function inferRelatedDiagrams(ruleText: string, category: RuleCategory): DiagramKind[] {
  const inferred: DiagramKind[] = [];
  const add = (kind: DiagramKind) => {
    if (!inferred.includes(kind)) inferred.push(kind);
  };

  if (
    category === "功能需求" ||
    /功能|流程|登录|授权|预约|签到|查询|管理|查看|选择|提交|取消|刷新/.test(ruleText)
  ) {
    add("function");
    add("usecase");
    add("activity");
    add("analysis");
  }
  if (
    category === "数据需求" ||
    /座位状态|预约记录|用户身份|用户信息|缓存|数据|记录|状态|时间段/.test(ruleText)
  ) {
    add("class");
  }
  if (
    category === "非功能需求" ||
    category === "部署需求" ||
    /性能|安全|可靠|可用|并发|定时任务|加密|部署|服务器|响应|加载|缓存|同步/.test(ruleText)
  ) {
    add("deployment");
  }
  if (category === "外部接口") {
    add("usecase");
    add("deployment");
  }
  if (category === "界面需求") {
    add("usecase");
    add("prototype");
  }
  if (category === "异常处理") {
    add("activity");
    add("analysis");
    add("usecase");
  }

  return inferred.length > 0 ? inferred : ["usecase"];
}

export function diagramAllowedForCategory(diagram: DiagramKind, category: RuleCategory) {
  if (diagram !== "function") return true;
  return category === "功能需求" || category === "业务规则";
}

/** Related models for a rule, restricted to the diagrams its category may feed. */
export function inferRuleRelatedDiagrams(ruleText: string, category: RuleCategory): DiagramKind[] {
  const diagrams = inferRelatedDiagrams(ruleText, category).filter((diagram) =>
    diagramAllowedForCategory(diagram, category),
  );
  return diagrams.length > 0 ? diagrams : ["usecase"];
}
