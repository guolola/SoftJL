// Renders the requirement rule table, pagination, and inline review-status controls.
import { Card } from "../../../shared/ui/card";
import { TableCell } from '../../../shared/ui/table';
import { TableBody } from '../../../shared/ui/table';
import { TableHead } from '../../../shared/ui/table';
import { TableRow } from '../../../shared/ui/table';
import { TableHeader } from '../../../shared/ui/table';
import { Table } from '../../../shared/ui/table';
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type {
  AtomicRequirement,
  RequirementQualityIssue,
} from "@uml-platform/contracts";
import { Plus, Trash2 } from "lucide-react";
import {
  RULE_CATEGORY_ORDER,
  type RequirementRule,
} from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import { TablePagination, TableToolbar } from "../../../shared/template/layout/page";
import { cn } from "../../../shared/ui/utils";
import {
  requirementHintCount,
  requirementRowState,
  requirementStateTone,
  reviewCandidateDecisionLabel,
  reviewCandidateStateLabel,
} from "../lib/requirement-review-view-model";

export const REQUIREMENT_RULES_PER_PAGE = 10;
export const ALL_RULE_CATEGORIES = "";

const RULE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const RULE_ROW_CLASS = "h-[46px] md:h-[60px]";

function categoryLabel(category: RequirementRule["category"], t: TFunction) {
  const key = {
    "业务规则": "business",
    "功能需求": "functional",
    "外部接口": "externalInterface",
    "界面需求": "interface",
    "数据需求": "data",
    "非功能需求": "nonFunctional",
    "部署需求": "deployment",
    "异常处理": "exception",
  }[category];
  return t(`requirements.categories.${key}`);
}

function statusLabel(status: string, t: TFunction) {
  const key = {
    "已编辑": "edited",
    "已生成": "generated",
    "已确认": "confirmed",
    "有待确认提示": "pending",
    "存在冲突提示": "conflict",
    "修复失败待重试": "repairFailed",
    "修复结果待确认": "repairPending",
    "已采纳修复": "repairAccepted",
    "已拒绝修复": "repairRejected",
  }[status];
  return key ? t(`requirements.statuses.${key}`) : status;
}

export type RequirementRuleCategoryFilter =
  | RequirementRule["category"]
  | typeof ALL_RULE_CATEGORIES;

interface RequirementRulesTableProps {
  canEditRequirements: boolean;
  currentRulePage: number;
  deleteRequirementRule: (id: string) => void;
  editBlockedReason: string;
  emptyRuleSlots: number;
  filteredRules: RequirementRule[];
  firstRuleIndex: number;
  generating: boolean;
  lastRuleIndex: number;
  onAddRule: () => void;
  onOpenHintDetail: (ruleId: string) => void;
  pagedRules: RequirementRule[];
  qualityIssuesByRequirementId: Map<string, RequirementQualityIssue[]>;
  query: string;
  requirementByRuleId: Map<string, AtomicRequirement>;
  requirementReviewCandidates: WorkspaceRecord["requirementReviewCandidates"];
  ruleCategoryFilter: RequirementRuleCategoryFilter;
  rulePageSize: number;
  rulesCount: number;
  safeRulePage: number;
  setCurrentRulePage: Dispatch<SetStateAction<number>>;
  setQuery: (query: string) => void;
  setRuleCategoryFilter: (filter: RequirementRuleCategoryFilter) => void;
  setRulePageSize: (pageSize: number) => void;
  totalRulePages: number;
  updateRequirementRule: (id: string, patch: Partial<RequirementRule>) => void;
}

export function RequirementRulesTable({
  canEditRequirements,
  currentRulePage,
  deleteRequirementRule,
  editBlockedReason,
  emptyRuleSlots,
  filteredRules,
  firstRuleIndex,
  generating,
  lastRuleIndex,
  onAddRule,
  onOpenHintDetail,
  pagedRules,
  qualityIssuesByRequirementId,
  query,
  requirementByRuleId,
  requirementReviewCandidates,
  ruleCategoryFilter,
  rulePageSize,
  safeRulePage,
  setCurrentRulePage,
  setQuery,
  setRuleCategoryFilter,
  setRulePageSize,
  totalRulePages,
  updateRequirementRule,
}: RequirementRulesTableProps) {
  const { t } = useTranslation();
  return (
    <Card as="section" className="w-full min-w-0 max-w-full gap-0 overflow-hidden border py-0 ring-0">
      <div
        data-testid="requirement-rules-toolbar"
        className="min-w-0 max-w-full overflow-hidden"
      >
        <TableToolbar
          search={query}
          onSearchChange={setQuery}
          searchPlaceholder={t("requirements.table.search")}
          searchLabel={t("requirements.table.search")}
          className="px-3 py-2 md:px-6 md:py-3"
          rowsPerPage={rulePageSize}
          onRowsPerPageChange={(value) => {
            setRulePageSize(value);
            setCurrentRulePage(1);
          }}
          rowsPerPageOptions={RULE_PAGE_SIZE_OPTIONS.map(String)}
          filters={
            <SelectControl
              value={ruleCategoryFilter}
              onValueChange={(value) =>
                setRuleCategoryFilter(value as RequirementRuleCategoryFilter)
              }
              className="w-20 shrink-0 text-foreground sm:w-36"
              aria-label={t("requirements.table.categoryFilter")}
              options={[
                { value: ALL_RULE_CATEGORIES, label: t("requirements.table.allCategories") },
                ...RULE_CATEGORY_ORDER.map((category) => ({
                  value: category,
                  label: categoryLabel(category, t),
                })),
              ]}
            />
          }
          actions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="size-9 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-3"
              onClick={onAddRule}
              disabled={generating || !canEditRequirements}
              title={!canEditRequirements ? editBlockedReason : undefined}
            >
              <Plus className="size-3.5" />
              <span className="sr-only sm:not-sr-only">{t("requirements.table.add")}</span>
            </Button>
          }
        />
      </div>
      <div className="w-full min-w-0 max-w-full overflow-x-auto">
        <Table
          data-testid="requirement-rules-compact-table"
          className="w-full min-w-[900px] table-fixed border-collapse bg-card text-[12px] md:text-sm"
        >
          <TableHeader className="text-[11px] tracking-normal text-muted-foreground md:text-xs md:tracking-[0.02em]">
            <TableRow className="border-b border-border">
              <TableHead className="w-[32px] px-1.5 py-2 text-center font-medium md:w-[84px] md:px-6 md:py-4">
                {t("requirements.table.id")}
              </TableHead>
              <TableHead className="w-[112px] px-1.5 py-2 text-center font-medium md:w-48 md:px-4 md:py-4">
                {t("requirements.table.type")}
              </TableHead>
              <TableHead className="w-[84px] px-1.5 py-2 text-left font-medium md:w-52 md:px-4 md:py-4">
                {t("requirements.table.status")}
              </TableHead>
              <TableHead className="px-1.5 py-2 text-left font-medium md:px-6 md:py-4">
                {t("requirements.table.content")}
              </TableHead>
              <TableHead className="w-[28px] px-1 py-2 text-center font-medium md:w-28 md:px-6 md:py-4">
                {t("requirements.table.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRules.length === 0 ? (
              <TableRow
                data-testid="requirement-rule-row-slot"
                className={cn(RULE_ROW_CLASS, "border-b border-border")}
              >
                <TableCell
                  colSpan={5}
                  className="px-3 py-2 text-center align-middle text-[12px] text-muted-foreground md:px-6 md:py-3 md:text-sm"
                >
                  {t("requirements.table.noMatches")}
                </TableCell>
              </TableRow>
            ) : (
              pagedRules.map((rule) => {
                const requirement = requirementByRuleId.get(rule.id);
                const qualityIssues = requirement
                  ? (qualityIssuesByRequirementId.get(requirement.id) ?? [])
                  : [];
                const rowState = requirement
                  ? requirementRowState(requirement, qualityIssues)
                  : t("requirements.table.edited");
                const candidate = requirementReviewCandidates[rule.id];
                const displayRowState = reviewCandidateStateLabel(
                  candidate,
                  rowState,
                );
                const reviewDecisionLabel =
                  reviewCandidateDecisionLabel(candidate);
                const hintCount =
                  requirementHintCount(requirement) + qualityIssues.length;
                const hasHintDetails = Boolean(
                  requirement && (hintCount > 0 || candidate),
                );
                const statusContent = displayRowState ? (
                  <>
                    <Badge
                      variant="outline"
                      className={cn(
                        "max-w-full px-1 py-0.5 text-[10px] md:max-w-[112px] md:px-2 md:py-1 md:text-xs",
                        candidate?.status === "failed"
                          ? ""
                          : requirementStateTone(displayRowState),
                      )}
                    >
                      <span className="truncate">{statusLabel(displayRowState, t)}</span>
                    </Badge>
                    {reviewDecisionLabel && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 px-1 py-0.5 text-[10px] md:px-1.5 md:text-[11px]"
                      >
                        {statusLabel(reviewDecisionLabel, t)}
                      </Badge>
                    )}
                  </>
                ) : null;
                return (
                  <TableRow
                    key={rule.id}
                    id={`rule-${rule.id}`}
                    data-testid="requirement-rule-row-slot"
                    className={cn(
                      RULE_ROW_CLASS,
                      "border-b border-border transition-colors hover:bg-muted/30",
                    )}
                  >
                    <TableCell className="px-1.5 py-2 text-center align-middle md:px-6 md:py-3">
                      <span className="font-mono text-[11px] uppercase text-muted-foreground md:text-xs">
                        {rule.id}
                      </span>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 text-center align-middle md:px-4 md:py-3">
                      <SelectControl
                        value={rule.category}
                        onValueChange={(value) =>
                          canEditRequirements
                            ? updateRequirementRule(rule.id, {
                                category: value as RequirementRule["category"],
                              })
                            : undefined
                        }
                        className="mx-auto h-7 w-auto min-w-[6.5rem] max-w-full border-border/70 bg-muted/20 px-2 text-[11px] text-foreground shadow-none hover:bg-muted/50 dark:bg-muted/20 dark:hover:bg-muted/40 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:justify-center md:h-8 md:text-xs"
                        contentClassName="min-w-[8rem]"
                        aria-label={t("requirements.table.categoryAria", { id: rule.id })}
                        disabled={generating || !canEditRequirements}
                        options={RULE_CATEGORY_ORDER.map((category) => ({
                          value: category,
                          label: categoryLabel(category, t),
                        }))}
                      />
                    </TableCell>
                    <TableCell className="px-1.5 py-2 align-middle md:px-4 md:py-3">
                      <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap md:gap-1.5">
                        {hasHintDetails ? (
                          <Button variant="ghost"
                            type="button"
                            className="inline-flex h-auto min-w-0 items-center justify-start gap-1 overflow-hidden rounded-none border-0 p-0 text-left md:gap-1.5"
                            aria-label={t("requirements.table.hintAria", { id: rule.id })}
                            onClick={() => onOpenHintDetail(rule.id)}
                          >
                            {statusContent}
                          </Button>
                        ) : (
                          statusContent
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-0 px-1.5 py-2 align-middle md:px-6 md:py-3">
                      <Input
                        type="text"
                        value={rule.text}
                        onChange={(event) =>
                          canEditRequirements
                            ? updateRequirementRule(rule.id, {
                                text: event.target.value,
                              })
                            : undefined
                        }
                        className="h-7 w-full min-w-0 truncate border px-2 text-[12px] md:h-8 md:px-3 md:text-sm"
                        disabled={generating || !canEditRequirements}
                        title={
                          !canEditRequirements ? editBlockedReason : rule.text
                        }
                      />
                    </TableCell>
                    <TableCell className="px-1 py-2 text-center align-middle md:px-6 md:py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="mx-auto h-7 px-1 md:h-8 md:px-2"
                        onClick={() => deleteRequirementRule(rule.id)}
                        disabled={generating || !canEditRequirements}
                        title={
                          !canEditRequirements ? editBlockedReason : undefined
                        }
                        aria-label={t("requirements.table.deleteAria", { id: rule.id })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
            {Array.from({
              length:
                filteredRules.length === 0
                  ? Math.max(0, rulePageSize - 1)
                  : emptyRuleSlots,
            }).map((_, index) => (
              <TableRow
                key={`empty-rule-slot:${safeRulePage}:${index}`}
                data-testid="requirement-rule-row-slot"
                aria-hidden="true"
                className={cn(RULE_ROW_CLASS, "border-b border-border")}
              >
                <TableCell colSpan={5} className="px-3 py-2 md:px-6 md:py-3">
                  &nbsp;
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div data-testid="requirement-rule-pagination" className="sticky bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur-md">
        <TablePagination
          total={filteredRules.length}
          page={safeRulePage}
          pageCount={totalRulePages}
          pageSize={rulePageSize}
          onPageChange={setCurrentRulePage}
          itemLabel={t("requirements.table.itemLabel", { defaultValue: "条需求" })}
        />
      </div>
    </Card>
  );
}
