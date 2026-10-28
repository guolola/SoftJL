// Renders element-level traceability from persisted generation mappings.
import { Card } from "../../../shared/ui/card";
import { CircularProgress } from "../../../shared/ui/circular-progress";
import { TableCell } from '../../../shared/ui/table';
import { TableBody } from '../../../shared/ui/table';
import { TableHead } from '../../../shared/ui/table';
import { TableRow } from '../../../shared/ui/table';
import { TableHeader } from '../../../shared/ui/table';
import { Table } from '../../../shared/ui/table';
import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Network,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { FeedbackReopenButton, type FeedbackDialogState } from "../../../shared/ui/feedback-dialog";
import { SelectControl } from "../../../shared/ui/select";
import {
  PageContainer,
  PageHeader,
  TablePagination,
  TableToolbar,
} from "../../../shared/template/layout/page";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  ALL_GROUPS,
  PAGE_SIZE_OPTIONS,
  type TraceabilityRowCopy,
  buildDesignRows,
  buildContextRows,
  buildGroupOptions,
  buildRequirementRows,
  designGroupLabel,
  formatRuleId,
  includesQuery,
  requirementGroupLabel,
  type MatrixScope,
  type RowStatus,
} from "../lib/traceability-rows";
import { buildBusinessFlowRows } from "../lib/business-flow-rows";
import type {
  FeasibilityBusinessFlowArtifact,
  ContextDiagramSpec,
  ContextTraceRow,
  DesignDiagramKind,
  DiagramKind,
  RequirementRule,
} from "@uml-platform/contracts";
import {
  getDesignDiagramLabel,
  getDesignModelId,
  getDiagramLabel,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import type { SemanticElementKind } from "../../../entities/diagram/lib/model-details";

type MatrixMode = "requirements" | "design" | "context" | "business-flow";
type ContextMatrixData = {
  model: ContextDiagramSpec | null;
  traceability: ContextTraceRow[];
  rules: RequirementRule[];
  stale: boolean;
};
type TraceabilityRef = {
  diagramKind?: DiagramKind | DesignDiagramKind;
  label?: string;
};

function ChipList({
  items,
  emptyText,
}: {
  items: string[];
  emptyText: string;
}) {
  const visible = items.slice(0, 3);
  const rest = items.length - visible.length;
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">{emptyText}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((item) => (
        <Badge
          key={item}
          title={item}
          variant="secondary"
          className="max-w-56 truncate text-[10px]"
        >
          {item}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="outline" className="text-[10px]">
          +{rest}
        </Badge>
      )}
    </div>
  );
}

function createTraceabilityCopy(t: TFunction): TraceabilityRowCopy {
  return {
    semanticKindLabel: (kind: SemanticElementKind) =>
      t(`diagrams.semantic.${kind}.label`, { defaultValue: kind }),
    requirementGroupLabel: (diagramKind) =>
      getDiagramLabel(diagramKind as DiagramType, t),
    designGroupLabel: (diagramKind) =>
      getDesignDiagramLabel(diagramKind as DesignDiagramType, t),
    step: (order) => t(order ? "traceability.rows.stepWithOrder" : "traceability.rows.step", { order }),
    systemResponse: (response) => t("traceability.rows.systemResponse", { response }),
    eventFlow: (flowType, flowLabel) =>
      flowType
        ? t("traceability.rows.eventFlowWithType", { flowType, flowLabel })
        : t("traceability.rows.eventFlow", { flowLabel }),
    derivedFromSourceUseCaseFlow: t("traceability.rows.derivedFromSourceUseCaseFlow"),
    missingSourceUseCaseOrEventFlow: t("traceability.rows.missingSourceUseCaseOrEventFlow"),
    sourceUseCase: (label) => t("traceability.rows.sourceUseCase", { label }),
    sourceUseCaseMissing: t("traceability.rows.sourceUseCaseMissing"),
    sourceUseCaseRealization: (modelLabel, elementLabel) =>
      t("traceability.rows.sourceUseCaseRealization", { modelLabel, elementLabel }),
    requirementElement: (groupLabel, elementLabel) =>
      t("traceability.rows.requirementElement", { groupLabel, elementLabel }),
    context: {
      noDescription: t("traceability.context.noDescription"),
      people: t("traceability.context.people"),
      externalSystems: t("traceability.context.externalSystems"),
      relationships: t("traceability.context.relationships"),
      directedInteraction: t("traceability.context.directedInteraction"),
      bidirectionalInteraction: t("traceability.context.bidirectionalInteraction"),
      invalidSources: (sources) => t("traceability.context.invalidSources", { sources }),
      incompleteTrace: t("traceability.context.incompleteTrace"),
      deterministicMapping: t("traceability.context.deterministicMapping"),
      missingSource: t("traceability.context.missingSource"),
      sourceRules: (rules) => t("traceability.context.sourceRules", { rules }),
      unmapped: t("traceability.context.unmapped"),
      endpoints: (source, target) => t("traceability.context.endpoints", { source, target }),
      direction: (direction) => t("traceability.context.direction", { direction }),
      directed: t("traceability.context.directed"),
      bidirectional: t("traceability.context.bidirectional"),
    },
  };
}

function designRefLabel(
  ref: TraceabilityRef,
  copy: TraceabilityRowCopy,
  t: TFunction,
  refSeparator: string,
) {
  return `${designGroupLabel(ref.diagramKind ?? "sequence", copy)}${refSeparator}${ref.label ?? t("traceability.unnamedElement")}`;
}

function requirementRefLabel(
  ref: TraceabilityRef,
  copy: TraceabilityRowCopy,
  t: TFunction,
  refSeparator: string,
) {
  return `${requirementGroupLabel(ref.diagramKind ?? "usecase", copy)}${refSeparator}${ref.label ?? t("traceability.unnamedElement")}`;
}

function StatusBadge({ status, t }: { status: RowStatus; t: TFunction }) {
  const Icon = status === "mapped" ? CheckCircle2 : AlertTriangle;
  return (
    <Badge
      variant={status === "mapped" ? "secondary" : "destructive"}
      className={cn("gap-1", status === "mapped" && "bg-success/10 text-success")}
    >
      <Icon className="size-3.5" />
      {status === "mapped" ? t("traceability.status.mapped") : t("traceability.status.unmapped")}
    </Badge>
  );
}

export function TraceabilityMatrixPage({
  mode,
  scope,
  contextData,
  businessFlowData,
}: {
  mode: MatrixMode;
  scope?: MatrixScope;
  contextData?: ContextMatrixData;
  businessFlowData?: { artifact: FeasibilityBusinessFlowArtifact | null; rules: RequirementRule[]; stale: boolean };
}) {
  const { t } = useTranslation();
  const {
    rules,
    models,
    designModels,
    requirementModelTraceability,
    designModelTraceability,
    staleRequirementModelIds,
    staleDesignModelIds,
  } = useWorkspaceSession();
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const isDesign = mode === "design";
  const isBusinessFlow = mode === "business-flow";
  const isContext = mode === "context" || isBusinessFlow;
  const feasibilityCopyPrefix = isBusinessFlow ? "traceability.businessFlow" : "traceability.context";
  const isAnalysisRequirementScope = !isDesign && scope?.diagramKind === "analysis";
  const refSeparator = t("traceability.refSeparator");
  const traceabilityCopy = useMemo(() => createTraceabilityCopy(t), [t]);
  const rows = useMemo(
    () =>
      isBusinessFlow ? buildBusinessFlowRows(businessFlowData?.artifact ?? null, businessFlowData?.rules ?? [], traceabilityCopy) : isContext
        ? buildContextRows(
            contextData?.rules ?? [],
            contextData?.model ?? null,
            contextData?.traceability ?? [],
            traceabilityCopy,
          )
        : isDesign
        ? buildDesignRows(models, designModels, designModelTraceability, scope, traceabilityCopy)
        : buildRequirementRows(
            rules,
            models,
            requirementModelTraceability,
            scope,
            traceabilityCopy,
          ),
    [
      designModelTraceability,
      designModels,
      contextData,
      businessFlowData,
      isBusinessFlow,
      isContext,
      isDesign,
      models,
      requirementModelTraceability,
      rules,
      scope,
      traceabilityCopy,
    ],
  );
  const groupOptions = useMemo(() => buildGroupOptions(rows), [rows]);
  // Measure the scoped matrix, so searching and pagination cannot inflate coverage.
  const mappedCount = rows.filter((row) => row.status === "mapped").length;
  const mappingRate = rows.length > 0 ? Math.round((mappedCount / rows.length) * 100) : 0;
  const filteredRows = rows.filter(
    (row) =>
      (groupFilter === ALL_GROUPS || row.groupKey === groupFilter) &&
      includesQuery(row, query),
  );
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const pageStart = (effectivePage - 1) * pageSize;
  const paginatedRows = filteredRows.slice(pageStart, pageStart + pageSize);
  const selectedRow =
    filteredRows.find((row) => row.id === selectedRowId) ?? paginatedRows[0] ?? null;
  const hasTraceability = isContext
    ? rows.length > 0
    : isDesign
    ? designModelTraceability.length > 0
    : isAnalysisRequirementScope
      ? rows.length > 0
      : requirementModelTraceability.length > 0;
  const isTraceabilityStale = isContext
    ? Boolean(isBusinessFlow ? businessFlowData?.stale : contextData?.stale)
    : isDesign
    ? Object.values(designModels).some(model => staleDesignModelIds.includes(getDesignModelId(model)) &&
        (!scope || (scope.modelId ? getDesignModelId(model) === scope.modelId : model.diagramKind === scope.diagramKind)))
    : isAnalysisRequirementScope
      ? false
      : Object.values(models).some(model => model && staleRequirementModelIds.includes(getRequirementModelId(model)) &&
          (!scope || (scope.modelId ? getRequirementModelId(model) === scope.modelId : model.diagramKind === scope.diagramKind)));
  const missingTraceabilityTitle = isContext
    ? t(`${feasibilityCopyPrefix}.missingTitle`)
    : isDesign
    ? t("traceability.missing.designTitle")
    : t("traceability.missing.requirementTitle");
  const missingTraceabilityMessage = isContext
    ? t(`${feasibilityCopyPrefix}.missingMessage`)
    : isDesign
    ? t("traceability.missing.designMessage")
    : t("traceability.missing.requirementMessage");

  useEffect(() => {
    setCurrentPage(1);
  }, [query, groupFilter, pageSize]);

  useEffect(() => {
    if (
      groupFilter !== ALL_GROUPS &&
      !groupOptions.some((option) => option.value === groupFilter)
    ) {
      setGroupFilter(ALL_GROUPS);
    }
  }, [groupFilter, groupOptions]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const scopeLabel = isContext
    ? t(`${feasibilityCopyPrefix}.label`)
    : scope?.label ??
    (isDesign
      ? designGroupLabel(scope?.diagramKind ?? "sequence", traceabilityCopy)
      : requirementGroupLabel(scope?.diagramKind ?? "usecase", traceabilityCopy));
  const title = isContext
    ? t(`${feasibilityCopyPrefix}.title`)
    : scope
    ? t("traceability.title.scoped", { label: scopeLabel })
    : isDesign
      ? t("traceability.title.design")
      : t("traceability.title.requirements");
  const description = isContext
    ? t(`${feasibilityCopyPrefix}.description`)
    : scope
    ? isDesign
      ? t("traceability.description.scopedDesign", { label: scopeLabel })
      : isAnalysisRequirementScope
        ? t("traceability.description.scopedAnalysis", { label: scopeLabel })
        : t("traceability.description.scopedRequirement", { label: scopeLabel })
    : isDesign
      ? t("traceability.description.design")
      : t("traceability.description.requirements");
  const groupFilterLabel = isContext
    ? t(`${feasibilityCopyPrefix}.filterLabel`)
    : isDesign
      ? t("traceability.filters.designModelType")
      : t("traceability.filters.requirementModelType");
  const sourceColumnLabel = isAnalysisRequirementScope ? t("traceability.columns.sourceUseCaseFlow") : t("traceability.columns.sourceRequirementRule");
  const traceabilityNoticeTitle = !hasTraceability && rows.length > 0
    ? missingTraceabilityTitle
    : hasTraceability && isTraceabilityStale
      ? isTraceabilityStale ? t("traceability.stale.title") : t("traceability.incomplete.title")
      : null;
  const traceabilityNoticeMessage = !hasTraceability && rows.length > 0
    ? missingTraceabilityMessage
    : hasTraceability && isTraceabilityStale
      ? isContext
        ? t(`${feasibilityCopyPrefix}.${isTraceabilityStale ? "staleMessage" : "missingMessage"}`)
        : isTraceabilityStale
          ? isDesign ? t("traceability.stale.designMessage") : t("traceability.stale.requirementMessage")
          : t("traceability.incomplete.message")
      : null;
  const traceabilityFeedback: FeedbackDialogState | null = traceabilityNoticeTitle && traceabilityNoticeMessage ? {
    dedupeKey: `traceability:${scope}:notice`,
    revision: `${traceabilityNoticeTitle}:${traceabilityNoticeMessage}`,
    tone: "warning",
    title: traceabilityNoticeTitle,
    message: traceabilityNoticeMessage,
    keepReopenEntry: true,
  } : null;
  return (
    <div className="flex min-h-full flex-col bg-background">
      <PageContainer className="flex flex-col gap-5">
          <PageHeader
            title={title}
            description={description}
            notice={traceabilityFeedback ? <FeedbackReopenButton feedback={traceabilityFeedback} /> : null}
            titleAccessory={
              <Badge variant="secondary" className="font-mono">
                {t("traceability.count.items", { count: rows.length })}
              </Badge>
            }
          />

          {traceabilityNoticeTitle ? <p role="status" className="flex items-center gap-2 text-sm text-warning"><AlertTriangle className="size-4" />{traceabilityNoticeTitle}</p> : null}

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <Card as="section" className="min-w-0 gap-0 overflow-hidden border py-0 ring-0">
              <TableToolbar
                leading={
                  <div className="flex shrink-0 items-center gap-2">
                    {isDesign ? (
                      <GitBranch className="size-4 text-primary" />
                    ) : (
                      <Network className="size-4 text-primary" />
                    )}
                    <h3 className="text-sm font-semibold text-foreground">
                      {isContext
                        ? t(`${feasibilityCopyPrefix}.mappingTitle`)
                        : isDesign
                          ? t("traceability.mapping.design")
                          : t("traceability.mapping.requirements")}
                    </h3>
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {filteredRows.length}/{rows.length}
                    </Badge>
                  </div>
                }
                search={query}
                onSearchChange={(value) => {
                  setQuery(value);
                  setCurrentPage(1);
                }}
                searchPlaceholder={t("traceability.searchPlaceholder")}
                searchLabel={t("traceability.searchPlaceholder")}
                filters={
                  !scope ? (
                    <label className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span>{t("traceability.filters.category")}</span>
                      <SelectControl
                        aria-label={groupFilterLabel}
                        value={groupFilter}
                        onValueChange={(value) => {
                          setGroupFilter(value);
                          setCurrentPage(1);
                        }}
                        className="h-8 min-w-32 text-sm"
                        size="sm"
                        options={[
                          { value: ALL_GROUPS, label: t("traceability.filters.allModels") },
                          ...groupOptions.map((option) => ({
                            value: option.value,
                            label: option.label,
                          })),
                        ]}
                      />
                    </label>
                  ) : null
                }
                rowsPerPage={pageSize}
                onRowsPerPageChange={(value) => {
                  setPageSize(value as typeof pageSize);
                  setCurrentPage(1);
                }}
                rowsPerPageOptions={PAGE_SIZE_OPTIONS.map(String)}
              />

              {rows.length === 0 ? (
                <div className="flex min-h-72 items-center justify-center px-6 text-center">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {t("traceability.empty.title")}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {isContext
                        ? t(`${feasibilityCopyPrefix}.emptyMessage`)
                        : isDesign
                          ? t("traceability.empty.designMessage")
                          : t("traceability.empty.requirementMessage")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="max-w-full">
                  {/* Fixed layout keeps long element names from widening the sticky column. */}
                  <Table className={cn("w-full table-fixed border-collapse text-sm", isDesign ? "min-w-[1120px]" : "min-w-[860px]")}>
                    <TableHeader className="bg-muted/20 text-xs text-muted-foreground">
                      <TableRow>
                        <TableHead className="sticky left-0 z-10 w-[200px] border-b border-r border-border bg-card px-4 py-4 text-left font-medium">
                          {isContext
                            ? t(`${feasibilityCopyPrefix}.elementColumn`)
                            : isDesign
                              ? t("traceability.columns.designElement")
                              : t("traceability.columns.requirementElement")}
                        </TableHead>
                        <TableHead className="w-[160px] border-b border-r border-border px-4 py-4 text-left font-medium">
                          {t("traceability.columns.sourceModel")}
                        </TableHead>
                        <TableHead className="w-[100px] border-b border-r border-border px-4 py-4 text-left font-medium">
                          {t("traceability.columns.type")}
                        </TableHead>
                        {isDesign && (
                          <TableHead className="w-[260px] border-b border-r border-border px-4 py-4 text-left font-medium">
                            {t("traceability.columns.sourceDesignElement")}
                          </TableHead>
                        )}
                        <TableHead className="border-b border-r border-border px-4 py-4 text-left font-medium">
                          {isDesign ? t("traceability.columns.sourceRequirementDiagram") : sourceColumnLabel}
                        </TableHead>
                        <TableHead className="w-[120px] border-b border-border px-4 py-4 text-center font-medium">
                          {t("traceability.columns.mappingStatus")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={isDesign ? 6 : 5}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            {t("traceability.empty.noMatches")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedRows.map((row) => (
                          <TableRow
                            key={row.id}
                            className={cn(
                              "cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/20",
                              selectedRow?.id === row.id && "bg-primary/5",
                            )}
                            onClick={() => setSelectedRowId(row.id)}
                          >
                            <TableCell className="sticky left-0 z-10 border-r border-border bg-card px-4 py-3 align-middle">
                              <span title={row.label} className="block min-w-0 truncate font-semibold text-foreground">
                                {row.label}
                              </span>
                            </TableCell>
                            <TableCell className="border-r border-border px-4 py-3 align-middle">
                              <Badge title={row.groupLabel} variant="secondary" className="max-w-full truncate text-[10px]">
                                {row.groupLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-normal border-r border-border px-4 py-3 align-middle text-xs text-muted-foreground">
                              {row.typeLabel}
                            </TableCell>
                            {isDesign && (
                              <TableCell className="border-r border-border px-4 py-3 align-middle">
                                <div className="flex flex-col gap-2">
                                  <ChipList
                                    items={row.upstreamDesignElements.map((ref) => designRefLabel(ref, traceabilityCopy, t, refSeparator))}
                                    emptyText={t("traceability.empty.noSourceDesignElement")}
                                  />
                                </div>
                              </TableCell>
                            )}
                            <TableCell className="border-r border-border px-4 py-3 align-middle">
                              <ChipList
                                items={
                                  isDesign
                                    ? row.requirementElements.map((ref) => requirementRefLabel(ref, traceabilityCopy, t, refSeparator))
                                    : isAnalysisRequirementScope
                                    ? row.requirementElements.map((ref) => requirementRefLabel(ref, traceabilityCopy, t, refSeparator))
                                    : row.requirementRules.map((rule) => formatRuleId(rule.id))
                                }
                                emptyText={
                                  isDesign
                                    ? t("traceability.empty.noRequirementDiagramElement")
                                    : isAnalysisRequirementScope
                                      ? t("traceability.empty.noSourceUseCase")
                                      : t("traceability.empty.noRequirementRule")
                                }
                              />
                            </TableCell>
                            <TableCell className="px-4 py-3 text-center align-middle">
                              <StatusBadge status={row.status} t={t} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <TablePagination
                    total={filteredRows.length}
                    page={effectivePage}
                    pageCount={totalPages}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    itemLabel={t("traceability.pagination.itemsSuffix")}
                    className="border-t border-border bg-muted/20"
                  />
                </div>
              )}
            </Card>

            <aside className="flex min-w-0 flex-col gap-4">
              <Card as="section" className="gap-0 p-4">
                <h3 className="text-sm font-semibold text-foreground">{t("traceability.coverage.title")}</h3>
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <CircularProgress
                    value={mappingRate}
                    size={100}
                    strokeWidth={8}
                    showLabel
                    aria-label={t("traceability.coverage.title")}
                    progressClassName="stroke-sky-600 dark:stroke-sky-400"
                    progressBgClassName="stroke-sky-600/10 dark:stroke-sky-400/10"
                    labelClassName="text-sky-600 dark:text-sky-400"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("traceability.coverage.mappedCount", { mapped: mappedCount, total: rows.length })}
                  </p>
                </div>
              </Card>

              <Card as="section" className="gap-0 py-0 p-4">
                <h3 className="text-sm font-semibold text-foreground">{t("traceability.details.title")}</h3>
                {selectedRow ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedRow.label}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {selectedRow.groupLabel} / {selectedRow.typeLabel}
                      </div>
                    </div>
                    <StatusBadge status={selectedRow.status} t={t} />
                    {selectedRow.mappingNote && (
                      <p className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm leading-6 text-primary">
                        {selectedRow.mappingNote}
                      </p>
                    )}
                    <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                      {selectedRow.detailLines.length > 0 ? (
                        selectedRow.detailLines.map((line) => (
                          <p key={line} className="rounded-lg bg-muted/40 px-3 py-2">
                            {line}
                          </p>
                        ))
                      ) : (
                        <p className="rounded-lg bg-muted/40 px-3 py-2">
                          {missingTraceabilityMessage}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {t("traceability.details.selectRow")}
                  </p>
                )}
              </Card>
            </aside>
          </div>
      </PageContainer>
    </div>
  );
}
