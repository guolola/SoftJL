// Provides run history list, individual deletion, and save actions for the session provider.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import type {
  RunHistoryItem,
  RunHistorySnapshot,
} from "../../../entities/run-history/index";
import type { WorkspaceRepository } from "../../../services/workspace-repository/index";

interface RunHistoryActionsInput {
  repository: WorkspaceRepository;
  setHistoryItems: Dispatch<SetStateAction<RunHistoryItem[]>>;
}

export function useRunHistoryActions({
  repository,
  setHistoryItems,
}: RunHistoryActionsInput) {
  const { t } = useTranslation();
  const refreshHistory = useCallback(async () => {
    setHistoryItems(await repository.listRunHistory());
  }, [repository, setHistoryItems]);

  const deleteRunHistory = useCallback(
    async (id: string) => {
      setHistoryItems(await repository.deleteRunHistory(id));
    },
    [repository, setHistoryItems],
  );

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

    deleteRunHistory,
    refreshHistory,
    saveHistorySnapshot,
  };
}
