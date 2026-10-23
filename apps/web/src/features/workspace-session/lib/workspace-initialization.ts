// Loads the initial workspace snapshot and run history for the session provider.
import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { RunHistoryItem } from "../../../entities/run-history/index";
import type { WorkspaceRepository } from "../../../services/workspace-repository/index";
import { PROJECT_RUNS_REUSE_MS } from "../../../services/workspace-repository/project-run-reads";

const RESUME_REFRESH_INTERVAL_MS = 30_000;

interface WorkspaceInitializationInput {
  applyWorkspaceRecord: (
    workspace: WorkspaceRecord,
    options?: { preserveRequirementDraft?: boolean },
  ) => void;
  getHasActiveGenerationTask?: () => boolean;
  repository: WorkspaceRepository;
  setHistoryItems: Dispatch<SetStateAction<RunHistoryItem[]>>;
}

export function useWorkspaceInitialization({
  applyWorkspaceRecord,
  getHasActiveGenerationTask,
  repository,
  setHistoryItems,
}: WorkspaceInitializationInput) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;
    let pending: Promise<void> | undefined;
    let lastRefreshedAt: number | undefined;
    setInitialized(false);

    const refreshHistory = async (resumed: boolean) => {
      try {
        const items = await repository.listRunHistory({ maxAgeMs: resumed ? 0 : PROJECT_RUNS_REUSE_MS });
        if (!active) return false;
        setHistoryItems(items);
        return true;
      } catch {
        // Retain the last history list; reconnect and visibility changes retry the read.
        return false;
      }
    };

    const refreshWorkspaceAndHistory = async (applyWorkspace: boolean, resumed = false) => {
      if (pending) return pending;
      // Both reads are independent; overview and history can share the same run-list request.
      pending = Promise.all([
        (async () => {
          if (!applyWorkspace) return true;
          try {
            const workspace = await repository.loadWorkspace();
            if (!active) return false;
            // A task may have started while the background read was in flight.
            if (!resumed || !getHasActiveGenerationTask?.()) {
              applyWorkspaceRecord(workspace, { preserveRequirementDraft: resumed });
            }
            return true;
          } catch {
            // Keep published state untouched until a later refresh succeeds.
            return false;
          }
        })(),
        refreshHistory(resumed),
      ]).then(results => {
        if (results.every(Boolean)) lastRefreshedAt = Date.now();
      }).finally(() => { pending = undefined; });
      return pending;
    };

    const refreshAfterResume = (event: Event) => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      // Brief tab switches reuse the session. Reconnecting still retries immediately.
      if (event.type !== "online" && lastRefreshedAt !== undefined &&
        Date.now() - lastRefreshedAt < RESUME_REFRESH_INTERVAL_MS) return;
      const hasActiveGenerationTask = getHasActiveGenerationTask?.() ?? false;
      void refreshWorkspaceAndHistory(!hasActiveGenerationTask, true);
    };

    void refreshWorkspaceAndHistory(true).finally(() => {
      if (active) setInitialized(true);
    });

    if (typeof window !== "undefined") {
      window.addEventListener("online", refreshAfterResume);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", refreshAfterResume);
    }

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", refreshAfterResume);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", refreshAfterResume);
      }
    };
  }, [
    applyWorkspaceRecord,
    getHasActiveGenerationTask,
    repository,
    setHistoryItems,
  ]);

  return initialized;
}
