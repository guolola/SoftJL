// Renders the workspace sidebar navigation and diagram status tree used by desktop and wide viewport layouts.
import { ProjectSidebarNavigation, type ProjectSidebarNode as Node } from './project-sidebar-navigation';
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  FileText,
  Layers,
  Palette,
  Network,
  User,
  Box,
  Package,
  Cloud,
  Database,
  Server,
  Component as ComponentIcon,
  Diamond,
  CircleDot,
  Activity as ActivityIcon,
  Type as TypeIcon,
  Plug,
  GitBranch,
  MessageSquare,
  ClipboardCheck,
  Wrench,
  TableProperties,
} from "lucide-react";
import type { ProjectRouteSection } from "../../../shared/lib/app-route-types";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import {
  getDesignDiagramLabel,
  getDesignModelId,
  getDiagramLabel,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import { DESIGN_DIAGRAM_ICON, FEASIBILITY_ARTIFACT_ICON, REQUIREMENT_DIAGRAM_ICON } from "../../../entities/diagram/model-icons";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import { getRelationDisplayLabel } from "../../diagrams/lib/diagram-detail-view-model";
import { useWorkspaceSession } from "../../workspace-session/state";
import { buildAcceptedRequirementSnapshot, readFeasibilityBusinessFlowArtifact } from "@uml-platform/contracts";
import {
  getSelectionKey,
  useWorkspaceShell,
} from "../state";
import {
  deriveSidebarDiagramState,
  diagramUnavailableReason,
  generationStatusTooltip,
  mergeSidebarStatus,
} from "../lib/sidebar-menu-model";

type SidebarMenuProps = {
  onNavigateItemSelect?: () => void;
  projectRuns?: PlatformRunSummary[];
  activeProjectSection?: ProjectRouteSection | null;
  onOpenProjectSection?: (section: ProjectRouteSection) => void;
};

const KIND_ICON: Record<SemanticElementKind, ReactNode> = {
  "object-node": <Box className="size-3.5 text-muted-foreground" />,
  "flow-final-node": <CircleDot className="size-3.5 text-muted-foreground" />,
  "input-pin": <Plug className="size-3.5 text-muted-foreground" />,
  "output-pin": <Plug className="size-3.5 text-muted-foreground" />,
  activation: <ActivityIcon className="size-3.5 text-muted-foreground" />,
  actor: <User className="size-3.5 text-muted-foreground" />,
  usecase: <CircleDot className="size-3.5 text-muted-foreground" />,
  function: <GitBranch className="size-3.5 text-muted-foreground" />,
  component: <ComponentIcon className="size-3.5 text-muted-foreground" />,
  interface: <Plug className="size-3.5 text-muted-foreground" />,
  "external-system": <Cloud className="size-3.5 text-muted-foreground" />,
  "deployment-node": <Server className="size-3.5 text-muted-foreground" />,
  database: <Database className="size-3.5 text-muted-foreground" />,
  class: <Box className="size-3.5 text-muted-foreground" />,
  enum: <TypeIcon className="size-3.5 text-muted-foreground" />,
  activity: <ActivityIcon className="size-3.5 text-muted-foreground" />,
  decision: <Diamond className="size-3.5 text-muted-foreground" />,
  "system-boundary": <Package className="size-3.5 text-muted-foreground" />,
  "start-node": <CircleDot className="size-3.5 text-muted-foreground" />,
  "end-node": <CircleDot className="size-3.5 text-muted-foreground" />,
  "merge-node": <Diamond className="size-3.5 text-muted-foreground" />,
  "fork-node": <Diamond className="size-3.5 text-muted-foreground" />,
  "join-node": <Diamond className="size-3.5 text-muted-foreground" />,
  swimlane: <Layers className="size-3.5 text-muted-foreground" />,
  artifact: <Package className="size-3.5 text-muted-foreground" />,
  participant: <User className="size-3.5 text-muted-foreground" />,
  message: <MessageSquare className="size-3.5 text-muted-foreground" />,
  fragment: <GitBranch className="size-3.5 text-muted-foreground" />,
  package: <Package className="size-3.5 text-muted-foreground" />,
  table: <Database className="size-3.5 text-muted-foreground" />,
  "table-column": <TypeIcon className="size-3.5 text-muted-foreground" />,
  screen: <Palette className="size-3.5 text-muted-foreground" />,
  module: <Layers className="size-3.5 text-muted-foreground" />,
  "entry-point": <Plug className="size-3.5 text-muted-foreground" />,
};

function rootGenerationStatusTooltip(
  label: string,
  status: Node["status"],
  t: TFunction,
) {
  if (status === "queued") return t("workspace.sidebar.rootQueued", { label });
  if (status === "running") return t("workspace.sidebar.rootRunning", { label });
  return undefined;
}

function buildDiagramNode(
  diagram: DiagramType,
  model: ReturnType<typeof useWorkspaceSession>["models"][string] | undefined,
  stale: boolean,
  failed: boolean,
  status: Node["status"],
  statusTooltip: string | undefined,
  viewable: boolean,
  hasStructuredModel: boolean,
  openDiagram: (diagram: DiagramType, modelId?: string, label?: string) => void,
  openRequirementTraceMatrix: (
    diagram: DiagramType,
    modelId?: string,
    label?: string,
  ) => void,
  openDiagramElement: (
    diagram: DiagramType,
    elementKind: string,
    elementId: string,
    label: string,
    modelId?: string,
  ) => void,
  openDiagramRelationship: (
    diagram: DiagramType,
    relationshipId: string,
    label: string,
    modelId?: string,
  ) => void,
  t: TFunction,
): Node {
  const modelId = model ? getRequirementModelId(model) : diagram;
  const canOpen = viewable && status !== "failed";
  const label =
    diagram === "analysis" && model
      ? ("sourceUseCaseName" in model ? model.sourceUseCaseName : undefined) ?? model.title
      : getDiagramLabel(diagram, t);
  const detail = buildDiagramDetailModel(model);
  const DiagramIcon = REQUIREMENT_DIAGRAM_ICON[diagram];
  const children: Node[] = [
    ...(model
      ? [
          {
            key: `requirements:trace-matrix:${modelId}`,
            label: t("traceability.title.short"),
            icon: <Network className="size-3.5 text-muted-foreground" />,
            onSelect: () => openRequirementTraceMatrix(diagram, modelId, label),
          },
        ]
      : []),
    ...(model
      ? buildDiagramDetailCategoryNodes(
          detail,
          modelId,
          "diagram-category",
          "diagram-group",
          "diagram-element",
          "diagram-relationship",
          (element) =>
            openDiagramElement(
              diagram,
              element.kind,
              element.id,
              element.label,
              modelId,
            ),
          (relationship, relationshipLabel) =>
            openDiagramRelationship(
              diagram,
              relationship.id,
              relationshipLabel,
              modelId,
            ),
          t,
        )
      : []),
  ];

  return {
    key: `diagram:${modelId}`,
    label,
    icon: <DiagramIcon className="size-4 text-muted-foreground" />,
    stale,
    staleTooltip: t("workspace.sidebar.requirementStale"),
    children,
    selectable: canOpen,
    status: failed ? "failed" : status,
    statusTooltip,
    unavailableReason: canOpen
      ? undefined
      : diagramUnavailableReason(status, hasStructuredModel),
    onSelect: canOpen ? () => openDiagram(diagram, modelId, label) : undefined,
  };
}

function buildPendingRequirementDiagramNode(
  diagram: DiagramType,
  modelId: string,
  label: string,
  status: Node["status"],
  statusTooltip: string | undefined,
): Node {
  const DiagramIcon = REQUIREMENT_DIAGRAM_ICON[diagram];
  return {
    key: `diagram:${modelId}`,
    label,
    icon: <DiagramIcon className="size-4 text-muted-foreground" />,
    selectable: false,
    status,
    statusTooltip,
    unavailableReason: diagramUnavailableReason(status, false),
  };
}

function buildDiagramElementGroupNodes(
  detail: ReturnType<typeof buildDiagramDetailModel>,
  modelId: string,
  groupKeyPrefix: string,
  elementKeyPrefix: string,
  onSelectElement: (element: ReturnType<typeof buildDiagramDetailModel>["items"][number]) => void,
  t: TFunction,
): Node[] {
  const tableColumnsByTableId = new Map<
    string,
    ReturnType<typeof buildDiagramDetailModel>["items"]
  >();
  for (const column of detail.groups.find((group) => group.kind === "table-column")?.items ?? []) {
    const tableId = column.id.split(".").slice(0, -1).join(".");
    if (!tableId) continue;
    tableColumnsByTableId.set(tableId, [
      ...(tableColumnsByTableId.get(tableId) ?? []),
      column,
    ]);
  }
  const hasTableHierarchy = tableColumnsByTableId.size > 0;

  return detail.groups
    .filter((group) => !(hasTableHierarchy && group.kind === "table-column"))
    .map((group) => ({
      key: `${groupKeyPrefix}:${modelId}:${group.kind}`,
      label: t(`diagrams.semantic.${group.kind}.label`, {
        defaultValue: SEMANTIC_KIND_META[group.kind].label,
      }),
      selectable: false,
      children: group.items.map((element) => {
        const columnChildren =
          element.kind === "table" ? tableColumnsByTableId.get(element.id) ?? [] : [];
        return {
          key: `${elementKeyPrefix}:${modelId}:${element.kind}:${element.id}`,
          label: element.label,
          icon: KIND_ICON[element.kind],
          children: columnChildren.map((column) => ({
            key: `${elementKeyPrefix}:${modelId}:${column.kind}:${column.id}`,
            label: column.label.includes(".")
              ? column.label.split(".").slice(1).join(".")
              : column.label,
            icon: KIND_ICON[column.kind],
            onSelect: () => onSelectElement(column),
          })),
          onSelect: () => onSelectElement(element),
        };
      }),
    }));
}

function buildDiagramDetailCategoryNodes(
  detail: ReturnType<typeof buildDiagramDetailModel>,
  modelId: string,
  categoryKeyPrefix: string,
  groupKeyPrefix: string,
  elementKeyPrefix: string,
  relationshipKeyPrefix: string,
  onSelectElement: (
    element: ReturnType<typeof buildDiagramDetailModel>["items"][number],
  ) => void,
  onSelectRelationship: (
    relationship: ReturnType<typeof buildDiagramDetailModel>["relationships"][number],
    label: string,
  ) => void,
  t: TFunction,
): Node[] {
  const itemsById = new Map(detail.items.map((item) => [item.id, item]));
  const elementGroups = buildDiagramElementGroupNodes(
    detail,
    modelId,
    groupKeyPrefix,
    elementKeyPrefix,
    onSelectElement,
    t,
  );

  return [
    {
      key: `${categoryKeyPrefix}:${modelId}:elements`,
      label: t("diagrams.tabs.elements"),
      icon: <Layers className="size-3.5 text-muted-foreground" />,
      selectable: false,
      children: elementGroups,
    },
    {
      key: `${categoryKeyPrefix}:${modelId}:relations`,
      label: t("diagrams.tabs.relations"),
      icon: <GitBranch className="size-3.5 text-muted-foreground" />,
      selectable: false,
      children: detail.relationships.map((relationship) => {
        const relationshipLabel = getRelationDisplayLabel(relationship, itemsById);
        return {
          key: `${relationshipKeyPrefix}:${modelId}:${relationship.id}`,
          label: relationshipLabel,
          icon: <GitBranch className="size-3.5 text-muted-foreground" />,
          onSelect: () => onSelectRelationship(relationship, relationshipLabel),
        };
      }),
    },
  ];
}

function buildDesignDiagramNode(
  diagram: DesignDiagramType,
  model: ReturnType<typeof useWorkspaceSession>["designModels"][string] | undefined,
  failed: boolean,
  stale: boolean,
  staleReason: string | undefined,
  status: Node["status"],
  statusTooltip: string | undefined,
  viewable: boolean,
  hasStructuredModel: boolean,
  openDesignDiagram: (
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => void,
  openDesignTraceMatrix: (
    diagram: DesignDiagramType,
    modelId?: string,
    label?: string,
  ) => void,
  openDesignDiagramElement: (
    diagram: DesignDiagramType,
    elementKind: string,
    elementId: string,
    label: string,
    modelId?: string,
  ) => void,
  openDesignDiagramRelationship: (
    diagram: DesignDiagramType,
    relationshipId: string,
    label: string,
    modelId?: string,
  ) => void,
  t: TFunction,
): Node {
  const modelId = model ? getDesignModelId(model) : diagram;
  const DiagramIcon = DESIGN_DIAGRAM_ICON[diagram];
  const canOpen = viewable && status !== "failed";
  const label =
    diagram === "sequence" && model
      ? ("sourceUseCaseName" in model ? model.sourceUseCaseName : undefined) ?? model.title
      : getDesignDiagramLabel(diagram, t);
  const detail = buildDiagramDetailModel(model);
  const children: Node[] = [
    ...(model
      ? [
          {
            key: `design:trace-matrix:${modelId}`,
            label: t("traceability.title.short"),
            icon: <Network className="size-3.5 text-muted-foreground" />,
            onSelect: () => openDesignTraceMatrix(diagram, modelId, label),
          },
        ]
      : []),
    ...(model
      ? buildDiagramDetailCategoryNodes(
          detail,
          modelId,
          "design-diagram-category",
          "design-diagram-group",
          "design-diagram-element",
          "design-diagram-relationship",
          (element) =>
            openDesignDiagramElement(
              diagram,
              element.kind,
              element.id,
              element.label,
              modelId,
            ),
          (relationship, relationshipLabel) =>
            openDesignDiagramRelationship(
              diagram,
              relationship.id,
              relationshipLabel,
              modelId,
            ),
          t,
        )
      : []),
  ];

  return {
    key: `design-diagram:${modelId}`,
    label,
    icon: <DiagramIcon className="size-4 text-muted-foreground" />,
    stale,
    staleTooltip: staleReason ?? t("workspace.sidebar.designStale"),
    children,
    selectable: canOpen,
    status: failed ? "failed" : status,
    statusTooltip,
    unavailableReason: canOpen
      ? undefined
      : diagramUnavailableReason(status, hasStructuredModel),
    onSelect: canOpen ? () => openDesignDiagram(diagram, modelId, label) : undefined,
  };
}

function buildPendingDesignDiagramNode(
  diagram: DesignDiagramType,
  modelId: string,
  label: string,
  status: Node["status"],
  statusTooltip: string | undefined,
): Node {
  const DiagramIcon = DESIGN_DIAGRAM_ICON[diagram];
  return {
    key: `design-diagram:${modelId}`,
    label,
    icon: <DiagramIcon className="size-4 text-muted-foreground" />,
    selectable: false,
    status,
    statusTooltip,
    unavailableReason: diagramUnavailableReason(status, false),
  };
}

export function SidebarMenu({
  onNavigateItemSelect,
  projectRuns = [],
  activeProjectSection = null,
  onOpenProjectSection,
}: SidebarMenuProps = {}) {
  const { t } = useTranslation();
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const {
    generatedDiagrams,
    models,
    staleDiagrams,
    staleRequirementModelIds = [],
    staleDesignDiagrams,
    staleDesignModelIds,
    designStaleReasons,
    diagramErrors,
    svgArtifacts,
    generatedDesignDiagrams,
    designModels,
    designSvgArtifacts,
    designDiagramErrors,
    generationTasks,
    feasibilityContextArtifact,
    feasibilityBusinessFlow,
    rules,
    requirementBaseline,
    hasFeasibilityContextArtifact,
    hasFeasibilityImplementationArtifact,
    feasibilityImplementationPlan,
    feasibilityArtifactStatuses,
    testGenerationResult,
    historyItems,
  } =
    useWorkspaceSession();
  const {
    selection,
    openSystemRequirements,
    openRequirementsText,
    openFeasibilityHome,
    openFeasibilityContext,
    openFeasibilityBusinessFlow,
    openFeasibilityBusinessFlowTrace,
    openFeasibilityBusinessFlowElements,
    openFeasibilityBusinessFlowRelations,
    openFeasibilityBusinessFlowElement,
    openFeasibilityBusinessFlowRelationship,
    openFeasibilityContextTrace,
    openFeasibilityContextElement,
    openFeasibilityContextRelationship,
    openFeasibilityImplementation,
    openRequirementTraceMatrix,
    openDiagram,
    openDesignHome,
    openDesignTraceMatrix,
    openTestHome,
    openDesignDiagram,
    openDesignDiagramElement,
    openDesignDiagramRelationship,
    openDiagramElement,
    openDiagramRelationship,
    openDocumentsHome,
  } = useWorkspaceShell();
  const selectedKey = activeProjectSection ? "" : getSelectionKey(selection);
  const {
    requirementModelViewable,
    designModelViewable,
    requirementModelsByDiagram,
    designModelsByDiagram,
    requirementNodeDiagrams,
    orderedDesignDiagrams,
    requirementStatusFor,
    designStatusFor,
    analysisGenerationActive,
    analysisSubtaskNodes,
    sequenceGenerationActive,
    sequenceSubtaskNodes,
    requirementRootStatus,
    designRootStatus,

    documentRootStatus,
  } = deriveSidebarDiagramState({
    generatedDiagrams,
    models,
    staleDiagrams,
    staleDesignDiagrams,
    staleDesignModelIds,
    diagramErrors,
    svgArtifacts,
    generatedDesignDiagrams,
    designModels,
    designSvgArtifacts,
    designDiagramErrors,
    generationTasks,
    projectRuns,
  });

  useEffect(() => {
    const handleCompleted = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; selectedArtifacts?: string[] }>).detail;
      if (
        detail?.kind !== "requirements" &&
        detail?.kind !== "design" &&
        detail?.kind !== "feasibility"
      ) {
        return;
      }
      setOpenKeys((current) => {
        const next = new Set(current);
        next.add(
          detail.kind === "requirements"
            ? "requirements"
            : detail.kind === "design"
              ? "design"
              : "feasibility",
        );
        if (
          detail.kind === "feasibility" &&
          detail.selectedArtifacts?.includes("context")
        ) {
          next.add("feasibility:context");
        }
        if (detail.kind === "feasibility" && detail.selectedArtifacts?.includes("business-flow")) {
          next.add("feasibility:business-flow");
        }
        return next;
      });
    };

    window.addEventListener("uml-generation-completed", handleCompleted);
    return () => {
      window.removeEventListener("uml-generation-completed", handleCompleted);
    };
  }, []);

  const contextModel = feasibilityContextArtifact?.feasibilityContextModel ?? null;
  const businessFlowArtifact = readFeasibilityBusinessFlowArtifact(feasibilityBusinessFlow);
  const requirementSourceFingerprint = buildAcceptedRequirementSnapshot(rules, requirementBaseline).snapshot.fingerprint;
  // Session freshness includes supplementary facts, just like generation and document preflight.
  const contextStale = feasibilityArtifactStatuses?.context === "stale";
  const businessFlowStale = Boolean(businessFlowArtifact && businessFlowArtifact.fingerprint !== requirementSourceFingerprint);
  const implementationStale = feasibilityArtifactStatuses?.implementation === "stale";
  const latestFeasibilityRun = [
    ...generationTasks.filter((task) => task.kind === "feasibility").map((task) => ({
      stage: task.diagnostics.activeStage, status: task.status, startedAt: task.startedAt, subtasks: task.subtasks,
    })),
    // The project summary has only one active stage; prefer the live task's
    // per-artifact status when both records refer to the same run.
    ...projectRuns.filter((run) => run.runKind === "feasibility" &&
      !generationTasks.some((task) => task.kind === "feasibility" && task.runId === run.runId)).map((run) => ({
      stage: run.stage, status: run.status, startedAt: run.startedAt ?? run.createdAt ?? "", subtasks: [],
    })),
  ].sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  const feasibilityRunStatusFor = (kind: "context" | "business-flow" | "implementation"): Node["status"] => {
    const subtask = latestFeasibilityRun?.subtasks.find((item) => item.id === kind);
    if (subtask) {
      if (subtask.status === "completed" || subtask.status === "pending_review") return "completed";
      if (subtask.status === "failed") return "failed";
      if (latestFeasibilityRun?.status === "failed") return "failed";
      return subtask.status === "queued" ? "queued" : "running";
    }
    const stageMatches = kind === "context" ? ["generate_context", "render_context"] :
      kind === "business-flow" ? ["generate_business_flow", "render_business_flow"] : ["generate_implementation"];
    return latestFeasibilityRun && stageMatches.includes(latestFeasibilityRun.stage ?? "") &&
      ["queued", "running", "failed"].includes(latestFeasibilityRun.status)
      ? latestFeasibilityRun.status as Node["status"] : "completed";
  };
  const latestDocument = [
    ...generationTasks.filter((task) => task.kind === "document").map((task) => ({ status: task.status, at: task.startedAt })),
    ...projectRuns.filter((run) => run.runKind === "document").map((run) => ({ status: run.status, at: run.startedAt ?? run.createdAt ?? "" })),
    ...historyItems.filter((item) => item.documentKind || (item.snapshot && "documentKind" in item.snapshot)).map((item) => ({ status: item.snapshot?.status ?? item.status, at: item.createdAt })),
  ].sort((left, right) => right.at.localeCompare(left.at))[0];
  const savedDocumentStatus: Node["status"] = latestDocument?.status === "completed" ? "completed"
    : latestDocument?.status === "failed" || latestDocument?.status === "interrupted" ? "failed" : undefined;
  const contextDetail = buildDiagramDetailModel(contextModel);
  const contextModelId = contextModel?.modelId ?? "context";
  const ContextIcon = FEASIBILITY_ARTIFACT_ICON.context;
  const BusinessFlowIcon = FEASIBILITY_ARTIFACT_ICON["business-flow"];
  const AnalysisIcon = REQUIREMENT_DIAGRAM_ICON.analysis;
  const SequenceIcon = DESIGN_DIAGRAM_ICON.sequence;
  const feasibilityChildren: Node[] = [
    ...(hasFeasibilityContextArtifact || latestFeasibilityRun?.subtasks.some((item) => item.id === "context")
      ? [
          {
            key: "feasibility:context",
            status: feasibilityRunStatusFor("context"),
            stale: contextStale,
            staleTooltip: `${t("workspace.sidebar.contextDiagram")} · ${t("feasibility.status.stale")}`,
            label: t("workspace.sidebar.contextDiagram"),
            icon: <ContextIcon className="size-4 text-muted-foreground" />,
            onSelect: openFeasibilityContext,
            children: [
              { key: "feasibility:context:trace", label: t("workspace.sidebar.traceability"), icon: <TableProperties className="size-3.5 text-muted-foreground" />, onSelect: openFeasibilityContextTrace },
              ...buildDiagramDetailCategoryNodes(
                contextDetail,
                contextModelId,
                "feasibility-context-category",
                "feasibility-context-group",
                "feasibility-context-element",
                "feasibility-context-relationship",
                (element) => openFeasibilityContextElement(element.kind, element.id, element.label),
                (relationship, relationshipLabel) =>
                  openFeasibilityContextRelationship(
                    relationship.id,
                    relationshipLabel,
                  ),
                t,
              ),
            ],
          },
        ]
      : []),
    ...(businessFlowArtifact || latestFeasibilityRun?.subtasks.some((item) => item.id === "business-flow") ? [{
      key: "feasibility:business-flow",
      label: t("feasibility.artifact.businessFlow"),
      icon: <BusinessFlowIcon className="size-4 text-muted-foreground" />,
      onSelect: openFeasibilityBusinessFlow,
      children: [
        { key: "feasibility:business-flow:trace", label: t("workspace.sidebar.traceability"), icon: <TableProperties className="size-3.5 text-muted-foreground" />, onSelect: openFeasibilityBusinessFlowTrace },
        ...buildDiagramDetailCategoryNodes(
          buildDiagramDetailModel(businessFlowArtifact?.model ?? null), "feasibility-business-flow",
          "feasibility-business-flow-category", "feasibility-business-flow-group",
          "feasibility-business-flow-element", "feasibility-business-flow-relationship",
          (element) => openFeasibilityBusinessFlowElement(element.kind, element.id, element.label),
          (relationship, label) => openFeasibilityBusinessFlowRelationship(relationship.id, label),
          t,
        ).map((node) => ({ ...node, selectable: true,
          key: `feasibility:business-flow:${node.key.endsWith(":elements") ? "elements" : "relations"}`,
          onSelect: node.key.endsWith(":elements") ? openFeasibilityBusinessFlowElements : openFeasibilityBusinessFlowRelations,
        })),
      ],
      status: feasibilityRunStatusFor("business-flow"),
      statusTooltip: generationStatusTooltip(t("feasibility.artifact.businessFlow"), feasibilityRunStatusFor("business-flow"), Boolean(businessFlowArtifact?.svg.svg)),
      stale: businessFlowStale,
      staleTooltip: `${t("feasibility.artifact.businessFlow")} · ${t("feasibility.status.stale")}`,
    }] : []),
    ...(hasFeasibilityImplementationArtifact || latestFeasibilityRun?.subtasks.some((item) => item.id === "implementation")
      ? [
          {
            key: "feasibility:implementation",
            status: feasibilityRunStatusFor("implementation"),
            stale: implementationStale,
            staleTooltip: `${t("workspace.sidebar.implementation")} · ${t("feasibility.status.stale")}`,
            label: t("workspace.sidebar.implementation"),
            icon: <Wrench className="size-4 text-muted-foreground" />,
            onSelect: openFeasibilityImplementation,
            children: feasibilityImplementationPlan?.candidates.map((candidate) => ({
              key: `feasibility:implementation:${candidate.id}`,
              label: candidate.name,
              icon: <Wrench className="size-3.5 text-muted-foreground" />,
              onSelect: () =>
                openFeasibilityImplementation(candidate.id, candidate.name),
            })),
          },
        ]
      : []),
  ];

  const tree: Node[] = [
    {
      key: "system-requirements",
      label: t("workspace.tabs.labels.systemRequirements"),
      icon: <FileText className="size-4 text-muted-foreground" />,
      onSelect: openSystemRequirements,
    },
    {
      key: "feasibility",
      label: t("workspace.tabs.labels.feasibility"),
      icon: <Wrench className="size-4 text-muted-foreground" />,
      onSelect: openFeasibilityHome,
      children: feasibilityChildren,
    },
    {
      key: "requirements",
      label: t("workspace.tabs.labels.requirements"),
      icon: <FileText className="size-4 text-muted-foreground" />,
      status: requirementRootStatus,
      statusTooltip: rootGenerationStatusTooltip(t("workspace.sidebar.requirementPipeline"), requirementRootStatus, t),
      onSelect: openRequirementsText,
      children: [
        ...requirementNodeDiagrams.map((diagram) => {
          if (
            diagram === "analysis" &&
            (analysisSubtaskNodes.length > 1 ||
              (analysisGenerationActive && analysisSubtaskNodes.length > 0))
          ) {
            const groupStatus = analysisSubtaskNodes.reduce<Node["status"]>(
              (current, model) =>
                mergeSidebarStatus(current, model.status ?? null),
              undefined,
            );
            return {
              key: "diagram-group:analysis",
              stale: staleDiagrams.includes("analysis"),
              staleTooltip: t("workspace.sidebar.requirementStale"),
              label: getDiagramLabel("analysis", t),
              icon: <AnalysisIcon className="size-4 text-muted-foreground" />,
              selectable: false,
              status: groupStatus,
              statusTooltip: generationStatusTooltip(
                getDiagramLabel("analysis", t),
                groupStatus,
                analysisSubtaskNodes.some((node) =>
                  requirementModelViewable("analysis", node.id),
                ),
                analysisSubtaskNodes.some((node) => Boolean(models[node.id])),
              ),
              children: analysisSubtaskNodes.map((node) => {
                const model = models[node.id];
                const status = node.status;
                if (!model) {
                  return buildPendingRequirementDiagramNode(
                    diagram,
                    node.id,
                    node.label,
                    status,
                    generationStatusTooltip(node.label, status, false),
                  );
                }
                const viewable = requirementModelViewable(diagram, node.id);
                const hasStructuredModel = Boolean(model);
                return buildDiagramNode(
                  diagram,
                  model,
                  staleRequirementModelIds.includes(getRequirementModelId(model)),
                  Boolean(diagramErrors[node.id] ?? diagramErrors[diagram]),
                  status,
                  generationStatusTooltip(
                    model.title,
                    status,
                    viewable,
                    hasStructuredModel,
                  ),
                  viewable,
                  hasStructuredModel,
                  openDiagram,
                  openRequirementTraceMatrix,
                  openDiagramElement,
                  openDiagramRelationship,
                  t,
                );
              }),
            };
          }
          const model = requirementModelsByDiagram[diagram][0] ?? models[diagram];
          const modelId = model ? getRequirementModelId(model) : undefined;
          const status = requirementStatusFor(diagram, modelId);
          const viewable = requirementModelViewable(diagram, modelId);
          const hasStructuredModel = Boolean(model) || generatedDiagrams.includes(diagram);
          return buildDiagramNode(
            diagram,
            model,
            modelId ? staleRequirementModelIds.includes(modelId) : staleDiagrams.includes(diagram),
            Boolean((modelId ? diagramErrors[modelId] : undefined) ?? diagramErrors[diagram]),
            status,
            generationStatusTooltip(
              getDiagramLabel(diagram, t),
              status,
              viewable,
              hasStructuredModel,
            ),
            viewable,
            hasStructuredModel,
            openDiagram,
            openRequirementTraceMatrix,
            openDiagramElement,
            openDiagramRelationship,
            t,
          );
        }),
      ],
    },
    {
      key: "design",
      label: t("workspace.tabs.labels.design"),
      icon: <Palette className="size-4 text-muted-foreground" />,
      status: designRootStatus,
      statusTooltip: rootGenerationStatusTooltip(t("workspace.sidebar.designPipeline"), designRootStatus, t),
      onSelect: openDesignHome,
      children: [
        ...orderedDesignDiagrams.map((diagram) => {
          const diagramModels = designModelsByDiagram[diagram];
          if (
            diagram === "sequence" &&
            (sequenceSubtaskNodes.length > 1 ||
              (sequenceGenerationActive && sequenceSubtaskNodes.length > 0))
          ) {
            const sequenceGroupViewable = sequenceSubtaskNodes.some((node) =>
              designModelViewable("sequence", node.id),
            );
            const sequenceGroupHasStructuredModel = sequenceSubtaskNodes.some((node) =>
              Boolean(designModels[node.id]),
            );
            const sequenceGroupStale =
              staleDesignDiagrams.includes("sequence") ||
              sequenceSubtaskNodes.some((node) =>
                staleDesignModelIds.includes(node.id),
              );
            const sequenceGroupStaleReason =
              sequenceSubtaskNodes
                .map((node) => designStaleReasons[node.id])
                .find(Boolean) ??
              (staleDesignDiagrams.includes("sequence")
                ? t("workspace.sidebar.designUpstreamStale")
                : undefined);
            const groupStatus = sequenceSubtaskNodes.reduce<Node["status"]>(
              (current, model) =>
                mergeSidebarStatus(
                  current,
                  model.status ?? null,
                ),
              undefined,
            );
            return {
              key: "design-diagram:sequence",
              label: getDesignDiagramLabel("sequence", t),
              icon: <SequenceIcon className="size-4 text-muted-foreground" />,
              stale: sequenceGroupStale,
              staleTooltip: sequenceGroupStaleReason,
              selectable: sequenceGroupViewable,
              status: groupStatus,
              statusTooltip:
                generationStatusTooltip(
                  getDesignDiagramLabel("sequence", t),
                  groupStatus,
                  sequenceSubtaskNodes.some((node) =>
                    designModelViewable("sequence", node.id),
                  ),
                  sequenceGroupHasStructuredModel,
                ),
              unavailableReason: sequenceGroupViewable
                ? undefined
                : diagramUnavailableReason(groupStatus, sequenceGroupHasStructuredModel),
              onSelect: sequenceGroupViewable
                ? () =>
                    openDesignDiagram(
                      "sequence",
                      undefined,
                      getDesignDiagramLabel("sequence", t),
                    )
                : undefined,
              children: sequenceSubtaskNodes.map((node) =>
                {
                  const model = designModels[node.id];
                  const status = node.status;
                  if (!model) {
                    return buildPendingDesignDiagramNode(
                      diagram,
                      node.id,
                      node.label,
                      status,
                      generationStatusTooltip(node.label, status, false),
                    );
                  }
                  const viewable = designModelViewable(diagram, node.id);
                  const hasStructuredModel = Boolean(model);
                  const stale = staleDesignModelIds.includes(node.id);
                  const staleReason = designStaleReasons[node.id];
                  return buildDesignDiagramNode(
                    diagram,
                    model,
                    status === "failed",
                    stale,
                    staleReason,
                    status,
                    generationStatusTooltip(
                      model.title,
                      status,
                      viewable,
                      hasStructuredModel,
                    ),
                    viewable,
                    hasStructuredModel,
                    openDesignDiagram,
                    openDesignTraceMatrix,
                    openDesignDiagramElement,
                    openDesignDiagramRelationship,
                    t,
                  );
                }
              ),
            };
          }
          const model = diagramModels[0];
          const status = designStatusFor(
            diagram,
            model ? getDesignModelId(model) : undefined,
          );
          const modelId = model ? getDesignModelId(model) : undefined;
          const viewable = designModelViewable(diagram, modelId);
          const hasStructuredModel =
            Boolean(model) || generatedDesignDiagrams.includes(diagram);
          const stale = Boolean(
            (modelId && staleDesignModelIds.includes(modelId)) ||
              staleDesignDiagrams.includes(diagram),
          );
          const staleReason =
            (modelId ? designStaleReasons[modelId] : undefined) ??
            (stale ? t("workspace.sidebar.designUpstreamStale") : undefined);
          return buildDesignDiagramNode(
            diagram,
            model,
            status === "failed",
            stale,
            staleReason,
            status,
            generationStatusTooltip(
              getDesignDiagramLabel(diagram, t),
              status,
              viewable,
              hasStructuredModel,
            ),
            viewable,
            hasStructuredModel,
            openDesignDiagram,
            openDesignTraceMatrix,
            openDesignDiagramElement,
            openDesignDiagramRelationship,
            t,
          );
        }),
      ],
    },

    {
      key: "test",
      status: testGenerationResult ? "completed" : undefined,
      label: t("workspace.tabs.labels.tests"),
      icon: <ClipboardCheck className="size-4 text-muted-foreground" />,
      onSelect: openTestHome,
    },
    {
      key: "documents",
      label: t("workspace.tabs.labels.documents"),
      icon: <FileText className="size-4 text-muted-foreground" />,
      status: documentRootStatus ?? savedDocumentStatus,
      statusTooltip: rootGenerationStatusTooltip(t("workspace.sidebar.documentPipeline"), documentRootStatus, t),
      onSelect: openDocumentsHome,
    },
  ];

  return <ProjectSidebarNavigation tree={tree} selectedKey={selectedKey} openKeys={openKeys} setOpenKeys={setOpenKeys}
    onNavigateItemSelect={onNavigateItemSelect} activeProjectSection={activeProjectSection} onOpenProjectSection={onOpenProjectSection} />;
}
