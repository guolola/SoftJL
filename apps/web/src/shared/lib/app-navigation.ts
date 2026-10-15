// Provides route changes for shared actions that render outside the app router component tree.
export function navigateAppPath(path: string) {
  const nextUrl = new URL(path, window.location.origin);
  window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export const PROJECT_TASK_DRAWER_REQUEST_EVENT = "uml-open-project-task-drawer";
export const PROJECT_WORKSPACE_TARGET_REQUEST_EVENT = "uml-open-project-workspace-target";
export const PROJECT_REQUIREMENT_RULE_REQUEST_EVENT = "uml-open-requirement-rule";
let requestedRequirementRuleId: string | null = null;

export type ProjectWorkspaceTarget =
  | "system-requirements"
  | "requirement-models"
  | "design-models"
  | "feasibility"
  | "provider-settings";

export interface ProjectTaskDrawerRequest {
  clientTaskId?: string | null;
  runId?: string | null;
}

export function requestOpenGenerationTask(detail: ProjectTaskDrawerRequest = {}) {
  window.dispatchEvent(
    new CustomEvent<ProjectTaskDrawerRequest>(PROJECT_TASK_DRAWER_REQUEST_EVENT, {
      detail,
    }),
  );
}

export function requestOpenProjectWorkspaceTarget(target: ProjectWorkspaceTarget) {
  window.dispatchEvent(
    new CustomEvent<ProjectWorkspaceTarget>(PROJECT_WORKSPACE_TARGET_REQUEST_EVENT, {
      detail: target,
    }),
  );
}

// Keep the rule request until the requirements view mounts and has loaded its rules.
export function requestOpenRequirementRule(ruleId: string) {
  requestedRequirementRuleId = ruleId;
  requestOpenProjectWorkspaceTarget("system-requirements");
  window.dispatchEvent(new Event(PROJECT_REQUIREMENT_RULE_REQUEST_EVENT));
}

export function pendingRequirementRuleRequest() {
  return requestedRequirementRuleId;
}

export function clearRequirementRuleRequest(ruleId: string) {
  if (requestedRequirementRuleId === ruleId) requestedRequirementRuleId = null;
}
