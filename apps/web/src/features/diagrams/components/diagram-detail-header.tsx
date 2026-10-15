// Displays model metadata as a page heading and edits it only inside a dialog.
import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../../shared/template/layout/page";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Textarea } from "../../../shared/ui/textarea";
import { MobileStatusPill, MobileStatusRail } from "../../workspace-shell/components/mobile-density";

type DiagramDetailHeaderProps = {
  modelTitle: string;
  modelSummary: string;
  canEdit: boolean;
  saving: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveStatusLabel: string;
  compactViewport: boolean;
  itemCount: number;
  relationshipCount: number;
  groupCount: number;
  notices?: ReactNode;
  actions?: ReactNode;
  onSaveMetadata: (title: string, summary: string) => Promise<boolean>;
};

function ModelCounts({ compactViewport, itemCount, relationshipCount, groupCount, saveStatus, saveStatusLabel }: Pick<DiagramDetailHeaderProps,
  "compactViewport" | "itemCount" | "relationshipCount" | "groupCount" | "saveStatus" | "saveStatusLabel">) {
  const { t } = useTranslation();
  const counts = [
    [t("diagrams.detail.items"), itemCount],
    [t("diagrams.detail.relations"), relationshipCount],
    [t("diagrams.detail.groups"), groupCount],
  ] as const;
  return compactViewport ? <MobileStatusRail>
    {counts.map(([label, count]) => <MobileStatusPill key={label}><span>{label}</span><span className="font-mono text-foreground">{count}</span></MobileStatusPill>)}
    {saveStatus !== "idle" && <MobileStatusPill><span>{t("diagrams.detail.save")}</span><span className="text-foreground">{saveStatusLabel}</span></MobileStatusPill>}
  </MobileStatusRail> : <div className="grid grid-cols-3 gap-2 text-center">
    {counts.map(([label, count]) => <div key={label} className="rounded-lg border border-border bg-muted/30 px-4 py-2">
      <div className="font-mono text-lg font-semibold text-foreground">{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>)}
  </div>;
}

export function DiagramDetailHeader({
  modelTitle, modelSummary, canEdit, saving, saveStatus, saveStatusLabel,
  compactViewport, itemCount, relationshipCount, groupCount, notices, actions, onSaveMetadata,
}: DiagramDetailHeaderProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [error, setError] = useState(false);

  const openEditor = () => {
    setTitleDraft(modelTitle);
    setSummaryDraft(modelSummary);
    setError(false);
    setEditing(true);
  };
  const closeEditor = () => {
    if (saving) return;
    setEditing(false);
    setError(false);
  };
  const saveMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !canEdit) return;
    if (titleDraft === modelTitle && summaryDraft === modelSummary) {
      closeEditor();
      return;
    }
    setError(false);
    const saved = await onSaveMetadata(titleDraft, summaryDraft);
    if (saved) setEditing(false);
    else setError(true);
  };

  return <header className="min-w-0 px-1">
    <PageHeader
      title={<span className="break-words">{modelTitle}</span>}
      description={modelSummary}
      notice={notices}
      titleAccessory={<div className="flex w-fit max-w-full flex-wrap items-center gap-2">
        {canEdit && <Button type="button" size="sm" variant="outline" className="w-auto shrink-0" disabled={saving} onClick={openEditor}>
          <Pencil aria-hidden="true" className="size-3.5" />{t("diagrams.detail.editMetadata")}
        </Button>}
      </div>}
      actions={<div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
        {actions ? <div className="flex min-w-0 flex-nowrap justify-end gap-2 overflow-x-auto pb-1">{actions}</div> : null}
        <ModelCounts compactViewport={compactViewport} itemCount={itemCount} relationshipCount={relationshipCount} groupCount={groupCount} saveStatus={saveStatus} saveStatusLabel={saveStatusLabel} />
      </div>}
    />
    {saveStatus !== "idle" && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {saveStatus === "saving" ? <span className="inline-flex items-center gap-1 text-primary"><Loader2 className="size-3 animate-spin" />{t("diagrams.detail.savingAndUpdating")}</span>
        : saveStatus === "saved" ? <span className="text-success">{t("diagrams.detail.changesSaved")}</span>
          : <span className="text-destructive">{t("diagrams.detail.headerSaveFailed")}</span>}
    </div>}
    <Dialog open={editing} onOpenChange={(open) => { if (!open) closeEditor(); }}>
      <DialogContent showCloseButton={!saving}>
        <form onSubmit={(event) => void saveMetadata(event)} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t("diagrams.detail.editMetadataTitle")}</DialogTitle>
            <DialogDescription>{t("diagrams.detail.editMetadataDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              <span>{t("diagrams.detail.titleAria")}</span>
              <Input aria-label={t("diagrams.detail.titleAria")} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} disabled={saving} required />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>{t("diagrams.detail.summaryAria")}</span>
              <Textarea aria-label={t("diagrams.detail.summaryAria")} value={summaryDraft} onChange={(event) => setSummaryDraft(event.target.value)} disabled={saving} rows={4} />
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{t("diagrams.detail.saveFailedToast")}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={closeEditor}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={saving || !canEdit}>{t("diagrams.detail.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </header>;
}
