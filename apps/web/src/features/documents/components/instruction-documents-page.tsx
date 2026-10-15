// Hosts generated instruction documents and opens them in the configured Word editor.
import { Card } from "../../../shared/ui/card";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { PageContainer, PageHeader } from "../../../shared/template/layout/page";
import type { TFunction } from "i18next";
import {
  type DocumentKind,
  type DocumentLibraryItem,
  type DocumentStyleSettings,
  type OnlyOfficeUiTheme,
  type OnlyOfficeEditorConfigResponse,
} from "@uml-platform/contracts";
import {
  ArrowLeft,
  Download,
  FileText,
  HardDrive,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import {
  FeedbackReopenButton,
  useFeedbackDialog,
  type FeedbackDialogState,
} from "../../../shared/ui/feedback-dialog";
import { cn } from "../../../shared/ui/utils";
import { downloadBlobFile } from "../../../shared/lib/download";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { useWorkspaceSession } from "../../workspace-session/state";
import { useWorkspaceShell } from "../../workspace-shell/state";
import {
  MobileCompactGrid,
  mobileTouchTargetClass,
} from "../../workspace-shell/components/mobile-density";
import { DocumentStyleDialog } from "./document-style-dialog";
import { DocumentGuidanceDialog } from "./document-guidance-dialog";
import { OnlyOfficeEditorHost } from "./only-office-editor-host";
import { cloneDefaultDocumentStyle } from "../lib/document-style";
import { useTheme } from "../../../shared/ui/theme-provider";
import { feasibilityArtifactState } from "../../feasibility/lib/feasibility-freshness";

function onlyOfficeUiThemeForProjectTheme(theme: "light" | "dark"): OnlyOfficeUiTheme {
  return theme === "light" ? "theme-classic-light" : "theme-dark";
}

const DOCUMENT_DEFINITIONS = [
  {
    kind: "feasibilityStudy",
    title: "可行性研究报告",
    fileName: "可行性研究报告.docx",
    source: "Generated from Feasibility Analysis",
  },
  {
    kind: "requirementsSpec",
    title: "需求规格说明书",
    fileName: "需求规格说明书.docx",
    source: "Generated from Requirement Model",
  },
  {
    kind: "softwareDesignSpec",
    title: "软件设计说明书",
    fileName: "软件设计说明书.docx",
    source: "Generated from Design Model",
  },
] satisfies Array<{
  kind: DocumentKind;
  title: string;
  fileName: string;
  source: string;
}>;

const IDLE_DOCUMENT_GENERATION_STATE: Record<DocumentKind, boolean> = {
  requirementsSpec: false,
  softwareDesignSpec: false,
  feasibilityStudy: false,
};

function formatUpdatedAt(value: string | null | undefined, locale: string, t: TFunction) {
  if (!value) return t("documentsPage.time.notGenerated");
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return t("documentsPage.time.unknown");
  const diff = Date.now() - time;
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diff < minute) return t("documentsPage.time.justNow");
  if (diff < hour) return t("documentsPage.time.minutes", { count: Math.max(1, Math.floor(diff / minute)) });
  if (diff < day) return t("documentsPage.time.hours", { count: Math.max(1, Math.floor(diff / hour)) });
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function documentDefinition(kind: DocumentKind) {
  return DOCUMENT_DEFINITIONS.find((item) => item.kind === kind)!;
}

function formatByteLength(value: number, t: TFunction) {
  if (!Number.isFinite(value) || value <= 0) return t("documentsPage.sizeUnknown");
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatFullUpdatedAt(value: string | null | undefined, locale: string, t: TFunction) {
  if (!value) return t("documentsPage.time.notGenerated");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("documentsPage.time.unknown");
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function documentStyleSummary(style: DocumentStyleSettings, t: TFunction) {
  return [
    t(style.includeTableOfContents ? "documentsPage.style.toc" : "documentsPage.style.noToc"),
    t(style.autoNumberHeadings ? "documentsPage.style.numbered" : "documentsPage.style.manual"),
    style.body?.eastAsiaFont ?? t("documentsPage.style.defaultFont"),
  ];
}

function localizedDocumentTitle(kind: DocumentKind, t: TFunction) {
  return t(`documentsPage.kinds.${kind}`);
}

function feasibilityDisabledReason(
  state: ReturnType<typeof feasibilityArtifactState> | null,
  t: TFunction,
) {
  if (!state) return t("documentsPage.prerequisites.feasibilityChecking");
  if (state.contextStatus === "missing") {
    return t("documentsPage.prerequisites.feasibilityContextMissing");
  }
  if (state.contextStatus === "stale") {
    return t("documentsPage.prerequisites.feasibilityContextStale");
  }
  if (state.implementationStatus === "missing") {
    return t("documentsPage.prerequisites.feasibilityImplementationMissing");
  }
  if (state.businessFlowStatus === "missing") return t("documentsPage.prerequisites.feasibilityBusinessFlowMissing");
  if (state.businessFlowStatus === "stale") return t("documentsPage.prerequisites.feasibilityBusinessFlowStale");
  if (state.implementationStatus === "stale") {
    return t("documentsPage.prerequisites.feasibilityImplementationStale");
  }
  return null;
}

function TemplatePreview({
  definition,
  documentStyle,
  onOpenStyle,
}: {
  definition: (typeof DOCUMENT_DEFINITIONS)[number];
  documentStyle: DocumentStyleSettings;
  onOpenStyle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-36 flex-col gap-2 bg-muted/60 px-3 py-3 sm:h-44 sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-3">
        <Badge variant="secondary" className="text-[10px]">
          {t("documentsPage.courseTemplate")}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="size-9 p-0 sm:h-8 sm:w-auto sm:px-3"
          onClick={onOpenStyle}
          title={t("documentsPage.documentStyle")}
          aria-label={t("documentsPage.documentStyle")}
        >
          <Palette className="size-3.5" />
          <span className="hidden sm:inline">{t("documentsPage.documentStyle")}</span>
        </Button>
      </div>
      <div className="mt-auto space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">{t("documentsPage.generationTemplate")}</p>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-foreground sm:text-lg">
            {localizedDocumentTitle(definition.kind, t)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {documentStyleSummary(documentStyle, t).map((item) => (
            <span
              key={item}
              className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:px-2.5 sm:py-1 sm:text-[11px]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function GeneratedDocumentPreview({
  definition,
  document,
}: {
  definition: (typeof DOCUMENT_DEFINITIONS)[number];
  document: DocumentLibraryItem;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
  return (
    <div className="flex h-36 flex-col justify-between bg-muted/60 px-3 py-3 sm:h-44 sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant="outline" className="text-[10px]">
            {localizedDocumentTitle(definition.kind, t)}
          </Badge>
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-foreground sm:text-sm">
            <FileText className="size-4 text-primary" />
            {t("documentsPage.docxFile")}
          </p>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px]">
          v{document.version}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] sm:gap-x-4 sm:gap-y-3 sm:text-xs">
        <div>
          <dt className="text-muted-foreground">{t("documentsPage.fileSize")}</dt>
          <dd className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
            <HardDrive className="size-3.5 text-muted-foreground" />
            {formatByteLength(document.byteLength, t)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("documentsPage.lastUpdated")}</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatFullUpdatedAt(document.updatedAt, locale, t)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function TemplateDocumentCard({
  definition,
  disabledReason,
  generating,
  documentStyle,
  onOpenStyle,
  onGenerate,
}: {
  definition: (typeof DOCUMENT_DEFINITIONS)[number];
  disabledReason: string | null;
  generating: boolean;
  documentStyle: DocumentStyleSettings;
  onOpenStyle: () => void;
  onGenerate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card as="article" className="gap-0 py-0 group flex min-h-[236px] flex-col overflow-hidden transition-colors sm:min-h-[270px]">
      <TemplatePreview
        definition={definition}
        documentStyle={documentStyle}
        onOpenStyle={onOpenStyle}
      />
      <div className="flex flex-1 flex-col justify-end border-t border-border bg-card p-3 sm:p-4">
        <Button
          type="button"
          size="sm"
          className="h-10 sm:h-9"
          disabled={Boolean(disabledReason) || generating}
          title={disabledReason ?? t("documentsPage.generateKind", { title: localizedDocumentTitle(definition.kind, t) })}
          onClick={onGenerate}
        >
          {generating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {t("documentsPage.generateAndOpen")}
        </Button>
      </div>
    </Card>
  );
}

function GeneratedDocumentCard({
  definition,
  document,
  onOpen,
  onDownload,
}: {
  definition: (typeof DOCUMENT_DEFINITIONS)[number];
  document: DocumentLibraryItem;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
  return (
    <Card as="article"
      className="gap-0 py-0 group flex min-h-[258px] cursor-pointer flex-col overflow-hidden transition-colors hover:border-primary/45 sm:min-h-[315px]"
      onClick={onOpen}
    >
      <GeneratedDocumentPreview definition={definition} document={document} />
      <div className="flex flex-1 flex-col gap-2 border-t border-border bg-card p-3 sm:gap-3 sm:p-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
              {document.fileName}
            </h3>
            <p className="mt-1 line-clamp-1 text-[11px] font-medium tracking-[0.02em] text-muted-foreground sm:mt-2 sm:text-xs">
              {definition.source}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatUpdatedAt(document.updatedAt, locale, t)}
            </p>
          </div>
        </div>

        <div className="mt-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-10 flex-1 sm:h-9", mobileTouchTargetClass)}
            onClick={(event) => {
              event.stopPropagation();
              onDownload();
            }}
          >
            <Download className="size-3.5" />
            {t("documentsPage.download")}
          </Button>
          <Button
            type="button"
            size="sm"
            className={cn("h-10 flex-1 sm:h-9", mobileTouchTargetClass)}
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            <FileText className="size-3.5" />
            {t("documentsPage.openEditor")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function InstructionDocumentsPage({
  activeDocumentId,
}: {
  activeDocumentId?: string;
}) {
  const { t } = useTranslation();
  const repository = useWorkspaceRepository();
  const { theme } = useTheme();
  const { openFeedbackOnce } = useFeedbackDialog();
  const {
    models,
    designModels,
    generateRequirementsSpec,
    generateSoftwareDesignSpec,
    generateFeasibilityStudy,
    generationModelBlockedReason,
  } = useWorkspaceSession();
  const {
    openDesignHome,
    openDocumentsHome,
    openDocumentEditor,
    openFeasibilityHome,
    openRequirementsText,
  } = useWorkspaceShell();
  const [documents, setDocuments] = useState<DocumentLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listErrorRevision, setListErrorRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocumentKind | "all">("all");
  const [editorConfig, setEditorConfig] =
    useState<OnlyOfficeEditorConfigResponse | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [documentStyleDialogOpen, setDocumentStyleDialogOpen] = useState(false);
  const [documentStyle, setDocumentStyle] = useState(cloneDefaultDocumentStyle);
  const [documentGeneratingByKind, setDocumentGeneratingByKind] = useState(
    IDLE_DOCUMENT_GENERATION_STATE,
  );
  const activeDocumentGenerationsRef = useRef(IDLE_DOCUMENT_GENERATION_STATE);
  const activeDocumentGenerationCountRef = useRef(0);
  const autoOpenClaimedRef = useRef(false);
  const hasRequirementModels = Object.values(models).some(Boolean);
  const hasDesignModels = Object.values(designModels).some(Boolean);
  const [feasibilityState, setFeasibilityState] = useState<ReturnType<
    typeof feasibilityArtifactState
  > | null>(null);
  const onlyOfficeUiTheme = onlyOfficeUiThemeForProjectTheme(theme);

  const loadDocuments = useCallback(async () => {
    if (!repository.listDocuments) {
      setDocuments([]);
      setLoading(false);
      setErrorMessage(t("documentsPage.errors.listUnsupported"));
      setListErrorRevision((revision) => revision + 1);
      return [];
    }
    try {
      setLoading(true);
      setErrorMessage(null);
      const nextDocuments = await repository.listDocuments();
      setDocuments(nextDocuments);
      return nextDocuments;
    } catch {
      setErrorMessage(t("documentsPage.errors.listFailed"));
      setListErrorRevision((revision) => revision + 1);
      return [];
    } finally {
      setLoading(false);
    }
  }, [repository, t]);

  useEffect(() => {
    void loadDocuments();
    void repository.loadWorkspace().then((workspace) => {
      setFeasibilityState(feasibilityArtifactState(workspace));
    });
  }, [loadDocuments, repository]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((document) => {
      if (typeFilter !== "all" && document.documentKind !== typeFilter) return false;
      const definition = documentDefinition(document.documentKind);
      const searchable =
        `${definition.title} ${definition.fileName} ${document.fileName}`.toLowerCase();
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [documents, query, typeFilter]);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );

  useEffect(() => {
    if (!activeDocumentId || !repository.getOnlyOfficeEditorConfig) {
      setEditorConfig(null);
      setEditorError(null);
      return;
    }
    let active = true;
    setEditorLoading(true);
    setEditorError(null);
    void repository
      .getOnlyOfficeEditorConfig(activeDocumentId, onlyOfficeUiTheme)
      .then((config) => {
        if (!active) return;
        setEditorConfig(config);
      })
      .catch(() => {
        if (!active) return;
        setEditorConfig(null);
        setEditorError(
          t("documentsPage.errors.editorConfigFailed"),
        );
      })
      .finally(() => {
        if (active) setEditorLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeDocumentId, onlyOfficeUiTheme, repository, t]);

  const handleOnlyOfficeLoadError = useCallback((description: string) => {
    setEditorError(description);
    setEditorConfig(null);
  }, []);

  const openDocument = useCallback(
    (document: DocumentLibraryItem) => {
      openDocumentEditor(document.id, document.fileName);
    },
    [openDocumentEditor],
  );

  const generateDocument = useCallback(
    async (kind: DocumentKind) => {
      if (activeDocumentGenerationsRef.current[kind]) return;

      if (activeDocumentGenerationCountRef.current === 0) {
        autoOpenClaimedRef.current = false;
      }
      activeDocumentGenerationCountRef.current += 1;
      activeDocumentGenerationsRef.current = {
        ...activeDocumentGenerationsRef.current,
        [kind]: true,
      };
      setDocumentGeneratingByKind(activeDocumentGenerationsRef.current);
      try {
        const snapshot =
          kind === "requirementsSpec"
            ? await generateRequirementsSpec(documentStyle)
            : kind === "softwareDesignSpec"
              ? await generateSoftwareDesignSpec(documentStyle)
              : await generateFeasibilityStudy(documentStyle);

        const nextDocuments = await loadDocuments();
        const document =
          nextDocuments.find((item) => item.id === snapshot?.documentId) ??
          nextDocuments.find((item) => item.documentKind === kind);
        if (document && !autoOpenClaimedRef.current) {
          autoOpenClaimedRef.current = true;
          openDocument(document);
        }
      } finally {
        activeDocumentGenerationCountRef.current = Math.max(
          0,
          activeDocumentGenerationCountRef.current - 1,
        );
        activeDocumentGenerationsRef.current = {
          ...activeDocumentGenerationsRef.current,
          [kind]: false,
        };
        setDocumentGeneratingByKind(activeDocumentGenerationsRef.current);
        if (activeDocumentGenerationCountRef.current === 0) {
          autoOpenClaimedRef.current = false;
        }
      }
    },
    [
      generateRequirementsSpec,
      generateSoftwareDesignSpec,
      generateFeasibilityStudy,
      documentStyle,
      loadDocuments,
      openDocument,
    ],
  );

  const downloadDocument = useCallback(
    async (document: DocumentLibraryItem) => {
      if (!repository.downloadDocument) {
        floatingAlert.error(t("documentsPage.errors.downloadUnsupported"));
        return;
      }
      try {
        const downloaded = await repository.downloadDocument(
          document.id,
          document.fileName,
        );
        downloadBlobFile(downloaded.fileName, downloaded.blob);
        floatingAlert.success(t("documentsPage.downloaded", { fileName: downloaded.fileName }));
      } catch {
        floatingAlert.error(t("documentsPage.errors.downloadFailed"));
      }
    },
    [repository, t],
  );

  const listErrorFeedback = useMemo<FeedbackDialogState | null>(() => {
    if (!errorMessage) return null;
    return {
      dedupeKey: "documents:list-error",
      revision: listErrorRevision,
      tone: "destructive",
      title: t("documentsPage.guidance.listErrorTitle"),
      message: errorMessage,
      primaryAction: {
        label: t("feedback.actions.retry"),
        onSelect: () => {
          void loadDocuments();
        },
      },
      keepReopenEntry: true,
    };
  }, [errorMessage, listErrorRevision, loadDocuments, t]);
  const editorErrorFeedback = useMemo<FeedbackDialogState | null>(() => {
    if (!activeDocumentId || editorLoading || editorConfig || !editorError) return null;
    return {
      dedupeKey: `documents:editor:${activeDocumentId}`,
      revision: editorError,
      tone: "warning",
      title: t("documentsPage.editorNotReady"),
      message: t("documentsPage.guidance.editorMessage"),
      primaryAction: activeDocument
        ? {
            label: t("documentsPage.downloadCurrent"),
            onSelect: () => downloadDocument(activeDocument),
          }
        : undefined,
      secondaryAction: {
        label: t("documentsPage.backToList"),
        onSelect: openDocumentsHome,
      },
      keepReopenEntry: true,
    };
  }, [
    activeDocument,
    activeDocumentId,
    downloadDocument,
    editorConfig,
    editorError,
    editorLoading,
    openDocumentsHome,
    t,
  ]);

  useEffect(() => {
    if (listErrorFeedback) openFeedbackOnce(listErrorFeedback);
  }, [listErrorFeedback, openFeedbackOnce]);
  useEffect(() => {
    if (editorErrorFeedback) openFeedbackOnce(editorErrorFeedback);
  }, [editorErrorFeedback, openFeedbackOnce]);

  const requirementDisabledReason = hasRequirementModels
    ? null
    : t("documentsPage.prerequisites.requirements");
  const designDisabledReason = hasDesignModels
    ? null
    : t("documentsPage.prerequisites.design");
  const disabledReasonByKind = useMemo<Record<DocumentKind, string | null>>(
    () => ({
      requirementsSpec: requirementDisabledReason ?? generationModelBlockedReason,
      softwareDesignSpec: designDisabledReason ?? generationModelBlockedReason,
      feasibilityStudy: feasibilityDisabledReason(feasibilityState, t) ?? generationModelBlockedReason,
    }),
    [designDisabledReason, feasibilityState, requirementDisabledReason, generationModelBlockedReason, t],
  );
  const prerequisiteFeedbackByKind = useMemo<
    Partial<Record<DocumentKind, FeedbackDialogState>>
  >(() => {
    const feedback: Partial<Record<DocumentKind, FeedbackDialogState>> = {};
    for (const definition of DOCUMENT_DEFINITIONS) {
      const reason = disabledReasonByKind[definition.kind];
      if (!reason) continue;
      const primaryAction = reason === generationModelBlockedReason ? undefined :
        definition.kind === "requirementsSpec"
          ? {
              label: t("feedback.actions.requirementModels"),
              onSelect: openRequirementsText,
            }
          : definition.kind === "softwareDesignSpec"
            ? {
                label: t("feedback.actions.designModels"),
                onSelect: openDesignHome,
              }
            : {
                label: t("feedback.actions.feasibility"),
                onSelect: () =>
                  openFeasibilityHome({
                    initialSelectedArtifacts: feasibilityState?.requiredArtifacts,
                  }),
              };
      feedback[definition.kind] = {
        dedupeKey: `documents:prerequisite:${definition.kind}`,
        revision: reason,
        tone: "warning",
        title: t("documentsPage.guidance.prerequisiteTitle", {
          title: localizedDocumentTitle(definition.kind, t),
        }),
        message: reason,
        primaryAction,
        keepReopenEntry: true,
      };
    }
    return feedback;
  }, [
    disabledReasonByKind,
    generationModelBlockedReason,
    feasibilityState,
    openDesignHome,
    openFeasibilityHome,
    openRequirementsText,
    t,
  ]);
  // Keep every document's recovery action available through the single header notice.
  const pageNotices = [
    listErrorFeedback,
    ...DOCUMENT_DEFINITIONS.map((definition) => prerequisiteFeedbackByKind[definition.kind]),
  ].filter((notice): notice is FeedbackDialogState => Boolean(notice));
  if (activeDocumentId) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-card px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={openDocumentsHome}
              aria-label={t("documentsPage.backToList")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {activeDocument?.fileName ?? editorConfig?.document.fileName ?? t("documentsPage.title")}
              </div>
              <div className="text-xs text-muted-foreground">
                {activeDocument
                  ? `${documentDefinition(activeDocument.documentKind).title} · v${activeDocument.version}`
                  : t("documentsPage.readingDocumentInfo")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => void loadDocuments()}
            >
              <RefreshCw className="size-3.5" />
              {t("documentsPage.refresh")}
            </Button>
            {activeDocument && (
              <Button
                type="button"
                size="sm"
                className="h-9"
                onClick={() => void downloadDocument(activeDocument)}
              >
                <Download className="size-3.5" />
                {t("documentsPage.download")}
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-muted">
          {editorLoading && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("documentsPage.editorLoading")}
            </div>
          )}
          {!editorLoading && editorConfig && (
            <OnlyOfficeEditorHost
              documentServerUrl={editorConfig.documentServerUrl}
              config={editorConfig.config}
              width="100%"
              height="100%"
              onLoadError={handleOnlyOfficeLoadError}
            />
          )}
          {!editorLoading && !editorConfig && (
            <div className="flex h-full items-center justify-center p-6">
              {editorErrorFeedback ? (
                <FeedbackReopenButton feedback={editorErrorFeedback} />
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <PageContainer className="flex min-h-full flex-col">
      <div className="flex w-full flex-col gap-6">
        <PageHeader
          title={t("documentsPage.title")}
          description={t("documentsPage.description")}
          notice={<DocumentGuidanceDialog notices={pageNotices} />}
        />

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 w-full justify-between gap-4">
            <div className="flex shrink-0 items-center gap-3">
              <div className="relative w-96">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-10 pl-9"
                  placeholder={t("documentsPage.search")}
                />
              </div>
              <label className="inline-flex h-10 items-center gap-2 text-sm text-muted-foreground">
                <SlidersHorizontal className="size-4" />
                <SelectControl
                  value={typeFilter}
                  onValueChange={(value) => setTypeFilter(value as DocumentKind | "all")}
                  className="h-10 min-w-44"
                  aria-label={t("documentsPage.typeFilter")}
                  options={[
                    { value: "all", label: t("documentsPage.allTypes") },
                    { value: "feasibilityStudy", label: localizedDocumentTitle("feasibilityStudy", t) },
                    { value: "requirementsSpec", label: localizedDocumentTitle("requirementsSpec", t) },
                    { value: "softwareDesignSpec", label: localizedDocumentTitle("softwareDesignSpec", t) },
                  ]}
                />
              </label>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => void loadDocuments()}
            >
              <RefreshCw className="size-4" />
              {t("documentsPage.refresh")}
            </Button>
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("documentsPage.loading")}
          </div>
        ) : (
          <>
            <section>
              <MobileCompactGrid
                minWidth={760}
                variant="document-cards"
              >
              {DOCUMENT_DEFINITIONS.map((definition) => {
                const generating = documentGeneratingByKind[definition.kind];
                return (
                  <TemplateDocumentCard
                    key={definition.kind}
                    definition={definition}
                    disabledReason={disabledReasonByKind[definition.kind]}
                    generating={generating}
                    documentStyle={documentStyle}
                    onOpenStyle={() => setDocumentStyleDialogOpen(true)}
                    onGenerate={() => void generateDocument(definition.kind)}
                  />
                );
              })}
              </MobileCompactGrid>
            </section>

            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">
                  {t("documentsPage.generatedDocuments")}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t("documentsPage.documentCount", { count: filteredDocuments.length })}
                </span>
              </div>
              {filteredDocuments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("documentsPage.empty")}
                </div>
              ) : (
                <MobileCompactGrid
                  minWidth={760}
                  variant="document-cards"
                >
                  {filteredDocuments.map((document) => (
                    <GeneratedDocumentCard
                      key={document.id}
                      definition={documentDefinition(document.documentKind)}
                      document={document}
                      onOpen={() => openDocument(document)}
                      onDownload={() => void downloadDocument(document)}
                    />
                  ))}
                </MobileCompactGrid>
              )}
            </section>
          </>
        )}
      </div>
      <DocumentStyleDialog
        open={documentStyleDialogOpen}
        onOpenChange={setDocumentStyleDialogOpen}
        value={documentStyle}
        onChange={setDocumentStyle}
      />
    </PageContainer>
  );
}
