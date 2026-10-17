// Displays business operation history with snapshot inspection and record deletion.
import { Card } from "../../../shared/ui/card";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Trash2 } from "lucide-react";
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
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  formatDateTime,
  getProjectRunDisplayTime,
  getProjectRunModelLabel,
  getProjectRunOperatorLabel,
  getProjectRunOperatorSearchText,
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
  localizeCaughtFailure,
} from "../../../shared/i18n/api-errors";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";
import { getHistoryOperation, HISTORY_OPERATIONS } from "../lib/project-history-details";
import { ProjectRunDetailDialog } from "./project-run-detail-dialog";
import { runTokenConsumptionPresentation } from "../lib/run-token-consumption";

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
  const [selectedRunId, setSelectedRunId] = useState("");
  const [deletingRunIds, setDeletingRunIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { deleteRunHistory } = useWorkspaceSession();

  useEffect(() => {
    setRuns(initialRuns);
    setPage(1);
  }, [initialRuns]);

  const notifySuccess = (title: string) => showAlert({ id: "project-history-success", title, tone: "success" });
  const notifyError = (title: string) => showAlert({ id: "project-history-error", title, tone: "destructive" });

  const deleteRun = async (runId: string) => {
    const run = runs.find((item) => item.runId === runId);
    if (!run || run.status === "running" || run.status === "queued" || deletingRunIds.includes(runId)) return;
    setDeletingRunIds((current) => [...current, runId]);
    try {
      await platformApi.deleteProjectRun(projectId, runId);
      await deleteRunHistory(runId).catch(() => []);
      setRuns((current) => current.filter((run) => run.runId !== runId));
      notifySuccess(t("projectShell.historyUi.deleted"));
    } catch (deleteError) {
      notifyError(localizeCaughtFailure(deleteError, t("projectShell.historyUi.deleteFailed")));
    } finally {
      setDeletingRunIds((current) => current.filter((id) => id !== runId));
    }
  };

  const historyRuns = useMemo(() => runs.filter((run) => getHistoryOperation(run) !== null), [runs]);
  const statuses = useMemo(
    () => Array.from(new Set(historyRuns.map((run) => run.status).filter(Boolean))),
    [historyRuns],
  );
  const categories = [
    ["all", t("projectShell.historyUi.allCategories")],
    ...HISTORY_OPERATIONS.map((operation) => [operation, t(`projectShell.historyUi.operations.${operation}`)] as const),
  ] as const;
  const filteredRuns = historyRuns.filter((run) => {
    if (
      stageFilter !== "all" &&
      getHistoryOperation(run) !== stageFilter
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
  const safePage = Math.min(page, pageCount);
  const pagedRuns = filteredRuns.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Active records cannot be deleted until the task finishes.
  const renderRunActions = (run: PlatformRunSummary) => {
    const running = run.status === "running" || run.status === "queued";
    return (
      <div className="flex items-center justify-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-7 px-1 md:h-8 md:px-2"
          aria-label={t("projectShell.historyUi.viewAria", { id: run.runId })}
          title={t("projectShell.historyUi.view")}
          onClick={() => setSelectedRunId(run.runId)}><Eye className="size-3.5" /></Button>
        <Button type="button" variant="destructive" size="sm" className="h-7 px-1 md:h-8 md:px-2"
          aria-label={t("projectShell.historyUi.deleteAria", { id: run.runId })}
          title={running ? t("projectShell.historyUi.deleteBlocked") : t("projectShell.historyUi.delete")}
          disabled={running || deletingRunIds.includes(run.runId)}
          onClick={() => void deleteRun(run.runId)}><Trash2 className="size-3.5" /></Button>
        {running && <span className="sr-only">{t("projectShell.historyUi.deleteBlocked")}</span>}
      </div>
    );
  };
  const selectedRun = historyRuns.find((run) => run.runId === selectedRunId);

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
      <Table className="min-w-[1000px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[18%]">{t("projectShell.historyUi.columns.time")}</TableHead>
            <TableHead className="w-[15%]">{t("projectShell.historyUi.columns.kind")}</TableHead>
            <TableHead className="w-[15%]">{t("projectShell.historyUi.columns.model")}</TableHead>
            <TableHead className="w-[10%]">{t("projectShell.historyUi.columns.status")}</TableHead>
            <TableHead className="w-[10%]">{t("projectShell.historyUi.columns.operator")}</TableHead>
            <TableHead className="w-[10%]">{t("projectShell.historyUi.columns.duration")}</TableHead>
            <TableHead className="w-[12%]">{t("projectShell.historyUi.columns.tokens")}</TableHead>
            <TableHead className="w-[10%] text-center">{t("projectShell.historyUi.columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRuns.map((run) => {
            const stageLabel = t(`projectShell.historyUi.operations.${getHistoryOperation(run)}`);
            const statusLabel = getProjectRunStatusLabel(run.status, t);
            const statusClasses = getProjectRunStatusClasses(run.status);
            const displayTime = getProjectRunDisplayTime(run);
            const tokenUsage = runTokenConsumptionPresentation(run.tokenConsumption);
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
                </TableCell>
                <TableCell className="overflow-hidden text-ellipsis" title={getProjectRunModelLabel(run, t)}>
                  {getProjectRunModelLabel(run, t)}
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
                <TableCell className="whitespace-nowrap">
                  <span className="font-mono tabular-nums">{tokenUsage.metrics.total ?? t("projectShell.historyUi.tokens.unknown")}</span>
                  {tokenUsage.partial && <span className="block text-xs text-warning">{t("projectShell.historyUi.tokens.partial")}</span>}
                </TableCell>
                <TableCell className="overflow-hidden">
                  {renderRunActions(run)}
                </TableCell>
              </TableRow>
            );
          })}
          {historyRuns.length === 0 && (
            <TableRow>
              <TableCell colSpan={8}>
                <div className="text-muted-foreground p-4 text-center text-sm">
                  {t("projectShell.historyUi.empty")}
                </div>
              </TableCell>
            </TableRow>
          )}
          {historyRuns.length > 0 && filteredRuns.length === 0 && (
            <TableRow>
              <TableCell colSpan={8}>
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
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPage}
        itemLabel={t("projectShell.historyUi.countLabel", { defaultValue: "条运行记录" })}
      />
    </Card>
  );

  return (
    <div className="grid min-w-0 gap-4" data-layout={layout}>
      {runTable}
      {selectedRun && <ProjectRunDetailDialog key={`${projectId}:${selectedRun.runId}`} projectId={projectId} run={selectedRun} onClose={() => setSelectedRunId("")} />}
    </div>
  );
}
