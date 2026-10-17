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
  Search,
  SlidersHorizontal,
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
import { GenerationModelControls } from "../../workspace-session/components/generation-model-controls";
import { ModelingGenerationButton } from "../../../shared/ui/modeling-generation-button";
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
import { ModelBentoCard } from "../../workspace-shell/components/model-bento-card";
import { TargetSelectionActions } from "../../workspace-shell/components/target-selection-actions";

function onlyOfficeUiThemeForProjectTheme(theme: "light" | "dark"): OnlyOfficeUiTheme {
  return theme === "light" ? "theme-classic-light" : "theme-dark";
}

const DOCUMENT_DEFINITIONS = [
  {
    kind: "feasibilityStudy",
    title: "可行性研究报告",
    fileName: "可行性研究报告.docx",
    source: "uxReview.feasibilitySource",
    english: "Feasibility Study Report",
  },
  {
    kind: "requirementsSpec",
    title: "需求规格说明书",
    fileName: "需求规格说明书.docx",
    source: "uxReview.requirementsSource",
    english: "Software Requirements Specification",
  },
  {
    kind: "softwareDesignSpec",
    title: "软件设计说明书",
    fileName: "软件设计说明书.docx",
    source: "uxReview.designSource",
    english: "Software Design Specification",
  },
] satisfies Array<{
  kind: DocumentKind;
  title: string;
  fileName: string;
  source: string;
  english: string;
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
              {t(definition.source)}
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
  activeDocumentId, ordinary,
}: {
  activeDocumentId?: string;
  ordinary?: {
    blockedReason: string | null;
    disabled?: boolean;
    revision?: string;
    generate: (kind: "requirementsSpec" | "softwareDesignSpec", style: DocumentStyleSettings) => Promise<{ documentId?: string } | undefined>;
    onOpen: (id: string) => void; onBack: () => void;
  };
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
    canUpdateWorkspace,
    canStartRuns,
  } = useWorkspaceSession();
  const {
    openDesignHome,
    openDocumentsHome: professionalDocumentsHome,
    openDocumentEditor: professionalDocumentEditor,
    openFeasibilityHome,
    openRequirementsText,
  } = useWorkspaceShell();
  const openDocumentsHome = ordinary?.onBack ?? professionalDocumentsHome;
  const openDocumentEditor = ordinary?.onOpen ?? professionalDocumentEditor;
  const definitions = useMemo(() => ordinary ? DOCUMENT_DEFINITIONS.filter(item => item.kind !== "feasibilityStudy") : DOCUMENT_DEFINITIONS, [ordinary]);
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
  const [selectedDocumentKinds, setSelectedDocumentKinds] = useState<DocumentKind[]>([]);
  const [documentBatchRunning, setDocumentBatchRunning] = useState(false);
  const documentBatchRunningRef = useRef(false);
  const [documentGeneratingByKind, setDocumentGeneratingByKind] = useState(
    IDLE_DOCUMENT_GENERATION_STATE,
  );
  const activeDocumentGenerationsRef = useRef(IDLE_DOCUMENT_GENERATION_STATE);
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
    if (ordinary) return;
    void repository.loadWorkspace().then((workspace) => {
      setFeasibilityState(feasibilityArtifactState(workspace));
    });
  }, [loadDocuments, repository, ordinary]);

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
      if (activeDocumentGenerationsRef.current[kind] || (ordinary && (ordinary.blockedReason || kind === "feasibilityStudy"))) return;

      activeDocumentGenerationsRef.current = {
        ...activeDocumentGenerationsRef.current,
        [kind]: true,
      };
      setDocumentGeneratingByKind(activeDocumentGenerationsRef.current);
      try {
        const snapshot = ordinary && kind !== "feasibilityStudy" ? await ordinary.generate(kind, documentStyle) :
          kind === "requirementsSpec"
            ? await generateRequirementsSpec(documentStyle)
            : kind === "softwareDesignSpec"
              ? await generateSoftwareDesignSpec(documentStyle)
              : await generateFeasibilityStudy(documentStyle);

        // Only this run's published artifact can claim the batch's single automatic editor navigation.
        if (!snapshot?.documentId) return;
        const nextDocuments = await loadDocuments();
        const document =
          nextDocuments.find((item) => item.id === snapshot?.documentId) ??
          nextDocuments.find((item) => item.documentKind === kind);
        if (document && !autoOpenClaimedRef.current) {
          autoOpenClaimedRef.current = true;
          openDocument(document);
        }
      } catch {
        floatingAlert.error(t("documentsPage.errors.generateFailed"));
      } finally {
        activeDocumentGenerationsRef.current = {
          ...activeDocumentGenerationsRef.current,
          [kind]: false,
        };
        setDocumentGeneratingByKind(activeDocumentGenerationsRef.current);
      }
    },
    [
      ordinary,
      generateRequirementsSpec,
      generateSoftwareDesignSpec,
      generateFeasibilityStudy,
      documentStyle,
      loadDocuments,
      openDocument,
      t,
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
      requirementsSpec: ordinary ? ordinary.blockedReason : requirementDisabledReason ?? generationModelBlockedReason,
      softwareDesignSpec: ordinary ? ordinary.blockedReason : designDisabledReason ?? generationModelBlockedReason,
      feasibilityStudy: feasibilityDisabledReason(feasibilityState, t) ?? generationModelBlockedReason,
    }),
    [designDisabledReason, feasibilityState, requirementDisabledReason, generationModelBlockedReason, t, ordinary],
  );
  const selectedKinds = definitions.filter(definition => selectedDocumentKinds.includes(definition.kind)).map(definition => definition.kind);
  const canGenerateDocuments = ordinary ? ordinary.disabled !== true : canUpdateWorkspace && canStartRuns;
  const generationBlockedReason = !canGenerateDocuments
    ? t("documentsPage.generationPermission")
    : selectedKinds.length === 0
      ? t("documentsPage.selectionRequired")
      : selectedKinds.map(kind => disabledReasonByKind[kind]).find(Boolean) ?? null;
  const selectionDisabled = loading || documentBatchRunning || !canGenerateDocuments;
  const selectDocument = (kind: DocumentKind, selected: boolean) => {
    if (selectionDisabled || documentBatchRunningRef.current) return;
    setSelectedDocumentKinds(current => selected ? [...new Set([...current, kind])] : current.filter(item => item !== kind));
  };
  const generateSelectedDocuments = async () => {
    // The same eligibility guard protects keyboard/click submission and the visible disabled state.
    if (loading || documentBatchRunningRef.current || generationBlockedReason) return;
    documentBatchRunningRef.current = true;
    setDocumentBatchRunning(true);
    autoOpenClaimedRef.current = false;
    try {
      // Ordinary projects own one active run; professional document pipelines support independent concurrent runs.
      if (ordinary) {
        for (const kind of selectedKinds) await generateDocument(kind);
      } else {
        await Promise.all(selectedKinds.map(kind => generateDocument(kind)));
      }
    } finally {
      documentBatchRunningRef.current = false;
      setDocumentBatchRunning(false);
    }
  };
  const prerequisiteFeedbackByKind = useMemo<
    Partial<Record<DocumentKind, FeedbackDialogState>>
  >(() => {
    const feedback: Partial<Record<DocumentKind, FeedbackDialogState>> = {};
    for (const definition of definitions) {
      const reason = disabledReasonByKind[definition.kind];
      if (!reason) continue;
      const primaryAction = ordinary || reason === generationModelBlockedReason ? undefined :
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
    definitions,
    ordinary,
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
    ...definitions.map((definition) => prerequisiteFeedbackByKind[definition.kind]),
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

        {/* OnlyOffice sizes its frame to this box; a definite height keeps the page area from collapsing. */}
        <div className="h-[calc(100dvh-8rem)] min-h-[480px] bg-muted">
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
          description={ordinary ? t("standardProject.documentDescription") : t("documentsPage.description")}
          notice={<DocumentGuidanceDialog notices={pageNotices} />}
        />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold tracking-normal">{t("documentsPage.targets")}</h2>
              <Badge variant="secondary" className="border-0 px-3 py-1 font-mono text-xs">{selectedKinds.length}/{definitions.length}</Badge>
              <TargetSelectionActions disabled={selectionDisabled}
                onSelectAll={() => { if (!selectionDisabled) setSelectedDocumentKinds(definitions.map(definition => definition.kind)); }}
                onClear={() => { if (!selectionDisabled) setSelectedDocumentKinds([]); }} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={documentBatchRunning}
                onClick={() => setDocumentStyleDialogOpen(true)}>
                <Palette className="size-3.5" />{t("documentsPage.documentStyle")}
              </Button>
              <div className="flex min-w-0 items-center gap-2" data-testid="documents-generation-toolbar">
                <GenerationModelControls ordinary={Boolean(ordinary)} disabled={selectionDisabled} />
                <ModelingGenerationButton label={t("common.generate")} busy={documentBatchRunning}
                  disabled={loading || documentBatchRunning || Boolean(generationBlockedReason)}
                  title={generationBlockedReason ?? undefined} onClick={() => void generateSelectedDocuments()} />
              </div>
            </div>
          </div>
          <MobileCompactGrid variant="model-targets">
            {definitions.map((definition, index) => {
              const title = localizedDocumentTitle(definition.kind, t);
              const reason = disabledReasonByKind[definition.kind];
              const selected = selectedKinds.includes(definition.kind);
              const count = documents.filter(document => document.documentKind === definition.kind).length;
              // Existing files do not imply that current inputs permit generating another version.
              const status = documentGeneratingByKind[definition.kind] ? "running" : reason || !canGenerateDocuments ? "blocked" : count > 0 ? "completed" : "missing";
              return <ModelBentoCard key={definition.kind} label={title} english={definition.english} description={t(definition.source)}
                icon={FileText} categoryColorIndex={index} selected={selected} disabled={selectionDisabled}
                countLabel={count} checkboxLabel={title} ariaLabel={t(selected ? "documentsPage.deselectDocument" : "documentsPage.selectDocument", { title })}
                onSelectedChange={value => selectDocument(definition.kind, value)}
                status={status} />;
            })}
          </MobileCompactGrid>
        </section>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("documentsPage.loading")}
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">
                  {t("documentsPage.generatedDocuments")}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t("documentsPage.documentCount", { count: filteredDocuments.length })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-0 flex-1 sm:max-w-96">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={event => setQuery(event.target.value)} className="h-10 pl-9" placeholder={t("documentsPage.search")} />
                </div>
                <label className="inline-flex h-10 items-center gap-2 text-sm text-muted-foreground">
                  <SlidersHorizontal className="size-4" />
                  <SelectControl value={typeFilter} onValueChange={value => setTypeFilter(value as DocumentKind | "all")}
                    className="h-10 min-w-44" aria-label={t("documentsPage.typeFilter")} options={[
                      { value: "all", label: t("documentsPage.allTypes") },
                      ...definitions.map(definition => ({ value: definition.kind, label: localizedDocumentTitle(definition.kind, t) })),
                    ]} />
                </label>
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
