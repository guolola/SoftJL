// Renders the diagram detail workspace, including diagram selection, trace highlights, export actions, and model/SVG views.
import { validateModelInput, deriveTableModel } from "@uml-platform/contracts";
import { Card } from "../../../shared/ui/card";
import { PageHeader } from "../../../shared/template/layout/page";
import { SpotlightCard } from "../../../shared/ui/interactive-card";
import { Checkbox } from "../../../shared/ui/checkbox";
import { Input } from '../../../shared/ui/input';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  contextDiagramSpecSchema,
  designDiagramModelSpecSchema,
  diagramModelSpecSchema,
  type ContextDiagramSpec,
  type ActivityDiagramSpec,
} from "@uml-platform/contracts";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import {
  Search,
  LayoutGrid,
  List,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { Badge } from "../../../shared/ui/badge";
import { SelectControl } from "../../../shared/ui/select";
import { DiagramDetailHeader } from "./diagram-detail-header";
import { ModelNotices, type ModelNotice } from "./model-notices";
import { DiagramPreviewPanel } from "./diagram-preview-panel";
import { ModelEditPanel } from "./model-edit-panel";
import { sanitizeSvgMarkup } from "../lib/svg-sanitizer";
import { cn } from "../../../shared/ui/utils";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  getDesignModelId,
  getRequirementModelId,
  findRequirementModelByKind,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { useCompactViewport } from "../../workspace-shell/hooks/use-compact-viewport";
import { useSvgPanZoom } from "../hooks/use-svg-pan-zoom";
import { mobileTouchTargetClass } from "../../workspace-shell/components/mobile-density";
import { localizeRunFailure } from "../../../shared/i18n/api-errors";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  buildDiagramDetailModel,
  type DiagramDetailItem,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import {
  cloneDraftModel,
  diagramHighlightAliases,
  draftFingerprint,
} from "../lib/model-editing";
import {
  getModelText,
  getRelationAccentClass,
  getRelationDisplayLabel,
  getRelationEndpointLabel,
  isRelationConnectedTo,
  matchesItemSearch,
} from "../lib/diagram-detail-view-model";
import { diagramDetailFieldLabel, diagramRelationTypeLabel, semanticElementLabel } from "../lib/diagram-presentation";

export function DiagramView({
  type,
  modelId,
  highlightedElement,
  highlightedRelationshipId,
  initialSection,
}: {
  type: DiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
  initialSection?: ContextDiagramSection;
}) {
  return (
    <DiagramDetailView
      stage="requirements"
      type={type}
      modelId={modelId}
      highlightedElement={highlightedElement}
      highlightedRelationshipId={highlightedRelationshipId}
      initialSection={initialSection}
    />
  );
}

export function DesignDiagramView({
  type,
  modelId,
  highlightedElement,
  highlightedRelationshipId,
  initialSection,
}: {
  type: DesignDiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
  initialSection?: ContextDiagramSection;
}) {
  return (
    <DiagramDetailView
      stage="design"
      type={type}
      modelId={modelId}
      highlightedElement={highlightedElement}
      highlightedRelationshipId={highlightedRelationshipId}
      initialSection={initialSection}
    />
  );
}

export type ContextDiagramSection = "diagram" | "elements" | "relations";

type ContextDiagramData = {
  model: ContextDiagramSpec | null;
  plantUmlSource: string;
  svgMarkup: string;
  stale: boolean;
  rules: Array<{ id: string; text: string }>;
  saveStatus: "idle" | "saving" | "saved" | "error";
  statusMessage?: string | null;
  errorMessage?: string | null;
  headerAction?: ReactNode;
  onSave: (model: ContextDiagramSpec) => Promise<void>;
};

export function ContextDiagramView({
  data,
  section = "diagram",
  highlightedElement,
  highlightedRelationshipId,
}: {
  data: ContextDiagramData;
  section?: ContextDiagramSection;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
}) {
  return (
    <DiagramDetailView
      stage="context"
      type="context"
      contextData={data}
      initialSection={section}
      highlightedElement={highlightedElement}
      highlightedRelationshipId={highlightedRelationshipId}
    />
  );
}

// A saved feasibility activity uses the same detail layout without editing requirement-stage models.
export function BusinessFlowDiagramView({ data, section = "diagram", highlightedElement, highlightedRelationshipId }: {
  data: Omit<ContextDiagramData, "model" | "onSave"> & { model: ActivityDiagramSpec | null; onSave?: never };
  section?: ContextDiagramSection;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
}) {
  return <DiagramDetailView stage="business-flow" type="activity" contextData={data}
    initialSection={section} highlightedElement={highlightedElement} highlightedRelationshipId={highlightedRelationshipId} />;
}

function DiagramDetailView({
  stage,
  type,
  modelId,
  highlightedElement,
  highlightedRelationshipId,
  contextData,
  initialSection = "diagram",
}: {
  stage: "requirements" | "design" | "context" | "business-flow";
  type: DiagramType | DesignDiagramType;
  modelId?: string;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
  contextData?: ContextDiagramData | (Omit<ContextDiagramData, "model" | "onSave"> & { model: ActivityDiagramSpec | null; onSave?: never });
  initialSection?: ContextDiagramSection;
}) {
  const { t } = useTranslation();
  const {
    models,
    plantUml,
    svgArtifacts,
    diagramErrors,
    designModels,
    designPlantUml,
    designSvgArtifacts,
    designDiagramErrors,
    generationTasks,
    visualReviews,
    canUpdateWorkspace,
    rulesForDiagram,
    staleDiagrams,
    saveRequirementModelEdit,
    saveDesignModelEdit,
    rerenderRequirementModel,
    rerenderDesignModel,
  } = useWorkspaceSession();
  const {
    openDiagram,
    openDesignDiagram,
    openDiagramElement,
    openDesignDiagramElement,
  } = useWorkspaceShell();
  const isBusinessFlow = stage === "business-flow";
  const isFeasibility = stage === "context" || isBusinessFlow;
  const readOnly = isBusinessFlow;
  const isDesign = stage === "design";
  const saveContextModel = contextData?.onSave;
  const requirementType = type as DiagramType;
  const designType = type as DesignDiagramType;
  const isStale = isFeasibility
    ? Boolean(contextData?.stale)
    : !isDesign && staleDiagrams.includes(requirementType);
  const meta = isDesign ? DESIGN_DIAGRAM_META[designType] : DIAGRAM_META[requirementType];
  const diagramKindKey = String(type);
  const metaLabel = isBusinessFlow ? t("feasibility.artifact.businessFlow") : t(`diagrams.kinds.${diagramKindKey}.label`, { defaultValue: meta.label });
  const metaDescription = isBusinessFlow ? t("feasibility.artifact.businessFlowDescription") : t(`diagrams.kinds.${diagramKindKey}.description`, {
    defaultValue: meta.description,
  });
  const designModel = isDesign
    ? modelId
      ? designModels[modelId]
      : Object.values(designModels).find(
          (entry) =>
            entry.diagramKind === designType &&
            Boolean(designSvgArtifacts[getDesignModelId(entry)]),
        ) ?? Object.values(designModels).find((entry) => entry.diagramKind === designType)
    : undefined;
  const designArtifactId = designModel ? getDesignModelId(designModel) : modelId ?? designType;
  const requirementModel = !isDesign && !isFeasibility
    ? modelId
      ? models[modelId]
      : findRequirementModelByKind(models, requirementType)
    : undefined;
  const requirementArtifactId = requirementModel
    ? getRequirementModelId(requirementModel)
    : modelId ?? requirementType;
  const source = isFeasibility
    ? contextData?.plantUmlSource ?? ""
    : isDesign
      ? designPlantUml[designArtifactId] ?? ""
      : plantUml[requirementArtifactId] ?? plantUml[requirementType] ?? "";
  const model = isFeasibility ? contextData?.model : isDesign ? designModel : requirementModel;
  const svgMarkup = isFeasibility
    ? contextData?.svgMarkup ?? ""
    : isDesign
      ? designSvgArtifacts[designArtifactId]?.svg ?? ""
      : svgArtifacts[requirementArtifactId]?.svg ?? svgArtifacts[requirementType]?.svg ?? "";
  const normalizedSvgMarkup = useMemo(() => sanitizeSvgMarkup(svgMarkup), [svgMarkup]);
  const visualId = isFeasibility
    ? contextData?.model?.modelId ?? (isBusinessFlow ? "business-flow" : "context")
    : isDesign ? designArtifactId : requirementArtifactId;
  const visualTaskKind = isFeasibility ? "feasibility" : isDesign ? "design" : "requirements";
  const visualTask = generationTasks.find((task) => task.kind === visualTaskKind &&
    task.subtasks.some((subtask) => subtask.id === `verify_diagram_visual:${visualId}`));
  const visualSubtask = visualTask?.subtasks.find((subtask) => subtask.id === `verify_diagram_visual:${visualId}`);
  const completedVisualTask = [...(visualTask?.diagnostics.transcript ?? [])].reverse().find((event) => event.type === "completed");
  const taskVisualReview = completedVisualTask && "visualReviews" in completedVisualTask.snapshot
    ? completedVisualTask.snapshot.visualReviews?.[visualId]
    : undefined;
  const savedReview = visualReviews[`${visualTaskKind}:${visualId}`];
  // A newer task may already be inspecting another render while the old workspace review is still loaded.
  const savedVisualReview = !visualTask || (taskVisualReview?.checkedAt === savedReview?.checkedAt && taskVisualReview?.inputFingerprint === savedReview?.inputFingerprint) ? savedReview : undefined;
  const currentVisualReview = savedVisualReview ?? taskVisualReview;
  const visualConfirmed = Boolean(currentVisualReview?.confirmedAt);
  const visualStatus = currentVisualReview
    ? currentVisualReview.reason
    : visualSubtask?.status === "pending_review"
      ? "检查已结束，原检查结论保留。"
    : visualSubtask?.status === "completed"
      ? `模型结构检查：${visualSubtask.message ?? "已完成"}`
      : visualSubtask && visualSubtask.status !== "failed"
        ? "模型结构检查中"
        : svgMarkup ? "模型结构检查：未复核" : null;
  const diagramError = isFeasibility
    ? null
    : isDesign
    ? designDiagramErrors[designType] ?? null
    : diagramErrors[requirementArtifactId] ?? diagramErrors[requirementType] ?? null;
  const statusKey = isBusinessFlow ? "feasibility-business-flow" : isFeasibility ? "context" : isDesign ? designArtifactId : requirementArtifactId;
  const compactViewport = useCompactViewport();
  const [activeTab, setActiveTab] = useState<"diagram" | "elements" | "relations" | "edit">(
    "diagram",
  );
  const [draft, setDraft] = useState<Record<string, unknown> | null>(() =>
    model ? cloneDraftModel(model) : null,
  );
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const persistedDraftFingerprintRef = useRef(draftFingerprint(model ? cloneDraftModel(model) : null));
  const {
    svgUrl,
    svgScale,
    svgCanvasRef,
    isPanning,
    svgPanOffset,
    updateSvgScale,
    startCanvasPan,
    moveCanvasPan,
    stopCanvasPan,
  } = useSvgPanZoom(svgMarkup, normalizedSvgMarkup);
  const [elementSearch, setElementSearch] = useState("");
  const [elementKindFilter, setElementKindFilter] = useState<"all" | SemanticElementKind>(
    "all",
  );
  const [relationsOnlyFocus, setRelationsOnlyFocus] = useState(false);
  const relationshipRefs = useRef(new Map<string, HTMLElement>());
  const [localHighlightedElement, setLocalHighlightedElement] = useState<{
    kind: string;
    id: string;
  } | null>(null);
  const [highlightRequestId, setHighlightRequestId] = useState(0);
  const [isOverviewPanelOpen, setIsOverviewPanelOpen] = useState(() =>
    Boolean(highlightedElement),
  );
  const overviewPanelDismissedRef = useRef(false);
  useEffect(() => {
    const nextDraft = model ? cloneDraftModel(model) : null;
    setDraft(nextDraft);
    persistedDraftFingerprintRef.current = draftFingerprint(nextDraft);
    setSaveStatus("idle");
    setLocalHighlightedElement(null);
    overviewPanelDismissedRef.current = false;
    setIsOverviewPanelOpen(Boolean(highlightedElement));
  }, [highlightedElement, model, statusKey]);
  useEffect(() => {
    setActiveTab(
      highlightedRelationshipId
        ? "relations"
        : compactViewport
          ? initialSection
          : "diagram",
    );
  }, [compactViewport, highlightedRelationshipId, initialSection]);
  const commitDraftAndRerender = useCallback(async (nextDraft: Record<string, unknown>, explicit = false): Promise<boolean> => {
    if (readOnly || !canUpdateWorkspace) return false;
    if (!explicit) setDraft(nextDraft);
    if (validateModelInput(nextDraft, isFeasibility ? "feasibility" : isDesign ? "design" : "requirements").length) { setSaveStatus("error"); return false; }
    setSaving(true);
    setSaveStatus("saving");
    try {
      // Model edits cross the UI -> workspace -> renderer contract here; parsing
      // removes editor-only metadata before it can affect downstream freshness.
      const parsedDraft = isFeasibility
        ? contextDiagramSpecSchema.safeParse(nextDraft)
        : isDesign
          ? designDiagramModelSpecSchema.safeParse(nextDraft)
          : diagramModelSpecSchema.safeParse(nextDraft);
      const canonicalDraft = (
        parsedDraft.success ? parsedDraft.data.diagramKind === "table" ? deriveTableModel(parsedDraft.data) : parsedDraft.data : nextDraft
      ) as unknown as Record<string, unknown>;
      // Metadata stays outside the shared draft until its explicit save succeeds.
      if (!explicit) setDraft(canonicalDraft);
      if (isFeasibility) {
        if (!saveContextModel) {
          throw new Error("上下文模型校验失败");
        }
        await saveContextModel(contextDiagramSpecSchema.parse(canonicalDraft));
      } else if (isDesign) {
        await saveDesignModelEdit(designArtifactId, canonicalDraft as never);
        await rerenderDesignModel(designArtifactId, canonicalDraft as never, {
          toastMessage: null,
        });
      } else {
        await saveRequirementModelEdit(requirementType, canonicalDraft as never);
        await rerenderRequirementModel(requirementType, canonicalDraft as never, {
          toastMessage: null,
        });
      }
      persistedDraftFingerprintRef.current = draftFingerprint(canonicalDraft);
      if (explicit) setDraft(canonicalDraft);
      setSaveStatus("saved");
      floatingAlert.message(t("diagrams.detail.savedToast"));
      return true;
    } catch {
      setSaveStatus("error");
      floatingAlert.error(t("diagrams.detail.saveFailedToast"));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    designArtifactId,
    readOnly,
    canUpdateWorkspace,
    isFeasibility,
    isDesign,
    requirementType,
    rerenderDesignModel,
    rerenderRequirementModel,
    saveDesignModelEdit,
    saveContextModel,
    saveRequirementModelEdit,
    t,
  ]);
  useEffect(() => {
    if (readOnly || !canUpdateWorkspace || !draft || saving) return;
    const fingerprint = draftFingerprint(draft);
    if (fingerprint === persistedDraftFingerprintRef.current || validateModelInput(draft, isFeasibility ? "feasibility" : isDesign ? "design" : "requirements").length) return;
    const timer = window.setTimeout(() => {
      void commitDraftAndRerender(draft);
    }, 600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [commitDraftAndRerender, draft, saving, readOnly, canUpdateWorkspace, isFeasibility, isDesign]);
  const saveMetadata = useCallback(async (title: string, summary: string) => {
    if (!draft || saving || readOnly || !canUpdateWorkspace) return false;
    return commitDraftAndRerender({ ...draft, title, summary }, true);
  }, [canUpdateWorkspace, commitDraftAndRerender, draft, readOnly, saving]);
  const commitModelDraft = useCallback(async (nextDraft: Record<string, unknown>) => {
    await commitDraftAndRerender(nextDraft);
  }, [commitDraftAndRerender]);
  const sourceRules = useMemo(
    () =>
      isFeasibility
        ? contextData?.rules ?? []
        : isDesign || requirementType === "analysis"
          ? []
          : rulesForDiagram(requirementType),
    [contextData?.rules, isFeasibility, isDesign, requirementType, rulesForDiagram],
  );
  const detailModel = useMemo(() => buildDiagramDetailModel(draft ?? model), [draft, model]);
  const { items, groups, relationships } = detailModel;
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const effectiveHighlightedElement = localHighlightedElement ?? highlightedElement ?? null;
  const highlighted: DiagramDetailItem | undefined = useMemo(() => {
    if (!effectiveHighlightedElement) return undefined;
    return items.find(
      (e) => e.kind === effectiveHighlightedElement.kind && e.id === effectiveHighlightedElement.id,
    );
  }, [items, effectiveHighlightedElement]);
  const highlightAliases = useMemo(
    () => diagramHighlightAliases(highlighted),
    [highlighted],
  );
  const selectElementInDiagram = useCallback((element: DiagramDetailItem) => {
    setLocalHighlightedElement({ kind: element.kind, id: element.id });
    setHighlightRequestId((current) => current + 1);
    if (!overviewPanelDismissedRef.current) {
      setIsOverviewPanelOpen(true);
    }
  }, []);
  const relatedRelationships = useMemo(
    () => relationships.filter((relation) => isRelationConnectedTo(relation, highlighted)),
    [highlighted, relationships],
  );
  const relatedItems = useMemo(() => {
    if (!highlighted) return [];
    const relatedIds = new Set<string>();
    for (const relation of relatedRelationships) {
      if (relation.sourceId !== highlighted.id) relatedIds.add(relation.sourceId);
      if (relation.targetId !== highlighted.id) relatedIds.add(relation.targetId);
    }
    return [...relatedIds]
      .map((id) => itemsById.get(id))
      .filter((item): item is DiagramDetailItem => Boolean(item));
  }, [highlighted, itemsById, relatedRelationships]);
  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              (elementKindFilter === "all" || item.kind === elementKindFilter) &&
              matchesItemSearch(item, elementSearch.trim()),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [elementKindFilter, elementSearch, groups],
  );
  const filteredElements = useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups],
  );
  const visibleRelationships = useMemo(
    () =>
      relationsOnlyFocus && highlighted
        ? relatedRelationships
        : relationships,
    [highlighted, relatedRelationships, relationships, relationsOnlyFocus],
  );
  const highlightedRelationship = highlightedRelationshipId
    ? relationships.find((relationship) => relationship.id === highlightedRelationshipId)
    : undefined;
  useEffect(() => {
    if (!highlightedRelationship || activeTab !== "relations") return;
    const target = relationshipRefs.current.get(highlightedRelationship.id);
    if (!target) return;
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    target.scrollIntoView?.({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    target.focus({ preventScroll: true });
  }, [activeTab, highlightedRelationship]);
  const summaryGroups = groups.filter((group) => {
    if (group.kind === "message" || group.kind === "table-column") return false;
    return group.items.length > 0;
  });
  const highlightedElementKey = highlightedElement
    ? `${highlightedElement.kind}:${highlightedElement.id}`
    : "";
  useEffect(() => {
    if (!highlightedElementKey || overviewPanelDismissedRef.current) return;
    setIsOverviewPanelOpen(true);
  }, [highlightedElementKey]);
  const modelTitle = getModelText(draft ?? model, "title", metaLabel);
  const modelSummary = getModelText(draft ?? model, "summary", metaDescription);
  const effectiveSaveStatus = isFeasibility ? contextData?.saveStatus ?? saveStatus : saveStatus;
  const saveStatusLabel =
    effectiveSaveStatus === "saving"
      ? t("diagrams.detail.saveUpdating")
      : effectiveSaveStatus === "saved"
        ? t("diagrams.detail.saveSaved")
        : t("diagrams.detail.saveFailed");
  const notices: ModelNotice[] = [];
  if (isStale) notices.push({ id: "stale", kind: "freshness", tone: "warning", title: "模型已过期", detail: t("diagrams.detail.stale") });
  if (contextData?.errorMessage) notices.push({ id: "context-error", kind: "error", tone: "destructive", title: "可行性分析失败", detail: contextData.errorMessage });
  if (contextData?.statusMessage) notices.push({ id: "context-status", kind: "info", tone: "info", title: "可行性分析状态", detail: contextData.statusMessage });
  if (diagramError) notices.push({ id: "diagram-error", kind: "error", tone: "destructive", title: t("diagrams.detail.generatedFailed", { label: metaLabel }), detail: localizeRunFailure(diagramError.error, t("errors.codes.RUN_INTERNAL_ERROR")) });
  if (visualStatus) notices.push({
    id: "visual", kind: "visual",
    tone: currentVisualReview?.status === "failed" ? "destructive" : currentVisualReview?.status === "passed" ? "success" : currentVisualReview?.status === "pending_review" || currentVisualReview?.status === "not_completed" ? "warning" : "info",
    title: "模型结构检查", detail: visualStatus,
    review: currentVisualReview,
    confirmed: visualConfirmed,
  });
  const noticeButton = notices.length > 0 ? <ModelNotices notices={notices} /> : null;
  const canEditMetadata = Boolean(draft) && !readOnly && canUpdateWorkspace && (!isFeasibility || Boolean(saveContextModel));
  const overviewPanelId = `model-overview-${stage}-${statusKey}`.replace(/[^A-Za-z0-9_-]/g, "-");
  const openOverviewPanel = useCallback(() => {
    overviewPanelDismissedRef.current = false;
    setIsOverviewPanelOpen(true);
  }, []);
  const closeOverviewPanel = useCallback(() => {
    overviewPanelDismissedRef.current = true;
    setIsOverviewPanelOpen(false);
  }, []);
  const sourceRuleIds = useMemo(
    () => sourceRules.map((rule) => rule.id).filter((id): id is string => Boolean(id)),
    [sourceRules],
  );
  const runFocusAction = useCallback(() => {
    if (localHighlightedElement) {
      setLocalHighlightedElement(null);
      return;
    }
    if (isFeasibility) {
      setActiveTab("diagram");
    } else if (isDesign) {
      openDesignDiagram(
        designType,
        designArtifactId,
        getModelText(model, "title", metaLabel),
      );
    } else {
      openDiagram(
        requirementType,
        requirementArtifactId,
        getModelText(model, "title", metaLabel),
      );
    }
  }, [
    designArtifactId,
    designType,
    isFeasibility,
    isDesign,
    localHighlightedElement,
    metaLabel,
    model,
    openDesignDiagram,
    openDiagram,
    requirementArtifactId,
    requirementType,
  ]);
  useEffect(() => {
    if (!isOverviewPanelOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverviewPanel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeOverviewPanel, isOverviewPanelOpen]);
  useEffect(() => {
    setElementSearch("");
    setElementKindFilter("all");
    setRelationsOnlyFocus(false);
    updateSvgScale(1);
  }, [stage, type, updateSvgScale]);

  return (
    <div className="flex min-h-full flex-col bg-background">
      {!model && !source ? (
        <div className="w-full py-6 lg:py-8">
          <div className="mx-auto flex w-[calc(100%-2rem)] max-w-348 flex-col gap-4 sm:w-[calc(100%-3rem)]">
            <PageHeader title={metaLabel} description={metaDescription} notice={noticeButton} actions={isFeasibility ? contextData?.headerAction : undefined} />
            <Card className="gap-0 py-0 border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
              {t("diagrams.detail.notGenerated", {
                stage: isFeasibility
                  ? "可行性分析"
                  : t(`diagrams.stage.${isDesign ? "design" : "requirements"}`),
              })}
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col py-4 lg:py-6">
          <div className="mx-auto flex min-h-0 w-[calc(100%-2rem)] max-w-348 flex-1 flex-col gap-4 sm:w-[calc(100%-3rem)]">
          <DiagramDetailHeader
            key={statusKey}
            modelTitle={modelTitle}
            modelSummary={modelSummary}
            canEdit={canEditMetadata}
            saving={saving}
            saveStatus={effectiveSaveStatus}
            saveStatusLabel={saveStatusLabel}
            compactViewport={compactViewport}
            itemCount={items.length}
            relationshipCount={relationships.length}
            groupCount={groups.length}
            notices={noticeButton}
            actions={isFeasibility ? contextData?.headerAction : undefined}
            onSaveMetadata={saveMetadata}
          />

          <Tabs
            key={`${stage}:${type}:${highlighted ? highlighted.id : "all"}`}
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as typeof activeTab)}
            className="min-w-0 flex-col gap-0"
          >
            {compactViewport || highlightedRelationshipId ? (
            <div className="border-b border-border px-3 sm:px-5">
              <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0 sm:gap-8">
                <TabsTrigger
                  value="diagram"
                  className={cn(
                    "relative flex-none border-0 px-2 after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 data-active:after:block sm:px-0 sm:after:inset-x-0",
                    mobileTouchTargetClass,
                  )}
                >
                  {t("diagrams.tabs.diagram")}
                </TabsTrigger>
                {compactViewport || highlightedRelationshipId ? (
                  <>
                    <TabsTrigger
                      value="elements"
                      className={cn(
                        "relative flex-none border-0 px-2 after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 data-active:after:block sm:px-0 sm:after:inset-x-0",
                        mobileTouchTargetClass,
                      )}
                    >
                      {t("diagrams.tabs.elements")}
                    </TabsTrigger>
                    <TabsTrigger
                      value="relations"
                      className={cn(
                        "relative flex-none border-0 px-2 after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 data-active:after:block sm:px-0 sm:after:inset-x-0",
                        mobileTouchTargetClass,
                      )}
                    >
                      {t("diagrams.tabs.relations")}
                    </TabsTrigger>
                    {draft && !readOnly ? (
                      <TabsTrigger
                        value="edit"
                        className={cn(
                          "relative flex-none border-0 px-2 after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 data-active:after:block sm:px-0 sm:after:inset-x-0",
                          mobileTouchTargetClass,
                        )}
                      >
                        {t("diagrams.tabs.edit")}
                      </TabsTrigger>
                    ) : null}
                  </>
                ) : null}
              </TabsList>
            </div>
            ) : null}

            <TabsContent value="diagram" className="m-0 w-full min-w-0 p-0">
              <DiagramPreviewPanel
                  diagramId={`${visualTaskKind}:${visualId}`}
                  stage={isFeasibility ? "feasibility" : stage}
                  type={type}
                  exportFileStem={isBusinessFlow ? "feasibility-business-flow" : isFeasibility ? "context" : undefined}
                  plantUmlSource={source}
                  normalizedSvgMarkup={normalizedSvgMarkup}
                  svgMarkup={svgMarkup}
                  svgUrl={svgUrl}
                  svgScale={svgScale}
                  svgCanvasRef={svgCanvasRef}
                  isPanning={isPanning}
                  svgPanOffset={svgPanOffset}
                  onUpdateSvgScale={updateSvgScale}
                  onStartPan={startCanvasPan}
                  onMovePan={moveCanvasPan}
                  onStopPan={stopCanvasPan}
                  highlighted={highlighted}
                  highlightAliases={highlightAliases}
                  highlightRequestId={highlightRequestId}
                  diagramError={diagramError}
                  diagramLabel={metaLabel}
                  isOverviewPanelOpen={isOverviewPanelOpen}
                  overviewPanelId={overviewPanelId}
                  compactViewport={compactViewport}
                  onOpenOverviewPanel={openOverviewPanel}
                  onCloseOverviewPanel={closeOverviewPanel}
                  onFocusAction={runFocusAction}
                  sourceRuleIds={sourceRuleIds}
                  relatedRelationships={relatedRelationships}
                  relatedItems={relatedItems}
                  itemsById={itemsById}
                  summaryGroups={summaryGroups}
                  relationshipsCount={relationships.length}
              />
              {!compactViewport && draft ? (
                <div className="pt-4">
                  {isBusinessFlow && Array.isArray(model?.notes) && model.notes.length > 0 && (
                    <ul className="mb-4 list-disc pl-5 text-sm text-muted-foreground">
                      {model.notes.map((note, index) => <li key={index}>{note.replace(/\bRequirementBaseline\b/g, t("uxReview.baseline"))}</li>)}
                    </ul>
                  )}
                  <ModelEditPanel
                    stage={isFeasibility ? "feasibility" : isDesign ? "design" : "requirements"}
                    readOnly={readOnly}
                    draft={draft}
                    setDraft={setDraft}
                    onCommitDraft={commitModelDraft}
                    onSelectElement={selectElementInDiagram}
                    selectedElement={effectiveHighlightedElement}
                    saving={saving}
                    focusSection={isFeasibility && !compactViewport && initialSection !== "diagram"
                      ? initialSection === "relations" ? "relationships" : "elements"
                      : null}
                    sourceRuleOptions={isFeasibility ? sourceRules.map((rule) => ({ id: rule.id, label: rule.text })) : []}
                  />
                </div>
              ) : null}
            </TabsContent>

            {compactViewport && draft && !readOnly ? (
            <TabsContent value="edit" className="m-0 p-0">
              <div className="px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-5">
                <ModelEditPanel
                    stage={isFeasibility ? "feasibility" : isDesign ? "design" : "requirements"}
                  draft={draft}
                  setDraft={setDraft}
                  onCommitDraft={commitModelDraft}
                  onSelectElement={selectElementInDiagram}
                  selectedElement={effectiveHighlightedElement}
                  saving={saving}
                  sourceRuleOptions={isFeasibility ? sourceRules.map((rule) => ({ id: rule.id, label: rule.text })) : []}
                />
              </div>
            </TabsContent>
            ) : null}

            <TabsContent value="elements" className="m-0 min-h-0 flex-1 p-3 data-active:flex data-active:flex-col sm:p-5">
              <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background shadow-sm">
                <div className="border-b border-border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("diagrams.detail.elementsTitle")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("diagrams.detail.elementsDescription")}
                    </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-[3px]">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2"
                        aria-pressed="true"
                        aria-label={t("diagrams.detail.gridView")}
                      >
                        <LayoutGrid className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        aria-pressed="false"
                        aria-label={t("diagrams.detail.listView")}
                      >
                        <List className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {groups.length > 0 ? (
                    <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <label className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={elementSearch}
                          onChange={(event) => setElementSearch(event.target.value)}
                          className="h-9 w-full border pl-9 pr-3 text-xs sm:w-64"
                          placeholder={t("diagrams.detail.searchPlaceholder")}
                        />
                      </label>
                      <SelectControl
                        aria-label={t("diagrams.detail.kindFilter")}
                        className="w-36 shrink-0"
                        value={elementKindFilter}
                        onValueChange={(value) => setElementKindFilter(value as typeof elementKindFilter)}
                        options={[
                          { value: "all", label: t("diagrams.detail.allKinds") },
                          ...groups.map((group) => ({ value: group.kind, label: semanticElementLabel(group.kind, t) })),
                        ]}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 p-4">
                {groups.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                    {t("diagrams.detail.noElements")}
                  </div>
                ) : filteredElements.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                    {t("diagrams.detail.noMatchedElements")}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {filteredElements.map((el) => {
                            const active =
                              highlighted &&
                              highlighted.kind === el.kind &&
                              highlighted.id === el.id;
                            return (
                              <SpotlightCard
                                key={`${el.kind}:${el.id}`}
                                className={cn(
                                  "min-h-[9rem] text-left text-sm",
                                  active
                                    ? "border-primary shadow-sm shadow-primary/10"
                                    : "",
                                )}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  aria-label={el.label}
                                  aria-pressed={Boolean(active)}
                                  className="absolute inset-0 z-10 size-auto cursor-pointer rounded-xl p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  onClick={() => {
                                    if (isFeasibility) {
                                      selectElementInDiagram(el);
                                      setActiveTab("diagram");
                                      return;
                                    }
                                    if (isDesign) {
                                      openDesignDiagramElement(
                                        designType,
                                        el.kind,
                                        el.id,
                                        el.label,
                                        designArtifactId,
                                      );
                                      return;
                                    }
                                    openDiagramElement(
                                      requirementType,
                                      el.kind,
                                      el.id,
                                      el.label,
                                      requirementArtifactId,
                                    );
                                  }}
                                />
                                <span className="pointer-events-none relative z-20 flex min-h-[9rem] flex-col p-4">
                                  <span className="flex items-start justify-between gap-3">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                                      {semanticElementLabel(el.kind, t, true)}
                                    </span>
                                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                                      {semanticElementLabel(el.kind, t)}
                                    </Badge>
                                  </span>
                                  <span className="mt-3 block min-w-0 line-clamp-2 break-words text-sm font-semibold leading-5 text-foreground">
                                    {el.label}
                                  </span>
                                  <span className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                                    {el.description || t("diagrams.detail.noDescription")}
                                  </span>
                                </span>
                              </SpotlightCard>
                            );
                    })}
                  </div>
                )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="relations" className="m-0 min-h-0 flex-1 p-3 data-active:flex data-active:flex-col sm:p-5">
              <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background shadow-sm">
                <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("diagrams.detail.relationsTitle")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("diagrams.detail.relationsDescription")}
                    </p>
                  </div>
                  {highlighted ? (
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs">
                      <Checkbox
                        checked={relationsOnlyFocus}
                        onCheckedChange={setRelationsOnlyFocus}
                        className="size-3.5"
                      />
                      {t("diagrams.detail.focusRelationsOnly")}
                    </label>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 p-4">
                {relationships.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                    {t("diagrams.detail.noRelations")}
                  </div>
                ) : visibleRelationships.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                    {t("diagrams.detail.noFocusRelations")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {visibleRelationships.map((relation, index) => {
                      const displayLabel = getRelationDisplayLabel(relation, itemsById);
                      return (
                      <SpotlightCard
                        key={relation.id}
                        role="article"
                        aria-label={displayLabel}
                        ref={(element) => {
                          if (element) {
                            relationshipRefs.current.set(relation.id, element);
                          } else {
                            relationshipRefs.current.delete(relation.id);
                          }
                        }}
                        tabIndex={relation.id === highlightedRelationship?.id ? -1 : undefined}
                        aria-current={
                          relation.id === highlightedRelationship?.id ? "true" : undefined
                        }
                        className={cn(
                          "gap-0 py-0 overflow-hidden border-l-4",
                          getRelationAccentClass(index),
                          relation.id === highlightedRelationship?.id &&
                            "gap-0 py-0 ring-2 ring-primary ring-offset-2 ring-offset-background",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2 p-4 pb-3">
                          <Badge variant="secondary" className="font-mono">
                            {diagramRelationTypeLabel(relation.typeLabel, t)}
                          </Badge>
                          <span className="font-medium text-foreground">{displayLabel}</span>
                        </div>
                        <div className="mx-4 rounded-xl border border-border bg-muted/40 p-4">
                          <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(88px,160px)_minmax(0,1fr)]">
                            <div className="rounded-lg border border-border bg-background p-3 text-center">
                              <div className="truncate text-sm font-medium text-foreground">
                                {getRelationEndpointLabel(relation, itemsById, "source")}
                              </div>
                              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                                {relation.sourceId}
                              </div>
                            </div>
                            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                              <span className="h-px min-w-8 flex-1 bg-border" />
                              <span className="max-w-28 truncate rounded-full bg-background px-2 py-1">
                                {displayLabel}
                              </span>
                              <span className="h-px min-w-8 flex-1 bg-border" />
                            </div>
                            <div className="rounded-lg border border-border bg-background p-3 text-center">
                              <div className="truncate text-sm font-medium text-foreground">
                                {getRelationEndpointLabel(relation, itemsById, "target")}
                              </div>
                              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                                {relation.targetId}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="px-4 py-3 text-xs text-muted-foreground">
                          <span>
                            {getRelationEndpointLabel(relation, itemsById, "source")} →{" "}
                            {getRelationEndpointLabel(relation, itemsById, "target")}
                          </span>
                          {(itemsById.has(relation.sourceId) || itemsById.has(relation.targetId)) && (
                            <span className="ml-2 font-mono text-[10px] opacity-70">
                              {relation.sourceId} → {relation.targetId}
                            </span>
                          )}
                        </div>
                        {relation.fields.length > 0 && (
                          <div className="grid gap-2 border-t border-border px-4 py-3 text-xs sm:grid-cols-2">
                            {relation.fields.map((field) => (
                              <div key={`${relation.id}:${field.label}`} className="min-w-0">
                                <div className="text-muted-foreground">{diagramDetailFieldLabel(field.label, t)}</div>
                                <div className="mt-1 break-words text-foreground">{field.value}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </SpotlightCard>
                    );})}
                  </div>
                )}
                </div>
              </section>
            </TabsContent>

          </Tabs>

          </div>
        </div>
      )}
    </div>
  );
}
