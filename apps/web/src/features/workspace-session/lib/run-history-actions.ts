// Provides run history list, restore, delete, clear, and save actions for the session provider.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type {
  RunHistoryItem,
  RunHistorySnapshot,
} from "../../../entities/run-history";
import type { WorkspaceRepository } from "../../../services/workspace-repository";

interface RunHistoryActionsInput {
  applyRestoredSnapshot: (snapshot: RunHistorySnapshot) => void;
  applyWorkspaceRecord: (workspace: WorkspaceRecord) => void;
  repository: WorkspaceRepository;
  setHistoryItems: Dispatch<SetStateAction<RunHistoryItem[]>>;
}

export function useRunHistoryActions({
  applyRestoredSnapshot,
  applyWorkspaceRecord,
  repository,
  setHistoryItems,
}: RunHistoryActionsInput) {
  const { t } = useTranslation();
  const refreshHistory = useCallback(async () => {
    setHistoryItems(await repository.listRunHistory());
  }, [repository, setHistoryItems]);

  const restoreRunHistory = useCallback(
    async (id: string) => {
      const item = await repository.restoreRunHistory(id);
      if (!item) {
        throw new Error(t("historyDrawer.snapshotMissing"));
      }
      if (!item.snapshot) {
        applyWorkspaceRecord(await repository.loadWorkspace());
        setHistoryItems(await repository.listRunHistory());
        return;
      }
      applyRestoredSnapshot(item.snapshot);
    },
    [applyRestoredSnapshot, applyWorkspaceRecord, repository, setHistoryItems, t],
  );

  const deleteRunHistory = useCallback(
    async (id: string) => {
      setHistoryItems(await repository.deleteRunHistory(id));
    },
    [repository, setHistoryItems],
  );

  const clearRunHistory = useCallback(async () => {
    await repository.clearRunHistory();
    setHistoryItems([]);
  }, [repository, setHistoryItems]);

  const saveHistorySnapshot = useCallback(
    async (
      snapshot: RunHistorySnapshot,
      meta: { providerModel: string; durationMs?: number },
    ) => {
      try {
        await repository.saveRunHistory(snapshot, meta);
        setHistoryItems(await repository.listRunHistory());
      } catch (error) {
        console.warn("Failed to save run history snapshot", error);
        floatingAlert.message(t("historyDrawer.snapshotSkipped"));
        try {
          setHistoryItems(await repository.listRunHistory());
        } catch {
          // The generated result is more important than a secondary history refresh failure.
        }
      }
    },
    [repository, setHistoryItems, t],
  );

  return {
    clearRunHistory,
    deleteRunHistory,
    refreshHistory,
    restoreRunHistory,
    saveHistorySnapshot,
  };
}
