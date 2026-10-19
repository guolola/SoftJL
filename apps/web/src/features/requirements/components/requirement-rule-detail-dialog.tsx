// Edits requirement type/text and displays preserved source evidence and fixed model routing.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RequirementRuleType } from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import { RequirementRuleFields } from "./requirement-rule-fields";
import { Textarea } from "../../../shared/ui/textarea";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";

export function RequirementRuleDetailDialog({ rule, onOpenChange, onSave, canEdit = false }: {
  rule: RequirementRule | null;
  onOpenChange: (open: boolean) => void;
  canEdit?: boolean;
  onSave?: (id: string, patch: Partial<RequirementRule>) => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<RequirementRuleType>(rule?.type ?? "functional");
  const [text, setText] = useState(rule?.text ?? "");
  useEffect(() => { if (rule) { setType(rule.type); setText(rule.text); } }, [rule]);
  const sourceFragment = rule?.sourceFragment?.trim();
  return <Dialog open={Boolean(rule)} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t("requirements.table.detailTitle")}</DialogTitle>
        <DialogDescription>{t("requirements.table.detailDescription")}</DialogDescription>
      </DialogHeader>
      {rule && <div className="grid max-h-[60vh] gap-4 overflow-auto text-sm">
        <span className="font-mono text-xs uppercase text-muted-foreground">{rule.id}</span>
        <RequirementRuleFields value={type} onChange={setType} disabled={!canEdit} />
        <label className="grid gap-2">{t("requirements.newRule.text")}
          <Textarea aria-label={t("requirements.newRule.text")} value={text} disabled={!canEdit} onChange={event => setText(event.target.value)} />
        </label>
        {sourceFragment && <p className="text-xs leading-5 text-muted-foreground">{t("requirements.table.detailSource")}：{sourceFragment}</p>}
      </div>}
      <DialogFooter>
        {canEdit && rule && onSave && <Button type="button" disabled={!text.trim()} onClick={() => {
          if (!text.trim()) return;
          onSave(rule.id, { type, text: text.trim() }); onOpenChange(false);
        }}>{t("common.save")}</Button>}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
