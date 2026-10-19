// Renders the dialog used to create a manual requirement rule.
import { Alert } from '../../../shared/ui/alert';
import { Textarea } from '../../../shared/ui/textarea';
import { useTranslation } from "react-i18next";
import { type RequirementRuleType } from "@uml-platform/contracts";
import { RequirementRuleFields } from "./requirement-rule-fields";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldSet } from "../../../shared/ui/field";

interface NewRequirementRuleDialogProps {
  canEditRequirements: boolean;
  generating: boolean;
  newRuleCanSubmit: boolean;
  newRuleError: string | null;
  newRuleText: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  onTextChange: (text: string) => void;
  open: boolean;
  type: RequirementRuleType;
  onTypeChange: (value: RequirementRuleType) => void;
}

export function NewRequirementRuleDialog({
  canEditRequirements,
  generating,
  newRuleCanSubmit,
  newRuleError,
  newRuleText,
  onOpenChange,
  onSubmit,
  onTextChange,
  open,
  type,
  onTypeChange,
}: NewRequirementRuleDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-form-layout="4" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("requirements.newRule.title")}</DialogTitle>
          <DialogDescription>
            {t("requirements.newRule.description")}
          </DialogDescription>
        </DialogHeader>

        <FieldSet className="max-h-[65vh] overflow-y-auto rounded-xl border border-border bg-muted/10 p-4 sm:p-5">
          <FieldGroup className="gap-5">
          <Field>
            <FieldLabel htmlFor="new-requirement-text">{t("requirements.newRule.text")}</FieldLabel>
            <Textarea
              id="new-requirement-text"
              value={newRuleText}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder={t("requirements.newRule.placeholder")}
              className="min-h-24 w-full resize-y border px-3 py-2 text-sm leading-relaxed"
              disabled={generating || !canEditRequirements}
            />
          </Field>
          <RequirementRuleFields value={type} disabled={generating || !canEditRequirements} onChange={onTypeChange} />

          {newRuleError && (
            <Alert variant="destructive" className="border px-3 py-2 text-xs">
              {newRuleError}
            </Alert>
          )}
          </FieldGroup>
        </FieldSet>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={generating || !newRuleCanSubmit || !canEditRequirements}
          >
            {t("requirements.newRule.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
