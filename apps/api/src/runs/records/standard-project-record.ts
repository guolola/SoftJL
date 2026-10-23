// Persists ordinary workflow transitions using the existing workspace optimistic concurrency contract.
import { createStandardProjectState, storedStandardProjectStateSchema, type StandardProjectState } from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { interruptStandardRunMessages } from "./standard-run-messages.js";

export function readStandardState(state: Record<string, unknown>, description = ""): StandardProjectState {
  if (!Object.hasOwn(state, "standardProject")) return createStandardProjectState(description);
  return structuredClone(storedStandardProjectStateSchema.parse(state.standardProject));
}

export async function updateStandardState(store: AuthStore, projectId: string, userId: string,
  update: (state: StandardProjectState) => void): Promise<StandardProjectState> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const workspace = await store.getProjectWorkspace(projectId);
    const state = readStandardState(workspace.state);
    update(state);
    // Validate the updated model tree before writing; rejection leaves the workspace untouched.
    const current = storedStandardProjectStateSchema.parse(state);
    const saved = await store.saveProjectWorkspace({
      projectId, baseVersion: workspace.version, updatedByUserId: userId,
      state: { ...workspace.state, standardProject: current }, sourceRunId: workspace.sourceRunId,
    });
    if (saved.ok) return current;
  }
  throw new Error("项目正在被其他成员更新，请稍后重试");
}

// A process restart loses in-memory execution, but never the completed artifacts or the saved continuation scope.
export async function recoverInterruptedStandardRun(store: AuthStore, projectId: string, userId: string, runId: string) {
  return updateStandardState(store, projectId, userId, state => {
    if (state.run?.id !== runId || state.run.status !== "running") return;
    state.run = { ...state.run, status: "stopped", interruptionReason: "server_restart", finishedAt: new Date().toISOString(), error: "生成服务已重启，已保留现有成果，可继续未完成内容" };
    state.contextStatus = "ready";
    for (const diagram of Object.values(state.diagrams)) if (diagram.status === "running" || diagram.status === "pending") {
      diagram.status = "failed"; diagram.error = "生成服务已重启，可继续生成"; delete diagram.phase;
    }
    interruptStandardRunMessages(state, "生成服务已重启，本轮生成已中断。");
  });
}
