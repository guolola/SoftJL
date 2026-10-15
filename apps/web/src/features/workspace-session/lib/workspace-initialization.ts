// Loads the initial workspace snapshot and run history for the session provider.
import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { RunHistoryItem } from "../../../entities/run-history";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import type { createEmptyRunUiState } from "./run-ui-state";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";

type RunUiState = ReturnType<typeof createEmptyRunUiState>;

interface WorkspaceInitializationInput {
  applyWorkspaceRecord: (workspace: WorkspaceRecord) => void;
  getHasActiveGenerationTask?: () => boolean;
  repository: WorkspaceRepository;
  setHistoryItems: Dispatch<SetStateAction<RunHistoryItem[]>>;
  setRunUiState: Dispatch<SetStateAction<RunUiState>>;
}

export function useWorkspaceInitialization({
  applyWorkspaceRecord,
  getHasActiveGenerationTask,
  repository,
  setHistoryItems,
  setRunUiState,
}: WorkspaceInitializationInput) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;

    const refreshHistory = async () => {
      try {
        const items = await repository.listRunHistory();
        if (!active) return;
        setHistoryItems(items);
      } catch (error) {
        if (!active) return;
        setRunUiState((current) => ({
          ...current,
          errorMessage: localizeCaughtFailure(error, "读取运行历史失败，请稍后重试。"),
        }));
      }
    };

    const refreshWorkspaceAndHistory = async (applyWorkspace: boolean) => {
      if (applyWorkspace) {
        try {
          const workspace = await repository.loadWorkspace();
          if (!active) return;
          applyWorkspaceRecord(workspace);
        } catch (error) {
          if (!active) return;
          setRunUiState((current) => ({
            ...current,
            errorMessage: localizeCaughtFailure(error, "加载工作台失败，请稍后重试。"),
          }));
          return;
        }
      }
      await refreshHistory();
    };

    const refreshAfterResume = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      const hasActiveGenerationTask = getHasActiveGenerationTask?.() ?? false;
      void refreshWorkspaceAndHistory(!hasActiveGenerationTask);
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
    setRunUiState,
  ]);

  return initialized;
}
