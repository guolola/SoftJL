// Keeps version history and reversible document mutations beside generated specification cards.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";
import type { DocumentLibraryItem } from "@uml-platform/contracts";
import { platformApi, type PlatformDocumentVersion } from "../../user-platform/services/platform-api";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../shared/ui/dropdown-menu";
import { floatingAlert } from "../../../shared/ui/floating-alert";

export function DocumentManagementActions({ document, projectId, canManage, onChanged }: {
  document: DocumentLibraryItem;
  projectId: string;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [action, setAction] = useState<"rename" | "versions" | "delete" | null>(null);
  const [name, setName] = useState(document.fileName);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<PlatformDocumentVersion[]>([]);
  const [error, setError] = useState("");
  const key = "projectShell.documentsUi";

  const openAction = async (next: NonNullable<typeof action>) => {
    if (busy || (next !== "versions" && !canManage)) return;
    setName(document.fileName);
    setError("");
    setAction(next);
    if (next !== "versions") return;
    setVersions([]);
    setBusy(true);
    try {
      const response = await platformApi.listProjectDocumentVersions(projectId, document.id);
      setVersions(response.versions);
    } catch {
      setError(t(`${key}.errors.versions`));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (busy || !canManage || (action !== "rename" && action !== "delete")) return;
    if (action === "rename" && !name.trim()) {
      setError(t(`${key}.errors.nameRequired`));
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (action === "rename") await platformApi.renameProjectDocument(projectId, document.id, name.trim());
      else await platformApi.deleteProjectDocument(projectId, document.id);
      floatingAlert.success(t(`${key}.messages.${action === "rename" ? "renamed" : "deleted"}`, { name: action === "rename" ? name.trim() : document.fileName }));
      // Refresh active and deleted lists together after the server commits the mutation.
      await onChanged();
      setAction(null);
    } catch {
      setError(t(`${key}.errors.${action}`));
    } finally {
      setBusy(false);
    }
  };

  return <div onClick={event => event.stopPropagation()}>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon-sm" aria-label={t("documentsPage.management.actions", { name: document.fileName })} />}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!canManage || busy} onClick={() => void openAction("rename")}>{t(`${key}.rename`)}</DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onClick={() => void openAction("versions")}>{t(`${key}.versions`)}</DropdownMenuItem>
        <DropdownMenuItem disabled={!canManage || busy} onClick={() => void openAction("delete")}>{t(`${key}.delete`)}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={action !== null} onOpenChange={open => { if (!open && !busy) setAction(null); }}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{action ? t(`${key}.${action}For`, { name: document.fileName }) : ""}</DialogTitle>
          <DialogDescription>{action === "delete" ? t("documentsPage.management.deleteDescription") : document.fileName}</DialogDescription>
        </DialogHeader>
        {action === "rename" && <div className="grid gap-2">
          <Label htmlFor={`rename-document-${document.id}`}>{t(`${key}.name`)}</Label>
          <Input id={`rename-document-${document.id}`} value={name} maxLength={180} disabled={busy} onChange={event => setName(event.target.value)} />
        </div>}
        {action === "versions" && <div className="grid gap-2">
          {busy && <p>{t("documentsPage.loading")}</p>}
          {!busy && !error && versions.length === 0 && <p>{t("documentsPage.management.noVersions")}</p>}
          {versions.map(version => <p key={version.version}>v{version.version} {version.fileName}</p>)}
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {action !== "versions" && <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setAction(null)}>{t("common.cancel")}</Button>
          <Button variant={action === "delete" ? "destructive" : "default"} disabled={!canManage || busy} onClick={() => void commit()}>{t(`${key}.${action === "delete" ? "delete" : "rename"}`)}</Button>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
