// Recognizes exact previews accepted by this run without treating later manual edits as previews.
import { captureWorkspaceGuard, workspaceGuardConflicts } from "@uml-platform/contracts";
import type { WorkspaceDesignRunSnapshot, WorkspaceRunSnapshot } from "../../../entities/workspace/model";

type ModelSnapshot = WorkspaceDesignRunSnapshot | WorkspaceRunSnapshot;

export function modelPreviewGuardConflicts(
  snapshot: ModelSnapshot,
  state: Record<string, unknown>,
  applied: Record<string, string>,
) {
  const targets = captureWorkspaceGuard({ snapshot }, state).targets;
  return workspaceGuardConflicts({ snapshot }, state).filter((key) =>
    !applied[`target:${key}`] || applied[`target:${key}`] !== targets[key]);
}

export function rememberModelPreviewTargets(
  snapshot: ModelSnapshot,
  state: Record<string, unknown>,
  kinds: readonly string[],
  applied: Record<string, string>,
) {
  for (const [key, fingerprint] of Object.entries(captureWorkspaceGuard({ snapshot }, state).targets)) {
    if (kinds.includes(key.split(":")[1] as typeof kinds[number])) applied[`target:${key}`] = fingerprint;
  }
}
