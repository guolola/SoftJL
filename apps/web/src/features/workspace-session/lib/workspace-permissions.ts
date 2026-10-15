// Loads permissions and server-authorized generation mode without leaking access across projects.
import { useEffect, useState } from "react";
import type { GenerationExecutionMode } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";

type WorkspacePermissions = {
  canUpdateWorkspace: boolean;
  canStartRuns: boolean;
  reason: string | null;
  generationExecutionMode: GenerationExecutionMode;
};
const pendingPermissions: WorkspacePermissions = {
  canUpdateWorkspace: false,
  canStartRuns: false,
  reason: "正在确认当前项目权限和生成模式。",
  generationExecutionMode: "provider",
};
const localPermissions: WorkspacePermissions = {
  canUpdateWorkspace: true,
  canStartRuns: true,
  reason: null,
  generationExecutionMode: "provider",
};

export function useWorkspacePermissions(repository: WorkspaceRepository) {
  const [resolved, setResolved] = useState<{
    repository: WorkspaceRepository;
    permissions: WorkspacePermissions;
  } | null>(null);

  useEffect(() => {
    if (!repository.getProjectAccess) return;
    let active = true;
    repository
      .getProjectAccess()
      .then(({ capabilities, generationExecutionMode }) => {
        if (!active) return;
        const canUpdateWorkspace = capabilities.includes("update_project");
        const canStartRuns = capabilities.includes("start_runs");
        setResolved({ repository, permissions: {
          canUpdateWorkspace,
          canStartRuns,
          generationExecutionMode: generationExecutionMode === "offline-demo" ? "offline-demo" : "provider",
          reason:
            canUpdateWorkspace && canStartRuns
              ? null
              : "当前项目角色仅允许查看，不能编辑内容或启动生成。",
        } });
      })
      .catch(() => {
        if (!active) return;
        setResolved({ repository, permissions: {
          canUpdateWorkspace: false,
          canStartRuns: false,
          generationExecutionMode: "provider",
          reason: "无法确认当前项目权限，已临时禁用编辑和生成操作。",
        } });
      });
    return () => {
      active = false;
    };
  }, [repository]);

  // Revoke the previous project's demo exemption before the new request resolves.
  return resolved?.repository === repository ? resolved.permissions
    : repository.getProjectAccess ? pendingPermissions : localPermissions;
}
