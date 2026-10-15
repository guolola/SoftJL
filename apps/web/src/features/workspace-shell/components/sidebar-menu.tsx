// Renders the workspace sidebar navigation and diagram status tree used by desktop and wide viewport layouts.
import { Badge } from '../../../shared/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../shared/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../shared/ui/collapsible";
import { SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu as TemplateSidebarMenu, SidebarMenuItem, SidebarMenuSub, SidebarMenuAction, SidebarMenuButton, useSidebar } from '../../../shared/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator, DropdownMenuGroup } from '../../../shared/ui/dropdown-menu';
import { Button } from '../../../shared/ui/button';
import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  FileText,
  Layers,
  Code2,
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
  Clock3,
  Loader2,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Wrench,
  TableProperties,
  History,
  Settings2,
  Users,
  BookOpen,
} from "lucide-react";
import type { ProjectRouteSection } from "../../../shared/lib/app-route-types";
import { cn } from "../../../shared/ui/utils";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import {
  getDesignDiagramLabel,
  getDesignModelId,
  getDiagramLabel,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
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
  type SidebarNodeStatus,
} from "../lib/sidebar-menu-model";

type Node = {
  key: string;
  label: string;
  icon?: ReactNode;
  children?: Node[];
  selectable?: boolean;
  badge?: string | number;
  badgeTooltip?: string;
  badges?: string[];
  status?: SidebarNodeStatus;
  statusTooltip?: string;
  unavailableReason?: string;
  onSelect?: () => void;
};

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

function TraceBadge({
  label,
  tooltip,
}: {
  label: string | number;
  tooltip?: string;
}) {
  const badge = <Badge variant="secondary" className="max-w-24 shrink-0 truncate px-2 py-0.5 text-[11px]">{label}</Badge>;
  return tooltip ? <Tooltip><TooltipTrigger render={<span tabIndex={0} />}>{badge}</TooltipTrigger><TooltipContent className="max-w-64">{tooltip}</TooltipContent></Tooltip> : badge;
}

// Collapsed navigation uses actual menu items, preserving arrow-key traversal at every depth.
function FlyoutItems({ node, onSelect }: { node: Node; onSelect?: () => void }) {
  const select = () => {
    if (node.selectable !== false && node.onSelect) { node.onSelect(); onSelect?.(); }
    else if (node.unavailableReason) floatingAlert.message(node.unavailableReason);
  };
  return <DropdownMenuGroup>
    <DropdownMenuItem onClick={select} title={node.unavailableReason}>{node.icon}<span className="truncate">{node.label}</span></DropdownMenuItem>
    {!!node.children?.length && <DropdownMenuSeparator />}
    {node.children?.map(child => child.children?.length ? <DropdownMenuSub key={child.key}>
      <DropdownMenuSubTrigger>{child.icon}<span className="truncate">{child.label}</span></DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[80vh] w-72 overflow-auto"><FlyoutItems node={child} onSelect={onSelect} /></DropdownMenuSubContent>
    </DropdownMenuSub> : <DropdownMenuItem key={child.key} title={child.unavailableReason} onClick={() => {
      if (child.selectable !== false && child.onSelect) { child.onSelect(); onSelect?.(); }
      else if(child.unavailableReason) floatingAlert.message(child.unavailableReason);
    }}>{child.icon}<span className="truncate">{child.label}</span></DropdownMenuItem>)}
  </DropdownMenuGroup>;
}

function GenerationStatusIndicator({
  status,
  tooltip,
}: {
  status: NonNullable<Node["status"]>;
  tooltip?: string;
}) {
  const { t } = useTranslation();
  const label =
    tooltip ??
    (status === "queued"
      ? t("workspace.sidebar.queued")
      : status === "running"
      ? t("workspace.sidebar.generating")
      : status === "failed"
        ? t("workspace.sidebar.generationFailed")
        : t("workspace.sidebar.generated"));
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-flex size-5 shrink-0 items-center justify-center"
    >
      {status === "queued" ? (
        <Clock3 className="size-3.5 text-muted-foreground" />
      ) : status === "running" ? (
        <Loader2 className="size-3.5 animate-spin text-primary" />
      ) : status === "failed" ? (
        <XCircle className="size-3.5 text-destructive" />
      ) : (
        <CheckCircle2 className="size-3.5 text-success" />
      )}
    </span>
  );
}

function rootGenerationStatusTooltip(
  label: string,
  status: Node["status"],
  t: TFunction,
) {
  if (status === "queued") return t("workspace.sidebar.rootQueued", { label });
  if (status === "running") return t("workspace.sidebar.rootRunning", { label });
  return undefined;
}

function TreeItem({
  node,
  depth,
  selectedKey,
  openKeys,
  setOpenKeys,
  onNavigateItemSelect,
}: {
  node: Node;
  depth: number;
  selectedKey: string;
  openKeys: Set<string>;
  setOpenKeys: Dispatch<SetStateAction<Set<string>>>;
  onNavigateItemSelect?: () => void;
}) {
  const { t } = useTranslation();
  const { state, isMobile } = useSidebar();
  const hasChildren = !!node.children?.length;
  const open = openKeys.has(node.key);
  const selected = selectedKey === node.key;
  const selectable = node.selectable ?? true;
  const setNodeOpen = (nextOpen: boolean) =>
    setOpenKeys((current) => {
      const next = new Set(current);
      if (nextOpen) {
        next.add(node.key);
      } else {
        next.delete(node.key);
      }
      return next;
    });
  const handleSelect = () => {
    if (selectable) {
      if (node.onSelect) {
        node.onSelect();
        onNavigateItemSelect?.();
      }
      return;
    }
    if (node.unavailableReason) {
      floatingAlert.message(node.unavailableReason);
      return;
    }
  };

  // Icon mode uses the template menu flyout so every nested business item remains reachable.
  if (state === 'collapsed' && !isMobile) {
    return <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton data-onboarding-nav={node.key} aria-label={node.label} isActive={selected} />}>
        {node.icon}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="max-h-[80vh] w-72 overflow-auto">
        <FlyoutItems node={node} onSelect={onNavigateItemSelect} />
      </DropdownMenuContent>
    </DropdownMenu>;
  }
  return (
    <Collapsible open={open} onOpenChange={setNodeOpen} render={<SidebarMenuItem />}>
      <SidebarMenuButton
        data-onboarding-nav={node.key}
        isActive={selected}
        tooltip={node.label}
        onClick={handleSelect}
        aria-label={node.label}
        className="data-active:bg-primary/10!"
        title={node.unavailableReason ?? node.statusTooltip}
      >
        {node.icon}
        <span className="truncate">{node.label}</span>
        {node.badge !== undefined && <TraceBadge label={node.badge} tooltip={node.badgeTooltip} />}
        {node.badges?.map(badge => <TraceBadge key={badge} label={badge} />)}
        {node.status && <GenerationStatusIndicator status={node.status} tooltip={node.statusTooltip} />}
      </SidebarMenuButton>
      {hasChildren && <CollapsibleTrigger
        aria-label={t(open ? "workspace.sidebar.collapse" : "workspace.sidebar.expand", { label: node.label })}
        aria-controls={`sidebar-panel-${node.key}`}
        render={<SidebarMenuAction />}
      ><ChevronRight className={cn('transition-transform duration-200', open && 'rotate-90')} /></CollapsibleTrigger>}
      {hasChildren && <CollapsibleContent id={`sidebar-panel-${node.key}`} className="h-(--collapsible-panel-height) overflow-hidden transition-all duration-200 data-ending-style:h-0 data-starting-style:h-0">
        <SidebarMenuSub className={depth === 0 ? "mr-0 pr-0" : "mr-0 ml-2 pr-0 pl-2"}>
          {node.children!.map(child => <TreeItem key={child.key} node={child} depth={depth + 1} selectedKey={selectedKey} openKeys={openKeys} setOpenKeys={setOpenKeys} onNavigateItemSelect={onNavigateItemSelect} />)}
        </SidebarMenuSub>
      </CollapsibleContent>}
    </Collapsible>
  );
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
          { showGroupBadges: true },
          t,
        )
      : []),
  ];

  return {
    key: `diagram:${modelId}`,
    label,
    icon: (
      <span className="relative inline-flex">
        <Network className="size-4 text-muted-foreground" />
        {stale && (
          <span
            title={t("workspace.sidebar.requirementStale")}
            className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning"
          />
        )}
        {failed && (
          <span
            title={t("workspace.sidebar.requirementFailed")}
            className="absolute -left-0.5 -top-0.5 size-1.5 rounded-full bg-destructive"
          />
        )}
      </span>
    ),
    children,
    badge: detail.items.length || undefined,
    selectable: canOpen,
    status,
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
  return {
    key: `diagram:${modelId}`,
    label,
    icon: <Network className="size-4 text-muted-foreground" />,
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
  options: { showGroupBadges: boolean },
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
      badge: options.showGroupBadges ? group.items.length : undefined,
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
  options: { showGroupBadges: boolean },
  t: TFunction,
): Node[] {
  const itemsById = new Map(detail.items.map((item) => [item.id, item]));
  const elementGroups = buildDiagramElementGroupNodes(
    detail,
    modelId,
    groupKeyPrefix,
    elementKeyPrefix,
    onSelectElement,
    options,
    t,
  );

  return [
    {
      key: `${categoryKeyPrefix}:${modelId}:elements`,
      label: t("diagrams.tabs.elements"),
      icon: <Layers className="size-3.5 text-muted-foreground" />,
      selectable: false,
      badge: detail.items.length,
      children: elementGroups,
    },
    {
      key: `${categoryKeyPrefix}:${modelId}:relations`,
      label: t("diagrams.tabs.relations"),
      icon: <GitBranch className="size-3.5 text-muted-foreground" />,
      selectable: false,
      badge: detail.relationships.length,
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
          { showGroupBadges: false },
          t,
        )
      : []),
  ];

  return {
    key: `design-diagram:${modelId}`,
    label,
    icon: (
      <span className="relative inline-flex">
        <Network className="size-4 text-muted-foreground" />
        {stale && (
          <span
            title={stale ? t("workspace.sidebar.designStale") : staleReason}
            className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning"
          />
        )}
        {failed && (
          <span
            title={t("workspace.sidebar.designFailed")}
            className="absolute -left-0.5 -top-0.5 size-1.5 rounded-full bg-destructive"
          />
        )}
      </span>
    ),
    children,
    selectable: canOpen,
    status,
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
  return {
    key: `design-diagram:${modelId}`,
    label,
    icon: <Network className="size-4 text-muted-foreground" />,
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
  const { setOpenMobile } = useSidebar();
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const {
    generatedDiagrams,
    models,
    staleDiagrams,
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
  const businessFlowStale = businessFlowArtifact && businessFlowArtifact.fingerprint !==
    buildAcceptedRequirementSnapshot(rules, requirementBaseline).snapshot.fingerprint;
  const latestFeasibilityRun = [
    ...generationTasks.filter((task) => task.kind === "feasibility").map((task) => ({
      stage: task.diagnostics.activeStage, status: task.status, startedAt: task.startedAt,
    })),
    ...projectRuns.filter((run) => run.runKind === "feasibility").map((run) => ({
      stage: run.stage, status: run.status, startedAt: run.startedAt ?? run.createdAt ?? "",
    })),
  ].sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  const businessFlowRunStatus = latestFeasibilityRun &&
    ["generate_business_flow", "render_business_flow"].includes(latestFeasibilityRun.stage ?? "") &&
    ["running", "failed"].includes(latestFeasibilityRun.status)
    ? latestFeasibilityRun.status as "running" | "failed" : undefined;
  const contextDetail = buildDiagramDetailModel(contextModel);
  const contextModelId = contextModel?.modelId ?? "context";
  const feasibilityChildren: Node[] = [
    ...(hasFeasibilityContextArtifact
      ? [
          {
            key: "feasibility:context",
            label: t("workspace.sidebar.contextDiagram"),
            icon: <Network className="size-4 text-muted-foreground" />,
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
                { showGroupBadges: true },
                t,
              ),
            ],
            badge: contextDetail.items.length || undefined,
          },
        ]
      : []),
    ...(businessFlowArtifact ? [{
      key: "feasibility:business-flow",
      label: t("feasibility.artifact.businessFlow"),
      icon: <ActivityIcon className="size-4 text-muted-foreground" />,
      onSelect: openFeasibilityBusinessFlow,
      children: [
        { key: "feasibility:business-flow:trace", label: t("workspace.sidebar.traceability"), icon: <TableProperties className="size-3.5 text-muted-foreground" />, onSelect: openFeasibilityBusinessFlowTrace },
        ...buildDiagramDetailCategoryNodes(
          buildDiagramDetailModel(businessFlowArtifact.model), "feasibility-business-flow",
          "feasibility-business-flow-category", "feasibility-business-flow-group",
          "feasibility-business-flow-element", "feasibility-business-flow-relationship",
          (element) => openFeasibilityBusinessFlowElement(element.kind, element.id, element.label),
          (relationship, label) => openFeasibilityBusinessFlowRelationship(relationship.id, label),
          { showGroupBadges: true }, t,
        ).map((node) => ({ ...node, selectable: true,
          key: `feasibility:business-flow:${node.key.endsWith(":elements") ? "elements" : "relations"}`,
          onSelect: node.key.endsWith(":elements") ? openFeasibilityBusinessFlowElements : openFeasibilityBusinessFlowRelations,
        })),
      ],
      status: businessFlowRunStatus,
      statusTooltip: generationStatusTooltip(t("feasibility.artifact.businessFlow"), businessFlowRunStatus, true),
      badge: businessFlowStale ? t("feasibility.status.stale") : undefined,
    }] : []),
    ...(hasFeasibilityImplementationArtifact
      ? [
          {
            key: "feasibility:implementation",
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
              label: `${getDiagramLabel("analysis", t)}（${analysisSubtaskNodes.length}）`,
              icon: <MessageSquare className="size-4 text-muted-foreground" />,
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
                  staleDiagrams.includes(diagram),
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
            staleDiagrams.includes(diagram),
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
              label: t("workspace.sidebar.groupCount", { label: getDesignDiagramLabel("sequence", t), count: sequenceSubtaskNodes.length }),
              icon: (
                <span className="relative inline-flex">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  {sequenceGroupStale && (
                    <span
                      title={sequenceGroupStaleReason ?? t("workspace.sidebar.designStale")}
                      className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning"
                    />
                  )}
                </span>
              ),
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
      label: t("workspace.tabs.labels.tests"),
      icon: <ClipboardCheck className="size-4 text-muted-foreground" />,
      onSelect: openTestHome,
    },
    {
      key: "documents",
      label: t("workspace.tabs.labels.documents"),
      icon: <FileText className="size-4 text-muted-foreground" />,
      status: documentRootStatus,
      statusTooltip: rootGenerationStatusTooltip(t("workspace.sidebar.documentPipeline"), documentRootStatus, t),
      onSelect: openDocumentsHome,
    },
  ];

  const projectItems: { section: ProjectRouteSection; label: string; icon: ReactNode; id?: string }[] = [
    { section: "lineage", label: t("status.lineage"), icon: <GitBranch /> },
    { section: "history", label: t("status.runHistory"), icon: <History />, id: "onboarding-history-action" },
    { section: "settings", label: t("projectShell.sections.settings"), icon: <Settings2 />, id: "onboarding-settings-action" },
    { section: "members", label: t("projectShell.drawer.membersShort"), icon: <Users /> },
    { section: "documents", label: t("projectShell.drawer.documents"), icon: <BookOpen /> },
  ];

  return (
    <nav aria-label={t("workspace.sidebar.navigation")} className="h-full w-full">
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-foreground/50 tracking-wider uppercase">{t("workspace.sidebar.navigation")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <TemplateSidebarMenu>
            {tree.map(node => <TreeItem key={node.key} node={node} depth={0} selectedKey={selectedKey} openKeys={openKeys} setOpenKeys={setOpenKeys} onNavigateItemSelect={onNavigateItemSelect} />)}
          </TemplateSidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {onOpenProjectSection && <SidebarGroup>
        <SidebarGroupLabel>{t("projectShell.management")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <TemplateSidebarMenu>
            {projectItems.map(item => <SidebarMenuItem key={item.section}>
              <SidebarMenuButton
                id={item.id}
                tooltip={item.label}
                aria-label={item.label}
                aria-current={activeProjectSection === item.section ? "page" : undefined}
                isActive={activeProjectSection === item.section}
                className="data-active:bg-primary/10!"
                onClick={() => {
                  onOpenProjectSection(item.section);
                  setOpenMobile(false);
                }}
              >{item.icon}<span>{item.label}</span></SidebarMenuButton>
            </SidebarMenuItem>)}
          </TemplateSidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>}
    </nav>
  );
}
