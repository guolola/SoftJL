// Supplies ordinary project menu data to the same navigation renderer used by professional projects.
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ClipboardCheck, FileText, MessageSquare, Shapes, ListTree, UsersRound, Workflow, Blocks, Diamond, SquareCode, ListOrdered, TableProperties } from "lucide-react";
import { standardDiagramKinds, type StandardDiagram, type StandardDiagramKind, type StandardProjectState } from "@uml-platform/contracts";
import type { ProjectRouteSection } from "../../../shared/lib/app-route-types";
import { useSidebar } from "../../../shared/ui/sidebar";
import { ProjectSidebarNavigation, type ProjectSidebarNode } from "../../workspace-shell/components/project-sidebar-navigation";
import { mergeSidebarStatus } from "../../workspace-shell/lib/sidebar-menu-model";
import { diagramNavigationLabel } from "../lib/diagram-navigation-label";

const diagramIcons = { function: ListTree, usecase: UsersRound, activity: Workflow, architecture: Blocks, er: Diamond, class: SquareCode, sequence: ListOrdered, table: TableProperties } satisfies Record<StandardDiagramKind, typeof ListTree>;
const scopedKinds = new Set<StandardDiagramKind>(["activity", "sequence"]);

export function StandardSidebar({ projectId, diagrams, state, view, selectedId, section, onSelect, onDiagram, onNavigate }: {
  projectId: string; diagrams: StandardDiagram[]; view: string; selectedId: string | null; section?: ProjectRouteSection | null;
  state?: Pick<StandardProjectState, "tests" | "documents" | "run"> | null;
  onSelect: (view: "home" | "tests" | "documents") => void;
  onDiagram: (diagram: StandardDiagram) => void; onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const { setOpenMobile } = useSidebar();
  const categories = standardDiagramKinds.flatMap(kind => {
    const items = diagrams.filter(diagram => diagram.kind === kind);
    if (!items.length) return [];
    const Icon = diagramIcons[kind];
    const label = t(`standardProject.diagramKinds.${kind}`);
    const diagramNode = (diagram: StandardDiagram): ProjectSidebarNode => ({
      key: `diagram:${diagram.id}`, label: diagramNavigationLabel(diagram), icon: <Icon className="size-4 text-muted-foreground" />,
      status: diagram.status === "pending" ? "queued" : diagram.status,
      onSelect: () => onDiagram(diagram),
    });
    if (kind === "usecase") {
      const overall = items.find(diagram => diagram.id === "usecase");
      return overall ? [{ ...diagramNode(overall), label }] : [];
    }
    // Business views keep their category even while only the first diagram has arrived.
    if (items.length === 1 && !scopedKinds.has(kind)) return [{ ...diagramNode(items[0]), label }];
    const children = items.map(diagramNode);
    return [{ key: `category:${kind}`, label, icon: <Icon className="size-4 text-muted-foreground" />,
      status: children.reduce((status, node) => mergeSidebarStatus(status, node.status), undefined as ProjectSidebarNode["status"]),
      disclosureOnly: true, children }];
  });
  const resultStatus = (operations: string[], hasResult: boolean): ProjectSidebarNode["status"] => {
    const operation = state?.run?.resumeOperation ?? state?.run?.operation;
    if (operation && operations.includes(operation) && (state?.run?.status === "running" || state?.run?.status === "failed")) return state.run.status;
    return hasResult ? "completed" : undefined;
  };
  const tree: ProjectSidebarNode[] = [
    { key: "home", label: t("standardProject.agentChat"), icon: <MessageSquare className="size-4 text-muted-foreground" />,
      onSelect: () => onSelect("home") },
    { key: "models", label: t("standardProject.uml"), icon: <Shapes className="size-4 text-muted-foreground" />,
      disclosureOnly: categories.length > 0, children: categories, selectable: categories.length > 0,
      unavailableReason: categories.length ? undefined : t("standardProject.noDiagrams") },
    { key: "tests", label: t("workspace.tabs.labels.tests"), status: resultStatus(["tests"], Boolean(state?.tests?.length)), icon: <ClipboardCheck className="size-4 text-muted-foreground" />, onSelect: () => onSelect("tests") },
    { key: "documents", label: t("workspace.tabs.labels.documents"), status: resultStatus(["requirementsSpec", "softwareDesignSpec"], Boolean(state?.documents?.requirementsSpec || state?.documents?.softwareDesignSpec)), icon: <FileText className="size-4 text-muted-foreground" />, onSelect: () => onSelect("documents") },
  ];
  const selectedKey = section ? "" : selectedId ? `diagram:${selectedId}` : view;
  return <ProjectSidebarNavigation tree={tree} selectedKey={selectedKey} openKeys={openKeys} setOpenKeys={setOpenKeys}
    activeProjectSection={section} includeLineage={false} includeHistory={false} onNavigateItemSelect={() => setOpenMobile(false)}
    onOpenProjectSection={next => onNavigate(`/projects/${encodeURIComponent(projectId)}/${next}`)} />;
}
