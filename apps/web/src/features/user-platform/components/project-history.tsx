// Owns project run history filtering, actions, snapshot restore, and document download flows.
import { Alert } from '../../../shared/ui/alert';
import { Card } from "../../../shared/ui/card";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Download, RotateCw, Trash2 } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { SelectControl } from "../../../shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/ui/table";
import { TablePagination, TableToolbar } from "../../../shared/template/layout/page";
import { downloadBlobFile } from "../../../shared/lib/download";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { isDocumentRunSnapshot } from "../../../entities/run-history";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  formatDateTime,
  getProjectRunDisplayTime,
  getProjectRunKind,
  getProjectRunModelLabel,
  getProjectRunOperatorLabel,
  getProjectRunOperatorSearchText,
  getProjectRunStageLabel,
  getProjectRunStatusClasses,
  getProjectRunStatusLabel,
} from "../lib/project-workspace-presentation";
import {
  platformApi,
  type PlatformProjectMember,
  type PlatformRunSummary,
} from "../services/platform-api";
import { useAppI18n } from "../../../shared/i18n/i18n-provider";
import {
  localizeApiFailure,
  localizeCaughtFailure,
} from "../../../shared/i18n/api-errors";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";

function runActionLabel(action: string | null | undefined, t: TFunction) {
  if (action === "retry") return t("projectShell.historyUi.retry");
  if (action === "rerun") return t("projectShell.historyUi.rerun");
  return t("projectShell.historyUi.derived");
}

function runRelationText(run: PlatformRunSummary, t: TFunction) {
  const parts = [
    run.sourceRunId ? t("projectShell.historyUi.relationSource", { action: runActionLabel(run.sourceAction, t), runId: run.sourceRunId }) : null,
    run.latestActionRunId
      ? t("projectShell.historyUi.relationDerived", { action: runActionLabel(run.latestAction, t), runId: run.latestActionRunId })
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function ProjectHistory({
  projectId,
  initialRuns,
  members,
  layout = "page",
}: {
  projectId: string;
  initialRuns: PlatformRunSummary[];
  members: PlatformProjectMember[];
  layout?: "page" | "drawer";
}) {
  const { t } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const { locale } = useAppI18n();
  const [runs, setRuns] = useState(initialRuns);
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedErrorRunId, setSelectedErrorRunId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const {
    historyItems,
    restoreRunHistory,
    deleteRunHistory,
  } = useWorkspaceSession();
  const repository = useWorkspaceRepository();

  useEffect(() => {
    setRuns(initialRuns);
    setPage(1);
  }, [initialRuns]);

  const notifySuccess = (title: string) => showAlert({ id: "project-history-success", title, tone: "success" });
  const notifyError = (title: string) => showAlert({ id: "project-history-error", title, tone: "destructive" });

  const cancelRun = async (runId: string) => {
    try {
      const response = await platformApi.cancelProjectRun(projectId, runId);
      const nextRun =
        response.run ??
        ({
          runId: response.runId ?? runId,
          status: response.status ?? "cancelled",
        } satisfies PlatformRunSummary);
      setRuns((current) =>
        current.map((run) =>
          run.runId === runId ? { ...run, ...nextRun } : run,
        ),
      );
      notifySuccess(t("projectShell.historyUi.cancelled"));
    } catch (cancelError) {
      notifyError(localizeCaughtFailure(cancelError, t("projectShell.historyUi.cancelFailed")));
    }
  };

  

  const runAction = async (
    runId: string,
    action: "retry" | "rerun",
  ) => {
    try {
      const response =
        action === "retry"
          ? await platformApi.retryProjectRun(projectId, runId)
          : await platformApi.rerunProjectRun(projectId, runId);
      const sourceRun = runs.find((run) => run.runId === runId);
      const responseAction = response.action ?? action;
      const nextRun = {
        ...(
          response.run ??
          ({
            runId: response.runId ?? runId,
            status: response.status ?? "queued",
          } satisfies PlatformRunSummary)
        ),
        sourceRunId: response.run?.sourceRunId ?? response.sourceRunId ?? runId,
        sourceAction: response.run?.sourceAction ?? responseAction,
        sourceRunStatus:
          response.run?.sourceRunStatus ?? sourceRun?.status ?? null,
      } satisfies PlatformRunSummary;
      if (nextRun.runId !== runId) {
        setRuns((current) => [
          nextRun,
          ...current.map((run) =>
            run.runId === runId
              ? {
                  ...run,
                  derivedRunIds: [
                    ...(run.derivedRunIds ?? []).filter((id) => id !== nextRun.runId),
                    nextRun.runId,
                  ],
                  latestAction: responseAction,
                  latestActionRunId: nextRun.runId,
                  latestActionAt: nextRun.updatedAt ?? nextRun.startedAt ?? nextRun.createdAt ?? null,
                }
              : run,
          ),
        ]);
      } else {
        setRuns((current) =>
          current.map((run) =>
            run.runId === runId ? { ...run, ...nextRun } : run,
          ),
        );
      }
      notifySuccess(t("projectShell.historyUi.requeued"));
    } catch (actionError) {
      notifyError(
        localizeCaughtFailure(
          actionError,
          action === "retry"
            ? t("projectShell.historyUi.retryFailed")
            : t("projectShell.historyUi.rerunFailed"),
        ),
      );
    }
  };

  const restoreSnapshot = async (runId: string) => {
    try {
      await restoreRunHistory(runId);
      notifySuccess(t("projectShell.historyUi.restored"));
    } catch (restoreError) {
      notifyError(localizeCaughtFailure(restoreError, t("projectShell.historyUi.restoreFailed")));
    }
  };

  const downloadDocumentRun = async (runId: string) => {
    const historyItem = historyItems.find((item) => item.id === runId);
    const run = runs.find((item) => item.runId === runId);
    if (!repository.downloadDocumentRun) {
      notifyError(t("projectShell.historyUi.downloadUnsupported"));
      return;
    }
    try {
      const downloaded = await repository.downloadDocumentRun(
        runId,
        run?.documentFileName ??
          historyItem?.documentFileName ??
          (historyItem?.snapshot && isDocumentRunSnapshot(historyItem.snapshot)
          ? historyItem.snapshot.fileName ?? undefined
          : undefined),
      );
      downloadBlobFile(downloaded.fileName, downloaded.blob);
      notifySuccess(t("projectShell.historyUi.downloaded", { file: downloaded.fileName }));
    } catch (downloadError) {
      notifyError(localizeCaughtFailure(downloadError, t("projectShell.historyUi.downloadFailed")));
    }
  };

  const deleteRun = async (runId: string) => {
    try {
      await platformApi.deleteProjectRun(projectId, runId);
      await deleteRunHistory(runId).catch(() => []);
      setRuns((current) => current.filter((run) => run.runId !== runId));
      notifySuccess(t("projectShell.historyUi.deleted"));
    } catch (deleteError) {
      notifyError(localizeCaughtFailure(deleteError, t("projectShell.historyUi.deleteFailed")));
    }
  };

  const statuses = useMemo(
    () => Array.from(new Set(runs.map((run) => run.status).filter(Boolean))),
    [runs],
  );
  const categories = [
    ["all", t("projectShell.historyUi.allCategories")],
    ["requirements", t("projectShell.historyUi.requirements")],
    ["feasibility", t("projectShell.historyUi.feasibility")],
    ["design", t("projectShell.historyUi.models")],
    [ t("projectShell.historyUi.code")],
    ["document", t("projectShell.historyUi.documents")],
  ] as const;
  const filteredRuns = runs.filter((run) => {
    if (
      stageFilter !== "all" &&
      run.stage !== stageFilter &&
      getProjectRunKind(run) !== stageFilter
    ) {
      return false;
    }
    if (statusFilter !== "all" && run.status !== statusFilter) return false;
    const query = searchFilter.trim().toLowerCase();
    if (query) {
      const operatorText = getProjectRunOperatorSearchText(run, members);
      const timeText = [run.startedAt, run.completedAt, run.updatedAt]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const modelText = (run.model ?? "").toLowerCase();
      if (
        !operatorText.includes(query) &&
        !timeText.includes(query) &&
        !modelText.includes(query)
      ) {
        return false;
      }
    }
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filteredRuns.length / pageSize));
  const pagedRuns = filteredRuns.slice((page - 1) * pageSize, page * pageSize);

  const renderRunActions = ({
    run,
    hasSnapshot,
    hasDocumentSnapshot,
    size,
    withIcons = false,
  }: {
    run: PlatformRunSummary;
    hasSnapshot: boolean;
    hasDocumentSnapshot: boolean | undefined;
    size?: "sm";
    withIcons?: boolean;
  }) => {
    const running = run.status === "running" || run.status === "queued";
    const retryable =
      run.status === "failed" ||
      run.status === "cancelled" ||
      run.status === "interrupted";
    const documentRun = getProjectRunKind(run) === "document" || Boolean(hasDocumentSnapshot);
    const feasibilityRun = getProjectRunKind(run) === "feasibility";
    const canUseSnapshot =
      !documentRun &&
      !feasibilityRun &&
      (hasSnapshot || run.canRestore) &&
      !running;
    const canDownloadDocument =
      run.status === "completed" &&
      run.documentDownloadAvailable !== false &&
      (Boolean(hasDocumentSnapshot) || Boolean(run.documentDownloadAvailable));
    const canRerun = !running;
    const canDelete = !running;
    const buttonSizeProps = size ? { size } : {};

    return (
      <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap [&>button]:shrink-0">
        {running && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void cancelRun(run.runId)}
          >
            {t("projectShell.historyUi.cancel")}
          </Button>
        )}
        {!running && (run.error || run.errorMessage) && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => setSelectedErrorRunId(run.runId)}
          >
            {t("projectShell.historyUi.viewError")}
          </Button>
        )}
        {!running && retryable && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void runAction(run.runId, "retry")}
          >
            {t("projectShell.historyUi.retry")}
          </Button>
        )}
        {canRerun && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void runAction(run.runId, "rerun")}
          >
            {t("projectShell.historyUi.rerun")}
          </Button>
        )}
        {canUseSnapshot && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void restoreSnapshot(run.runId)}
          >
            {withIcons && <RotateCw className="size-3.5" />}
            {t("projectShell.historyUi.restore")}
          </Button>
        )}
        {canDownloadDocument && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            onClick={() => void downloadDocumentRun(run.runId)}
          >
            {withIcons && <Download className="size-3.5" />}
            {t("projectShell.historyUi.download")}
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="outline"
            {...buttonSizeProps}
            className=""
            onClick={() => void deleteRun(run.runId)}
          >
            {withIcons && <Trash2 className="size-3.5" />}
            {t("projectShell.historyUi.delete")}
          </Button>
        )}
      </div>
    );
  };
  const selectedErrorRun = runs.find((run) => run.runId === selectedErrorRunId);

  const formatRunDuration = (run: PlatformRunSummary) => {
    if (!run.startedAt) return t("projectShell.historyUi.noTime");
    const startedAt = new Date(run.startedAt).getTime();
    if (!run.completedAt) {
      return run.status === "running" || run.status === "queued"
        ? t("projectShell.historyUi.running")
        : t("projectShell.historyUi.noTime");
    }
    const seconds = Math.round((new Date(run.completedAt).getTime() - startedAt) / 1000);
    if (Number.isNaN(seconds) || seconds < 0) return t("projectShell.historyUi.noTime");
    if (seconds < 60) return t("generation.drawer.seconds", { count: seconds });
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest > 0
      ? t("generation.drawer.minuteSeconds", { minutes, seconds: rest })
      : t("generation.drawer.minutes", { count: minutes });
  };

  // Shared AdminCN datatable composition: Card py-0 -> Table -> TablePagination.
  const runTable = (
    <Card as="section" className="min-w-0 max-w-full overflow-hidden border py-0 shadow-none ring-0">
      <TableToolbar
        search={searchFilter}
        onSearchChange={(value) => {
          setSearchFilter(value);
          setPage(1);
        }}
        searchPlaceholder={t("projectShell.historyUi.searchPlaceholder")}
        searchLabel={t("projectShell.historyUi.operatorFilter")}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
        filters={
          <>
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span>{t("projectShell.historyUi.filterLabels.status")}</span>
              <SelectControl
                aria-label={t("projectShell.historyUi.statusFilter")}
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                className="w-32"
                options={[
                  { value: "all", label: t("projectShell.historyUi.allStatuses") },
                  ...statuses.map((status) => ({
                    value: status,
                    label: getProjectRunStatusLabel(status, t),
                  })),
                ]}
              />
            </label>
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span>{t("projectShell.historyUi.filterLabels.category")}</span>
              <SelectControl
                aria-label={t("projectShell.historyUi.stageFilter")}
                value={stageFilter}
                onValueChange={(value) => {
                  setStageFilter(value);
                  setPage(1);
                }}
                className="w-36"
                options={categories.map(([value, label]) => ({ value, label }))}
              />
            </label>
          </>
        }
      />
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[15%]">{t("projectShell.historyUi.columns.time")}</TableHead>
            <TableHead className="w-[14%]">{t("projectShell.historyUi.columns.kind")}</TableHead>
            <TableHead className="w-[11%]">{t("projectShell.historyUi.columns.model")}</TableHead>
            <TableHead className="w-[9%]">{t("projectShell.historyUi.columns.status")}</TableHead>
            <TableHead className="w-[11%]">{t("projectShell.historyUi.columns.operator")}</TableHead>
            <TableHead className="w-[8%]">{t("projectShell.historyUi.columns.duration")}</TableHead>
            <TableHead className="w-[32%]">{t("projectShell.historyUi.columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRuns.map((run) => {
            const historyItem = historyItems.find((item) => item.id === run.runId);
            const hasSnapshot = Boolean(historyItem) || Boolean(run.snapshotAvailable);
            const hasDocumentSnapshot =
              Boolean(run.documentDownloadAvailable) ||
              Boolean(historyItem?.snapshot && isDocumentRunSnapshot(historyItem.snapshot));
            const stageLabel = getProjectRunStageLabel(run, t);
            const statusLabel = getProjectRunStatusLabel(run.status, t);
            const statusClasses = getProjectRunStatusClasses(run.status);
            const displayTime = getProjectRunDisplayTime(run);
            const relation = runRelationText(run, t);
            return (
              <TableRow key={run.runId} className="align-top">
                <TableCell className="overflow-hidden text-ellipsis text-muted-foreground whitespace-nowrap">
                  <span title={displayTime ? formatDateTime(displayTime, locale) : t("projectShell.historyUi.noTime")}>
                    {displayTime ? formatDateTime(displayTime, locale) : t("projectShell.historyUi.noTime")}
                  </span>
                </TableCell>
                <TableCell className="min-w-0 overflow-hidden">
                  <div className="truncate font-medium" title={stageLabel}>
                    {stageLabel}
                  </div>
                  {relation && (
                    <div className="text-muted-foreground truncate text-xs" title={relation}>
                      {relation}
                    </div>
                  )}
                </TableCell>
                <TableCell className="overflow-hidden text-ellipsis" title={getProjectRunModelLabel(run)}>
                  {getProjectRunModelLabel(run)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusClasses.badge}>
                    {statusLabel}
                  </Badge>
                </TableCell>
                <TableCell className="overflow-hidden text-ellipsis" title={getProjectRunOperatorLabel(run, members)}>
                  {getProjectRunOperatorLabel(run, members)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatRunDuration(run)}
                </TableCell>
                <TableCell className="overflow-hidden">
                  {renderRunActions({
                    run,
                    hasSnapshot,
                    hasDocumentSnapshot,
                    size: "sm",
                    withIcons: true,
                  })}
                </TableCell>
              </TableRow>
            );
          })}
          {runs.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <div className="text-muted-foreground p-4 text-center text-sm">
                  {t("projectShell.historyUi.empty")}
                </div>
              </TableCell>
            </TableRow>
          )}
          {runs.length > 0 && filteredRuns.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <div className="text-muted-foreground p-4 text-center text-sm">
                  {t("projectShell.historyUi.noMatches")}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <TablePagination
        total={filteredRuns.length}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
        itemLabel={t("projectShell.historyUi.countLabel", { defaultValue: "条运行记录" })}
      />
    </Card>
  );

  if (layout === "drawer") {
    return (
      <div className="grid min-w-0 gap-4">
        {runTable}
        {selectedErrorRun && (
          <Alert variant="destructive" className="grid gap-2 text-xs">
            <div>{localizeApiFailure(selectedErrorRun.error ? { error: selectedErrorRun.error } : null, 500)}</div>
            <div className="text-muted-foreground">任务编号：{selectedErrorRun.runId}</div>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      {runTable}
      {selectedErrorRun && (
        <Alert variant="destructive" className="grid gap-2 text-sm">
          <div>{selectedErrorRun.error || selectedErrorRun.errorMessage
            ? localizeApiFailure(selectedErrorRun.error ? { error: selectedErrorRun.error } : null, 500)
            : t("errors.http.unknown")}</div>
          <div className="text-muted-foreground text-xs">任务编号：{selectedErrorRun.runId}</div>
        </Alert>
      )}
    </div>
  );
}
