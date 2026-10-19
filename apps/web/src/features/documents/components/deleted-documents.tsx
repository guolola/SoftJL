// Lists soft-deleted project files so they remain recoverable after leaving the specifications page.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { platformApi, type PlatformDocument } from "../../user-platform/services/platform-api";
import { Button } from "../../../shared/ui/button";
import { floatingAlert } from "../../../shared/ui/floating-alert";

export function DeletedDocuments({ projectId, canManage, revision, onChanged }: {
  projectId: string;
  canManage: boolean;
  revision: number;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<PlatformDocument[]>([]);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setError("");
    void platformApi.listProjectDocuments(projectId, { includeDeleted: true }).then(response => {
      if (active) setDocuments(response.documents.filter(document => document.status === "deleted"));
    }).catch(() => { if (active) setError(t("projectShell.documentsUi.errors.load")); });
    return () => { active = false; };
  }, [projectId, revision, t]);

  const restore = async (document: PlatformDocument) => {
    if (!canManage || restoring) return;
    setRestoring(document.id);
    try {
      await platformApi.restoreProjectDocument(projectId, document.id);
      await onChanged();
      floatingAlert.success(t("projectShell.documentsUi.messages.restored", { name: document.fileName }));
    } catch {
      floatingAlert.error(t("projectShell.documentsUi.errors.restore"));
    } finally {
      setRestoring(null);
    }
  };

  if (!documents.length && !error) return null;
  return <details className="rounded-lg border border-border p-4">
    <summary className="cursor-pointer text-sm font-medium">{t("documentsPage.management.deleted", { count: documents.length })}</summary>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-3 grid gap-2">
      {documents.map(document => <div key={document.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-muted/30 p-3">
        <span className="min-w-0 truncate text-sm">{document.fileName}</span>
        <Button variant="outline" size="sm" disabled={!canManage || Boolean(restoring)} aria-label={t("projectShell.documentsUi.restoreFor", { name: document.fileName })} onClick={() => void restore(document)}>{t("projectShell.documentsUi.restore")}</Button>
      </div>)}
    </div>
  </details>;
}
