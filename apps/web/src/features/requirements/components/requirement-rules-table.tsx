// Renders the requirement rule table, pagination, and per-rule view/delete actions.
import { Card } from "../../../shared/ui/card";
import { TableCell } from '../../../shared/ui/table';
import { TableBody } from '../../../shared/ui/table';
import { TableHead } from '../../../shared/ui/table';
import { TableRow } from '../../../shared/ui/table';
import { TableHeader } from '../../../shared/ui/table';
import { Table } from '../../../shared/ui/table';
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Plus, Trash2 } from "lucide-react";
import type { RequirementRuleType } from "@uml-platform/contracts";
import {
  REQUIREMENT_KIND_ORDER,
  type RequirementRule,
} from "../../../entities/requirement-rule/model";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import { TablePagination, TableToolbar } from "../../../shared/template/layout/page";
import { cn } from "../../../shared/ui/utils";

export const REQUIREMENT_RULES_PER_PAGE = 10;
export const ALL_RULE_CATEGORIES = "";

const RULE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const RULE_ROW_CLASS = "h-[46px] md:h-[60px]";


export type RequirementRuleCategoryFilter =
  | RequirementRuleType
  | typeof ALL_RULE_CATEGORIES;

interface RequirementRulesTableProps {
  canEditRequirements: boolean;
  deleteRequirementRule: (id: string) => void;
  editBlockedReason: string;
  emptyRuleSlots: number;
  filteredRules: RequirementRule[];
  firstRuleIndex: number;
  generating: boolean;
  onAddRule: () => void;
  onViewRule: (ruleId: string) => void;
  pagedRules: RequirementRule[];
  query: string;
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
  deleteRequirementRule,
  editBlockedReason,
  emptyRuleSlots,
  filteredRules,
  firstRuleIndex: firstRuleIndex,
  generating,
  onAddRule,
  onViewRule,
  pagedRules,
  query,
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
                ...REQUIREMENT_KIND_ORDER.map((category) => ({
                  value: category,
                  label: t(`requirementSemantics.kinds.${category}`),
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
          className="w-full table-fixed border-collapse bg-card text-[12px] md:text-sm"
        >
          <TableHeader className="text-[11px] tracking-normal text-muted-foreground md:text-xs md:tracking-[0.02em]">
            <TableRow className="border-b border-border">
              <TableHead className="w-[32px] px-1.5 py-2 text-center font-medium md:w-[84px] md:px-6 md:py-4">
                {t("requirements.table.id")}
              </TableHead>
              <TableHead className="w-[112px] px-1.5 py-2 text-center font-medium md:w-48 md:px-4 md:py-4">
                {t("requirements.table.type")}
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
                  colSpan={4}
                  className="px-3 py-2 text-center align-middle text-[12px] text-muted-foreground md:px-6 md:py-3 md:text-sm"
                >
                  {t("requirements.table.noMatches")}
                </TableCell>
              </TableRow>
            ) : (
              pagedRules.map((rule, index) => {

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
                        {/* Visible row numbers are independent of persistent traceability IDs. */}
                        {firstRuleIndex + index}
                      </span>
                    </TableCell>
                    <TableCell className="px-1.5 py-2 text-center align-middle md:px-4 md:py-3">
                      <SelectControl
                        value={rule.type}
                        onValueChange={(value) =>
                          canEditRequirements
                            ? updateRequirementRule(rule.id, {
                                type: value as RequirementRuleType,
                              })
                            : undefined
                        }
                        className="mx-auto h-7 w-auto min-w-[6.5rem] max-w-full border-border/70 bg-muted/20 px-2 text-[11px] text-foreground shadow-none hover:bg-muted/50 dark:bg-muted/20 dark:hover:bg-muted/40 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:justify-center md:h-8 md:text-xs"
                        contentClassName="min-w-[8rem]"
                        aria-label={t("requirements.table.categoryAria", { id: rule.id })}
                        disabled={generating || !canEditRequirements}
                        options={REQUIREMENT_KIND_ORDER.map((category) => ({
                          value: category,
                          label: t(`requirementSemantics.kinds.${category}`),
                        }))}
                      />
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
                      <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-1 md:h-8 md:px-2"
                        onClick={() => onViewRule(rule.id)}
                        aria-label={t("requirements.table.viewAria", { id: rule.id })}
                        title={t("requirements.table.view")}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mx-auto h-7 px-1 md:h-8 md:px-2"
                        onClick={() => {
                          // Confirm before committing: deleting a rule also invalidates downstream results.
                          if (!generating && canEditRequirements && window.confirm(t("uxReview.confirmDeleteRule", { id: rule.id.toUpperCase() }))) {
                            deleteRequirementRule(rule.id);
                          }
                        }}
                        disabled={generating || !canEditRequirements}
                        title={
                          !canEditRequirements ? editBlockedReason : undefined
                        }
                        aria-label={t("requirements.table.deleteAria", { id: rule.id })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                      </div>
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
                <TableCell colSpan={4} className="px-3 py-2 md:px-6 md:py-3">
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
