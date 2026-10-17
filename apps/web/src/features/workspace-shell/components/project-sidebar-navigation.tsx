// Shares the professional project's navigation tree, disclosure, flyouts and management links across project modes.
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../shared/ui/collapsible';
import { SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu as TemplateSidebarMenu, SidebarMenuItem, SidebarMenuSub, SidebarMenuAction, SidebarMenuButton, useSidebar } from '../../../shared/ui/sidebar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator, DropdownMenuGroup } from '../../../shared/ui/dropdown-menu';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Clock3, Loader2, XCircle, CheckCircle2, CircleAlert, GitBranch, History, Settings2, Users, BookOpen } from 'lucide-react';
import type { ProjectRouteSection } from '../../../shared/lib/app-route-types';
import { cn } from '../../../shared/ui/utils';
import { floatingAlert } from '../../../shared/ui/floating-alert';
import type { SidebarNodeStatus } from '../lib/sidebar-menu-model';
import { mergeSidebarStatus } from '../lib/sidebar-menu-model';

export type ProjectSidebarNode = {
  key: string;
  label: string;
  icon?: ReactNode;
  children?: Node[];
  /** A grouping entry only controls disclosure; it never selects a page. */
  disclosureOnly?: boolean;
  selectable?: boolean;
  stale?: boolean;
  staleTooltip?: string;
  status?: SidebarNodeStatus;
  statusTooltip?: string;
  unavailableReason?: string;
  onSelect?: () => void;
};

type Node = ProjectSidebarNode;

// Collapsed phase groups show the same aggregate state as their generated children.
function withChildStatuses(node: Node): Node {
  if (!node.children?.length) return node;
  const children = node.children.map(withChildStatuses);
  return {
    ...node,
    children,
    status: children.reduce((status, child) => mergeSidebarStatus(status, child.status ?? null), node.status),
    stale: node.stale || children.some((child) => child.stale),
  };
}

// Active tasks and failures remain visible even when their previous artifact is stale.
function NodeStatusIndicator({ node }: { node: Node }) {
  const status = node.status === "running" || node.status === "queued" || node.status === "failed"
    ? node.status : node.stale ? "stale" : node.status;
  return status ? <GenerationStatusIndicator status={status} tooltip={status === "stale" ? node.staleTooltip : node.statusTooltip} /> : null;
}

// Collapsed navigation uses actual menu items, preserving arrow-key traversal at every depth.
function FlyoutItems({ node, onSelect }: { node: Node; onSelect?: () => void }) {
  const select = () => {
    if (node.selectable !== false && node.onSelect) { node.onSelect(); onSelect?.(); }
    else if (node.unavailableReason) floatingAlert.message(node.unavailableReason);
  };
  return <DropdownMenuGroup>
    {!node.disclosureOnly && <DropdownMenuItem aria-label={node.label} onClick={select} title={node.unavailableReason}>{node.icon}<span className="truncate">{node.label}</span><NodeStatusIndicator node={node} /></DropdownMenuItem>}
    {!node.disclosureOnly && !!node.children?.length && <DropdownMenuSeparator />}
    {node.children?.map(child => child.children?.length ? <DropdownMenuSub key={child.key}>
      <DropdownMenuSubTrigger aria-label={child.label}>{child.icon}<span className="truncate">{child.label}</span><NodeStatusIndicator node={child} /></DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[80vh] w-72 overflow-auto"><FlyoutItems node={child} onSelect={onSelect} /></DropdownMenuSubContent>
    </DropdownMenuSub> : <DropdownMenuItem key={child.key} aria-label={child.label} title={child.unavailableReason} onClick={() => {
      if (child.selectable !== false && child.onSelect) { child.onSelect(); onSelect?.(); }
      else if(child.unavailableReason) floatingAlert.message(child.unavailableReason);
    }}>{child.icon}<span className="truncate">{child.label}</span><NodeStatusIndicator node={child} /></DropdownMenuItem>)}
  </DropdownMenuGroup>;
}

function GenerationStatusIndicator({
  status,
  tooltip,
}: {
  status: NonNullable<Node["status"]> | "stale";
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
        : status === "stale" ? t("feasibility.status.stale") : t("workspace.sidebar.generated"));
  return (
    <span
      aria-label={label}
      title={label}
      data-sidebar-status={status}
      className="inline-flex size-5 shrink-0 items-center justify-center"
    >
      {status === "queued" ? (
        <Clock3 className="size-3.5 text-muted-foreground" />
      ) : status === "running" ? (
        <Loader2 className="size-3.5 animate-spin text-primary" />
      ) : status === "failed" ? (
        <XCircle className="size-3.5 text-destructive" />
      ) : status === "stale" ? (
        <CircleAlert className="size-3.5 text-warning" />
      ) : (
        <CheckCircle2 className="size-3.5 text-success" />
      )}
    </span>
  );
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
    if (node.disclosureOnly && hasChildren) {
      setNodeOpen(!open);
      return;
    }
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
        aria-current={selected ? "page" : undefined}
        aria-expanded={node.disclosureOnly && hasChildren ? open : undefined}
        aria-controls={node.disclosureOnly && hasChildren ? `sidebar-panel-${node.key}` : undefined}
        tooltip={node.label}
        onClick={handleSelect}
        aria-label={node.label}
        className="data-active:bg-primary/10!"
        title={node.unavailableReason ?? node.statusTooltip}
      >
        {node.icon}
        <span className="truncate">{node.label}</span>
        <NodeStatusIndicator node={node} />
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

export function ProjectSidebarNavigation({ tree, selectedKey, openKeys, setOpenKeys, onNavigateItemSelect, activeProjectSection, onOpenProjectSection, includeLineage = true, includeHistory = true }: {
  tree: Node[];
  selectedKey: string;
  openKeys: Set<string>;
  setOpenKeys: Dispatch<SetStateAction<Set<string>>>;
  onNavigateItemSelect?: () => void;
  activeProjectSection?: ProjectRouteSection | null;
  onOpenProjectSection?: (section: ProjectRouteSection) => void;
  includeLineage?: boolean;
  includeHistory?: boolean;
}) {
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();
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
            {tree.map(withChildStatuses).map(node => <TreeItem key={node.key} node={node} depth={0} selectedKey={selectedKey} openKeys={openKeys} setOpenKeys={setOpenKeys} onNavigateItemSelect={onNavigateItemSelect} />)}
          </TemplateSidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {onOpenProjectSection && <SidebarGroup>
        <SidebarGroupLabel>{t("projectShell.management")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <TemplateSidebarMenu>
            {projectItems.filter(item => (includeLineage || item.section !== "lineage") && (includeHistory || item.section !== "history")).map(item => <SidebarMenuItem key={item.section}>
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
