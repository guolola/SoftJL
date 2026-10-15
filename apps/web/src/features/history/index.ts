// Keeps the historical feature import path while run history data logic lives in entities.
export {
  RUN_HISTORY_LIMIT,
  RUN_HISTORY_STORAGE_KEY,
  RunHistoryStorageError,
  clearRunHistoryItems,
  compactRunHistorySnapshot,
  createRunHistoryTitle,
  deleteRunHistoryItem,
  getRunHistorySnapshotLabel,
  getRunHistorySnapshotSummary,
  
  isDesignRunSnapshot,
  isDocumentRunSnapshot,
  loadRunHistory,
  persistRunHistory,
  saveRunHistoryItem,
  type RunHistoryItem,
  type RunHistorySnapshot,
} from "../../entities/run-history";
