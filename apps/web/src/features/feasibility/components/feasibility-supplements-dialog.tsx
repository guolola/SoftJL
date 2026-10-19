// Saves optional feasibility facts independently of generated models or an implementation plan.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { feasibilityInputsSchema, type FeasibilityInputs } from "@uml-platform/contracts";
import { Alert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { FeasibilityInputFields } from "./feasibility-input-fields";

export function FeasibilitySupplementsDialog({ inputs, blockedReason, onSave, onClose }: {
  inputs: FeasibilityInputs;
  blockedReason: string | null;
  onSave: (inputs: FeasibilityInputs) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // The overview mounts a fresh draft on each open; failed saves retain the current draft.
  const [draft, setDraft] = useState(() => structuredClone(inputs));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (saving || blockedReason) return;
    const parsed = feasibilityInputsSchema.safeParse(draft);
    if (!parsed.success) {
      setError(t("feasibility.supplements.invalidInput"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed.data);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("feasibility.supplements.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl" showCloseButton={!saving}>
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>{t("feasibility.supplements.title")}</DialogTitle>
          <DialogDescription>{t("feasibility.supplements.editorDescription")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <fieldset disabled={saving || Boolean(blockedReason)} className="min-w-0">
            <FeasibilityInputFields inputs={draft} onChange={setDraft} />
          </fieldset>
          {blockedReason && <p role="status" className="mt-4 text-sm text-muted-foreground">{blockedReason}</p>}
          {error && <Alert variant="destructive" role="alert" className="mt-4">{error}</Alert>}
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>{t("feasibility.cancel")}</Button>
          <Button type="button" disabled={saving || Boolean(blockedReason)} onClick={() => void save()}>
            {t(saving ? "feasibility.workspaceSaving" : "feasibility.supplements.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
