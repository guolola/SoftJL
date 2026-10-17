// Read-only view of one requirement rule and the structured requirement extracted from it.
import type { AtomicRequirement, AtomicRequirementField } from "@uml-platform/contracts";
import { useTranslation } from "react-i18next";
import { getDiagramLabel } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import {
  REVIEWABLE_REQUIREMENT_FIELDS,
  requirementFieldValue,
} from "../lib/requirement-review-view-model";
import { categoryLabel } from "./requirement-rules-table";

export function RequirementRuleDetailDialog({
  rule,
  requirement,
  manualFields,
  onOpenChange,
}: {
  rule: RequirementRule | null;
  requirement: AtomicRequirement | undefined;
  manualFields?: Partial<Record<AtomicRequirementField, string>>;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const fields = manualFields ? Object.entries(manualFields) : requirement
    ? REVIEWABLE_REQUIREMENT_FIELDS.map((field) => [field, requirementFieldValue(requirement, field)] as const)
        .filter(([, value]) => value.trim())
    : [];
  const sourceFragment = (rule?.sourceFragment ?? requirement?.sourceFragment)?.trim();
  return (
    <Dialog open={Boolean(rule)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("requirements.table.detailTitle")}</DialogTitle>
          <DialogDescription>{t("requirements.table.detailDescription")}</DialogDescription>
        </DialogHeader>
        {rule && (
          <div className="grid max-h-[60vh] gap-4 overflow-auto pr-1 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs uppercase text-muted-foreground">{rule.id}</span>
                <Badge variant="outline">{categoryLabel(rule.category, t)}</Badge>
              </div>
              <p className="mt-2 text-foreground">{rule.text}</p>
              {sourceFragment && sourceFragment !== rule.text.trim() && (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t("requirements.table.detailSource")}：{sourceFragment}
                </p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("requirements.table.detailModels")}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rule.relatedDiagrams.map((diagram) => (
                  <Badge key={diagram} variant="secondary">{getDiagramLabel(diagram, t)}</Badge>
                ))}
              </div>
            </div>
            {fields.length > 0 && <div>
              <h3 className="text-sm font-semibold text-foreground">{t("requirements.table.detailStructured")}</h3>
                <dl className="mt-2 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-border p-3">
                  {fields.map(([field, value]) => (
                    <div key={field} className="contents">
                      <dt className="text-muted-foreground">{t(`requirements.review.fields.${field}`)}</dt>
                      <dd className="min-w-0 break-words text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
            </div>}
          </div>
        )}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
