import type {
  DesignDiagramKind,
  DesignDiagramModelSpec,
  DesignPlantUmlArtifact,
  DesignSvgArtifact,
  DiagramKind,
  DiagramModelSpec,
} from "@uml-platform/contracts";
import type { TFunction } from "i18next";
import { findModelByDiagramKind } from "@uml-platform/contracts";

export type DiagramType = DiagramKind;
export type DesignDiagramType = DesignDiagramKind;

export const DIAGRAM_META: Record<
  DiagramType,
  { label: string; english: string; description: string }
> = {
  context: {
    label: "系统环境图",
    english: "System Environment Diagram",
    description: "系统边界、人员、外部系统与高层交互",
  },
  function: {
    label: "功能结构图",
    english: "Functional Structure Diagram",
    description: "功能分解、子功能与依赖关系",
  },
  usecase: {
    label: "用例模型",
    english: "Use Case Diagram",
    description: "系统边界、角色与用例关系",
  },
  class: {
    label: "领域概念模型",
    english: "Class Diagram",
    description: "领域实体、属性与关联",
  },
  activity: {
    label: "总体业务流程",
    english: "Activity Diagram",
    description: "跨角色业务活动、分支与流转",
  },
  deployment: {
    label: "部署需求模型",
    english: "Deployment Diagram",
    description: "部署约束、节点与网络拓扑",
  },
  prototype: {
    label: "原型界面关系",
    english: "Prototype Interface Relationship",
    description: "页面、模块、入口点与跳转关系",
  },
  analysis: {
    label: "需求分析模型",
    english: "Requirement Analysis Sequence",
    description: "基于用例事件流的需求交互分析",
  },
};

export const DIAGRAM_ORDER: DiagramType[] = [
  "function",
  "activity",
  "usecase",
  "class",
  "prototype",
  "deployment",
  "analysis",
];

export const DESIGN_DIAGRAM_META: Record<
  DesignDiagramType,
  { label: string; english: string; description: string }
> = {
  architecture: {
    label: "总体架构图",
    english: "Logical Architecture",
    description: "包、子系统、核心组件与依赖",
  },
  sequence: {
    label: "用例实现设计",
    english: "Sequence Diagram",
    description: "基于事件流的对象调用时序与动态行为",
  },
  navigation: {
    label: "界面关系图",
    english: "Page Navigation",
    description: "页面、入口、模块与导航关系",
  },
  class: {
    label: "设计类图",
    english: "Class Diagram",
    description: "实体、接口、聚合根及静态关联",
  },
  component: {
    label: "组件（构件）关系",
    english: "Component Diagram",
    description: "组件、接口与构件依赖关系",
  },
  deployment: {
    label: "部署设计",
    english: "Deployment Diagram",
    description: "设备、执行环境、制品部署与通信",
  },
  table: {
    label: "数据库设计",
    english: "Table Relationship Diagram",
    description: "数据库表、主键、外键与表间关联",
  },
};

export const DESIGN_DIAGRAM_ORDER: DesignDiagramType[] = [
  "architecture",
  "sequence",
  "class",
  "navigation",
  "table",
  "component",
  "deployment",
];

export function getDesignModelId(
  model: Pick<DesignDiagramModelSpec, "diagramKind" | "modelId">,
) {
  return model.modelId ?? model.diagramKind;
}

export function getDesignArtifactId(
  artifact: Pick<DesignPlantUmlArtifact | DesignSvgArtifact, "diagramKind" | "modelId">,
) {
  return artifact.modelId ?? artifact.diagramKind;
}

export function getRequirementModelId(
  model: { diagramKind?: DiagramKind | string; modelId?: string },
) {
  return model.modelId ?? model.diagramKind ?? "unknown";
}

export function findRequirementModelByKind(
  models: Record<string, DiagramModelSpec | undefined>,
  diagram: DiagramType,
) {
  return findModelByDiagramKind(models, diagram);
}

export function getRequirementArtifactId(
  artifact: { diagramKind?: DiagramKind | string; modelId?: string },
) {
  return artifact.modelId ?? artifact.diagramKind ?? "unknown";
}

export function getDiagramLabel(diagram: DiagramType, t?: TFunction) {
  return t?.(`diagrams.requirementKinds.${diagram}.label`, {
    defaultValue: DIAGRAM_META[diagram].label,
  }) ?? DIAGRAM_META[diagram].label;
}

export function getDiagramDescription(diagram: DiagramType, t?: TFunction) {
  return t?.(`diagrams.requirementKinds.${diagram}.description`, {
    defaultValue: DIAGRAM_META[diagram].description,
  }) ?? DIAGRAM_META[diagram].description;
}

export function getDesignDiagramLabel(diagram: DesignDiagramType, t?: TFunction) {
  return t?.(`diagrams.designKinds.${diagram}.label`, {
    defaultValue: DESIGN_DIAGRAM_META[diagram].label,
  }) ?? DESIGN_DIAGRAM_META[diagram].label;
}

export function getDesignDiagramDescription(diagram: DesignDiagramType, t?: TFunction) {
  return t?.(`diagrams.designKinds.${diagram}.description`, {
    defaultValue: DESIGN_DIAGRAM_META[diagram].description,
  }) ?? DESIGN_DIAGRAM_META[diagram].description;
}
