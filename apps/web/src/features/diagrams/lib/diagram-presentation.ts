// Maps language-neutral diagram kinds and legacy field identifiers to localized platform labels.
import type { TFunction } from "i18next";
import type { SemanticElementKind } from "../../../entities/diagram/lib/model-details";

const DETAIL_FIELD_KEYS: Record<string, string> = {
  标签: "label", 参与者动作: "actorAction", 触发: "trigger", 端口: "port", 方向: "direction",
  父功能: "parentFunction", 可导航性: "navigability", 来源需求: "sourceRequirement", 路径: "path",
  目标多重性: "targetMultiplicity", 目标角色: "targetRole", 目标字段: "targetColumn", 判断条件: "decisionCondition",
  守卫: "guard", 说明: "description", 所属泳道: "lane", 条件: "condition", 系统动作: "systemAction",
  协议: "protocol", 预期结果: "expectedResult", 源多重性: "sourceMultiplicity", 源角色: "sourceRole",
  源字段: "sourceColumn", 执行方: "executor", 包: "package", 包含组件: "includedComponents", 表: "table",
  并发分叉: "forkNode", 并发汇合: "joinNode", 部署节点: "deploymentNode", 参数: "parameters",
  参与对象: "participant", 操作: "operations", 调用类型: "callType", 调用消息: "callMessage", 返回: "returnValue",
  功能: "function", 构造型: "stereotype", 关联需求: "relatedRequirements", 关联用例: "relatedUseCases",
  合并节点: "mergeNode", 后置条件: "postconditions", 环境: "environment", 活动: "activity", 角色: "actor",
  接口: "interface", 节点类型: "nodeType", 结束节点: "endNode", 开始节点: "startNode", 来源: "source",
  来源规则: "sourceRules", 来源设计类: "sourceDesignClass", 类: "class", 类型: "type", 枚举: "enum",
  名称: "name", 模块: "module", 目标: "goal", 判断: "decision", 前置条件: "preconditions", 人员: "person",
  入口点: "entryPoint", 身份: "identity", 事件流: "eventFlow", 输出: "output", 输入: "input", 数据库: "database",
  所属包: "ownerPackage", 外部系统: "externalSystem", 系统边界: "systemBoundary", 消息: "message",
  协作参与者: "collaboratingParticipants", 页面: "page", 引擎: "engine", 英文名称: "englishName", 泳道: "swimlane",
  用例: "useCase", 约束: "constraints", 职责: "responsibilities", 制品: "artifact", 制品类型: "artifactType",
  中文名称: "chineseName", 中心系统: "system", 主参与者: "primaryActor", 字段: "columns", 字面量: "literals",
  组合片段: "fragment", 组件: "component", 组件类型: "componentType",
};

export function semanticElementLabel(kind: SemanticElementKind, t: TFunction, short = false) {
  return t(`diagrams.semantic.${kind}.${short ? "shortLabel" : "label"}`);
}

export function diagramDetailFieldLabel(label: string, t: TFunction) {
  const key = DETAIL_FIELD_KEYS[label];
  return key ? t(`diagrams.detail.fieldLabels.${key}`) : label;
}

export function diagramRelationTypeLabel(label: string, t: TFunction) {
  if (label === "有向交互") return t("traceability.context.directedInteraction");
  if (label === "双向交互") return t("traceability.context.bidirectionalInteraction");
  if (label === "未分类" || label === "uncategorized") return t("diagrams.detail.uncategorized");
  return label;
}
