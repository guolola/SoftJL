// Defines workspace module contracts used by app composition and workspace feature navigation.
import type { ShellRoutePath } from "../../shared/lib/app-route-types";
export type { ShellRoutePath } from "../../shared/lib/app-route-types";

export interface WorkspaceModuleDefinition {
  id: string;
  label: string;
  route: ShellRoutePath;
  tabId: string;
  artifactTypes: string[];
  prerequisiteStepIds: string[];
  emptyState: string;
}

export const WORKSPACE_MODULES: WorkspaceModuleDefinition[] = [
  {
    id: "system-requirements",
    label: "系统需求",
    route: "/workspace",
    tabId: "system-requirements",
    artifactTypes: ["requirementText", "requirementRule"],
    prerequisiteStepIds: [],
    emptyState: "输入需求文本后可生成并确认需求规则",
  },
  {
    id: "feasibility",
    label: "可行性分析",
    route: "/workspace",
    tabId: "feasibility",
    artifactTypes: ["context", "implementationPlan"],
    prerequisiteStepIds: ["system-requirements"],
    emptyState: "确认需求规则后可生成系统环境图和实现方案",
  },
  {
    id: "requirements",
    label: "需求模型",
    route: "/workspace",
    tabId: "requirements",
    artifactTypes: ["requirementModel"],
    prerequisiteStepIds: ["system-requirements"],
    emptyState: "确认需求规则后可生成 UML 需求模型",
  },
  {
    id: "diagrams",
    label: "图",
    route: "/workspace",
    tabId: "diagram",
    artifactTypes: ["plantUml", "svg"],
    prerequisiteStepIds: ["requirements"],
    emptyState: "先生成需求模型后查看 UML 图",
  },
  {
    id: "design",
    label: "设计模型",
    route: "/workspace",
    tabId: "design",
    artifactTypes: ["designModel", "designPlantUml", "designSvg"],
    prerequisiteStepIds: ["diagrams"],
    emptyState: "先生成需求模型后进入设计阶段",
  },
  
  {
    id: "testing",
    label: "测试",
    route: "/workspace",
    tabId: "test",
    artifactTypes: ["blackBoxTestCase", "testCoverageRelation"],
    prerequisiteStepIds: ["design"],
    emptyState: "先生成用例模型和设计模型后生成测试用例",
  },
  {
    id: "documents",
    label: "说明书",
    route: "/workspace",
    tabId: "documents",
    artifactTypes: ["requirementsSpec", "softwareDesignSpec", "feasibilityStudy"],
    prerequisiteStepIds: ["requirements", "feasibility"],
    emptyState: "生成有效模型或可行性产物后可导出说明书",
  },
];

export const SHELL_ROUTE_MODULES = [
  {
    label: "工作台",
    route: "/workspace" as const,
    description: "进入 SoftJL 工作区。",
  },
];

export function findShellRouteModule(route: ShellRoutePath) {
  return SHELL_ROUTE_MODULES.find((module) => module.route === route) ?? SHELL_ROUTE_MODULES[0];
}

export function assertUniqueWorkspaceModules(modules = WORKSPACE_MODULES) {
  const ids = new Set<string>();
  const routes = new Set<string>();

  for (const module of modules) {
    if (ids.has(module.id)) {
      throw new Error(`Duplicate workspace module id: ${module.id}`);
    }
    ids.add(module.id);

    const routeKey = `${module.route}:${module.tabId}`;
    if (routes.has(routeKey)) {
      throw new Error(`Duplicate workspace module route/tab: ${routeKey}`);
    }
    routes.add(routeKey);
  }
}
