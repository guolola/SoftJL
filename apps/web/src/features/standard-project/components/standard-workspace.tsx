// Composes saved project diagrams, tests and documents inside the platform shell.
import { useTranslation } from "react-i18next";
import { useState, type ReactNode } from "react";
import { DefaultPagesLayout } from "../../../shared/template/layout/default-pages-layout";
import { ProjectSidebar } from "../../workspace-shell/components/project-sidebar";
import { useSidebar } from "../../../shared/ui/sidebar";
import type { ProjectRouteSection } from "../../../shared/lib/app-route-types";
import { StandardSidebar } from "./standard-sidebar";
import { Button } from "../../../shared/ui/button";
import { useStandardProject } from "../hooks/use-standard-project";
import { StandardTestsPage } from "./standard-tests-page";
import { StandardDocumentsPage } from "./standard-documents-page";
import { StandardDiagramDetailPage } from "./standard-diagram-detail-page";
import { ConnectionState } from "./elements/connection-state";
import { ProjectConversation } from "./project-conversation";
import { useAuthenticatedRouteSession } from "../../user-platform/components/authenticated-route-session";

type View = "home" | "tests" | "documents";

export function StandardWorkspace({ projectId, projectName: _projectName, canEdit, header, onNavigate, onSettings: _onSettings, onOpenAccount, sectionContent, projectSection }: {
  projectId: string; projectName: string; canEdit: boolean; header: ReactNode;
  onNavigate: (path: string) => void; onSettings: () => void; onOpenAccount: () => void;
  sectionContent?: ReactNode; projectSection?: ProjectRouteSection | null;
}) {
  const { t } = useTranslation();
  const account = useAuthenticatedRouteSession();
  const session = useStandardProject(projectId, canEdit);
  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { setOpenMobile } = useSidebar();
  const { state, pending, running } = session;
  const disconnected = session.connection === "dropped" || session.connection === "reconnecting";
  const disabled = !canEdit || pending || running || disconnected;
  const diagrams = Object.values(state?.diagrams ?? {});
  const showConversation = !sectionContent && !selectedId && view === "home";
  const selectView = (next: View) => { setView(next); setSelectedId(null); setOpenMobile(false); if (sectionContent) onNavigate(`/projects/${encodeURIComponent(projectId)}`); };
  const selected = selectedId ? state?.diagrams[selectedId] : undefined;
  return <DefaultPagesLayout header={header} className="h-svh overflow-hidden" contentClassName="flex min-h-0 flex-col overflow-y-auto p-0 sm:p-0" sidebar={
    <ProjectSidebar onOpenAccount={onOpenAccount} onNavigate={onNavigate}>
      <StandardSidebar projectId={projectId} diagrams={diagrams} state={state} view={view} selectedId={selectedId} section={projectSection} onSelect={selectView}
        onDiagram={diagram => { setView("home"); setSelectedId(diagram.id); setOpenMobile(false); if (sectionContent) onNavigate(`/projects/${encodeURIComponent(projectId)}`); }} onNavigate={onNavigate} />
    </ProjectSidebar>
  }>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      {!state ? <div className="p-8" role="status">{session.error || t("standardProject.loading")}<ConnectionState phase={session.connection} onRetry={() => void session.reconnect()} /><Button variant="link" onClick={() => void session.refresh()}>{t("standardProject.reload")}</Button></div> : <>
        {!showConversation && <>
          {!canEdit && <p className="px-6 py-3 text-sm text-muted-foreground">{t("standardProject.readOnly")}</p>}
          <ConnectionState phase={session.connection} onRetry={() => void session.reconnect()} className="m-3" />
        </>}
        {sectionContent ?? (selected ? <StandardDiagramDetailPage key={`${projectId}:${selected.id}`} diagram={selected} disabled={disabled} canEdit={canEdit} onSave={model => session.saveModel(selected.id, model)} />
        : view === "home" ? <ProjectConversation key={projectId} projectId={projectId} state={state} disabled={disabled} canCancel={canEdit && !pending && !disconnected}
          displayName={account?.user.displayName} onSend={session.start} onCancel={session.cancel} onFeedback={session.feedback} />
        : view === "tests" ? <StandardTestsPage state={state} disabled={disabled} onGenerate={() => void session.start({ operation: "tests" })} />
        : <StandardDocumentsPage projectId={projectId} state={state} disabled={disabled} refresh={async () => { await session.refresh(); }} />)}
      </>}
    </div>
  </DefaultPagesLayout>;
}
