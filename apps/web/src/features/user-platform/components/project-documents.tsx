// Owns project document list interactions for the project workspace page and drawer.
import { Alert } from "../../../shared/ui/alert";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui/card";
import { Field, FieldLabel } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText } from "lucide-react";
import { EmptyState, PageHeader, TableToolbar } from "../../../shared/template/layout/page";
import { cn } from "../../../shared/ui/utils";
import { downloadBlobFile } from "../../../shared/lib/download";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";
import {
  downloadStatusLabel,
  formatDateTime,
  getProjectDocumentDisplayName,
  onlyOfficeStatusLabel,
  shortIdentifier,
} from "../lib/project-workspace-presentation";
import {
  platformApi,
  type PlatformDocument,
  type PlatformDocumentVersion,
} from "../services/platform-api";

export function ProjectDocuments({
  projectId,
  documents,
  layout = "page",
  pageTitle,
}: {
  projectId: string;
  documents: PlatformDocument[];
  layout?: "page" | "drawer";
  pageTitle?: string;
}) {
  const { t, i18n } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "zh-CN";
  const [currentDocuments, setCurrentDocuments] = useState(documents);
  const [names, setNames] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<Record<string, PlatformDocumentVersion[]>>({});
  const [searchFilter, setSearchFilter] = useState("");
  const [loadError, setLoadError] = useState("");
  const notifySuccess = (title: string) => showAlert({ id: "project-documents-success", title, tone: "success" });
  const notifyError = (title: string) => showAlert({ id: "project-documents-error", title, tone: "destructive" });

  const applyDocuments = useCallback((nextDocuments: PlatformDocument[]) => {
    setCurrentDocuments(nextDocuments);
    setNames(
      Object.fromEntries(
        nextDocuments.map((document) => [
          document.id,
          getProjectDocumentDisplayName(document, t),
        ]),
      ),
    );
  }, [t]);

  useEffect(() => {
    applyDocuments(documents);
  }, [applyDocuments, documents]);

  useEffect(() => {
    let active = true;
    platformApi
      .listProjectDocuments(projectId)
      .then((response) => {
        if (!active) return;
        applyDocuments(response.documents);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(t("projectShell.documentsUi.errors.load"));
      });
    return () => {
      active = false;
    };
  }, [applyDocuments, projectId, t]);

  const updateDocument = (document: PlatformDocument) => {
    setCurrentDocuments((current) =>
      current.map((item) => (item.id === document.id ? { ...item, ...document } : item)),
    );
    setNames((current) => ({
      ...current,
      [document.id]: getProjectDocumentDisplayName(document, t),
    }));
  };

  const findDocumentDisplayName = (documentId: string) => {
    const document = currentDocuments.find((item) => item.id === documentId);
    return document ? getProjectDocumentDisplayName(document, t) : t("projectShell.documentsUi.documentFallback", { id: shortIdentifier(documentId) });
  };

  const loadVersions = async (documentId: string) => {
    const displayName = findDocumentDisplayName(documentId);
    try {
      const response = await platformApi.listProjectDocumentVersions(projectId, documentId);
      setVersions((current) => ({ ...current, [documentId]: response.versions }));
      notifySuccess(t("projectShell.documentsUi.messages.versionsLoaded", { name: displayName }));
    } catch {
      notifyError(t("projectShell.documentsUi.errors.versions"));
    }
  };

  const renameDocument = async (documentId: string) => {
    try {
      const nextName = (names[documentId] ?? "").trim();
      if (!nextName) {
        notifyError(t("projectShell.documentsUi.errors.nameRequired"));
        return;
      }
      const response = await platformApi.renameProjectDocument(projectId, documentId, nextName);
      updateDocument(response.document);
      notifySuccess(t("projectShell.documentsUi.messages.renamed", { name: getProjectDocumentDisplayName(response.document, t) }));
    } catch {
      notifyError(t("projectShell.documentsUi.errors.rename"));
    }
  };

  const deleteDocument = async (documentId: string) => {
    const displayName = findDocumentDisplayName(documentId);
    try {
      await platformApi.deleteProjectDocument(projectId, documentId);
      setCurrentDocuments((current) =>
        current.map((document) =>
          document.id === documentId ? { ...document, status: "deleted" } : document,
        ),
      );
      notifySuccess(t("projectShell.documentsUi.messages.deleted", { name: displayName }));
    } catch {
      notifyError(t("projectShell.documentsUi.errors.delete"));
    }
  };

  const restoreDocument = async (documentId: string) => {
    try {
      const response = await platformApi.restoreProjectDocument(projectId, documentId);
      updateDocument(response.document);
      notifySuccess(t("projectShell.documentsUi.messages.restored", { name: getProjectDocumentDisplayName(response.document, t) }));
    } catch {
      notifyError(t("projectShell.documentsUi.errors.restore"));
    }
  };

  const downloadDocument = async (documentId: string) => {
    try {
      const file = await platformApi.downloadProjectDocument(projectId, documentId);
      downloadBlobFile(file.fileName, file.blob);
      notifySuccess(t("projectShell.documentsUi.messages.downloaded", { name: file.fileName }));
    } catch {
      notifyError(t("projectShell.documentsUi.errors.download"));
    }
  };

  const batchDownload = async () => {
    const downloadableDocuments = currentDocuments.filter(
      (document) => document.status !== "deleted" && document.download?.status !== "unavailable",
    );
    if (downloadableDocuments.length === 0) {
      notifyError(t("projectShell.documentsUi.errors.noneDownloadable"));
      return;
    }
    for (const document of downloadableDocuments) {
      await downloadDocument(document.id);
    }
    notifySuccess(t("projectShell.documentsUi.messages.batchDownloaded", { count: downloadableDocuments.length }));
  };

  const query = searchFilter.trim().toLowerCase();
  const visibleDocuments = query
    ? currentDocuments.filter((document) =>
        getProjectDocumentDisplayName(document, t).toLowerCase().includes(query),
      )
    : currentDocuments;

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader
        size={layout === "drawer" ? "compact" : "default"}
        title={pageTitle ?? t("projectShell.documentsUi.title")}
        description={t("projectShell.documentsUi.description")}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void batchDownload()}>
            <Download className="size-4" />
            {t("projectShell.documentsUi.batchDownload")}
          </Button>
        }
        className={cn(layout === "drawer" && "mb-0 lg:mb-0")}
      />
      {currentDocuments.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("projectShell.documentsUi.empty")}
          description={t("projectShell.documentsUi.description")}
          className="justify-self-center"
        />
      ) : (
      <Card as="section" className="min-w-0 max-w-full py-0 shadow-none">
        <TableToolbar
          search={searchFilter}
          onSearchChange={setSearchFilter}
          searchPlaceholder={t("projectShell.documentsUi.searchPlaceholder")}
          searchLabel={t("projectShell.documentsUi.searchPlaceholder")}
        />
        {visibleDocuments.length === 0 ? (
          <div className="text-muted-foreground border-t p-4 text-center text-sm">
            {t("projectShell.documentsUi.noMatches")}
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-3 border-t px-3 py-3",
              layout === "page" && "lg:grid-cols-2",
            )}
          >
            {visibleDocuments.map((document) => {
              const displayName = getProjectDocumentDisplayName(document, t);
              return (
                <Card key={document.id} size="sm" className="min-w-0 max-w-full gap-3">
                  <CardHeader>
                    <CardTitle className="min-w-0 truncate" title={displayName}>
                      {displayName}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {t("projectShell.documentsUi.metadata", { projectId, version: document.version ?? 1, updatedAt: document.updatedAt ? formatDateTime(document.updatedAt, locale) : t("projectShell.documentsUi.notRecorded") })}
                    </CardDescription>
                    <CardAction>
                      <Badge variant="secondary">
                        {t(`projectShell.documentsUi.documentStatus.${["ready", "processing", "failed", "deleted"].includes(document.status) ? document.status : "unknown"}`)}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="text-muted-foreground grid gap-1 text-sm">
                      <span>{t("projectShell.documentsUi.onlyOffice", { status: onlyOfficeStatusLabel(document.onlyOffice?.status, t) })}</span>
                      <span>{t("projectShell.documentsUi.editLock", { value: document.editLock?.lockedBy ?? document.onlyOffice?.lockedBy ?? t("projectShell.documentsUi.unlocked") })}</span>
                      <span>
                        {t("projectShell.documentsUi.downloadLabel")}
                        {downloadStatusLabel(
                          document.download?.status ?? (document.status === "deleted" ? "unavailable" : "available"),
                          t,
                        )}
                      </span>
                      <span>{t("projectShell.documentsUi.size", { value: document.byteLength ? `${new Intl.NumberFormat(locale).format(document.byteLength)} bytes` : t("projectShell.documentsUi.notRecorded") })}</span>
                    </div>
                    <Field>
                      <FieldLabel htmlFor={`document-name-${document.id}`}>
                        {t("projectShell.documentsUi.name")}
                      </FieldLabel>
                      <Input
                        id={`document-name-${document.id}`}
                        value={names[document.id] ?? ""}
                        onChange={(event) =>
                          setNames((current) => ({
                            ...current,
                            [document.id]: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t("projectShell.documentsUi.downloadFor", { name: displayName })}
                        onClick={() => void downloadDocument(document.id)}
                      >
                        {t("projectShell.documentsUi.download")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t("projectShell.documentsUi.renameFor", { name: displayName })}
                        onClick={() => void renameDocument(document.id)}
                      >
                        {t("projectShell.documentsUi.rename")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t("projectShell.documentsUi.versionsFor", { name: displayName })}
                        onClick={() => void loadVersions(document.id)}
                      >
                        {t("projectShell.documentsUi.versions")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t("projectShell.documentsUi.restoreFor", { name: displayName })}
                        onClick={() => void restoreDocument(document.id)}
                      >
                        {t("projectShell.documentsUi.restore")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        aria-label={t("projectShell.documentsUi.deleteFor", { name: displayName })}
                        onClick={() => void deleteDocument(document.id)}
                      >
                        {t("projectShell.documentsUi.delete")}
                      </Button>
                    </div>
                    {versions[document.id] && (
                      <div className="bg-muted rounded-md border border-border p-3 text-sm">
                        {versions[document.id].map((version) => (
                          <div key={`${document.id}-${version.version}`}>
                            v{version.version} {version.fileName}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Card>
      )}
      {loadError ? <Alert variant="destructive" className="text-sm">{loadError}</Alert> : null}
    </div>
  );
}
