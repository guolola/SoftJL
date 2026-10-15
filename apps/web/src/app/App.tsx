// Composes application providers, route matching, workspace shell layout, and top-level page selection.
'use client';
import { PageContainer } from "../shared/template/layout/page";
import { DefaultPagesLayout } from '../shared/template/layout/default-pages-layout';
import { DefaultSidebar } from '../shared/template/layout/default-sidebar';
import { PlatformSidebar } from '../features/workspace-shell/components/platform-sidebar';
import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import { SidebarProvider, useSidebar } from '../shared/ui/sidebar';
import { TooltipProvider } from '../shared/ui/tooltip';
import Error404 from '../shared/template/views/pages/misc/error-page-404';
import { PageErrorBoundary } from '../shared/ui/page-error-boundary';
import { FeedbackDialogProvider } from "../shared/ui/feedback-dialog";
import { FloatingAlertProvider } from "../shared/ui/floating-alert";
import { ThemeProvider } from "./providers/theme-provider";
import { useTranslation } from "react-i18next";
import { AppI18nProvider, useAppI18n } from "./providers/i18n-provider";
import { DesignDiagramView, DiagramView, } from "../features/diagrams/components/diagram-detail-page";
import { DesignModelPage } from "../features/design/components/design-model-page";
import { InstructionDocumentsPage } from "../features/documents/components/instruction-documents-page";
import { RequirementsModelPage, SystemRequirementsPage } from "../features/requirements/components/text-requirement-page";
import { FeasibilityPage } from "../features/feasibility/components/feasibility-page";
import { TraceabilityMatrixPage } from "../features/traceability/components/traceability-matrix-page";
import { TestModelPage } from "../features/testing/components/test-model-page";
import { MarketingHomePage } from "../features/marketing-site/components/marketing-home-page";
import { applyRouteMetadata } from "../features/marketing-site/model/seo";
import { ProductDocsPage } from "../features/product-docs/components/product-docs-page";
import { SidebarMenu } from "../features/workspace-shell/components/sidebar-menu";
import { SidebarUserDropdown } from "../features/workspace-shell/components/sidebar-user-dropdown";
import { TopBar, type TopBarProps, } from "../features/workspace-shell/components/top-bar";
import { matchAppRoute, type AppRoute, type ProjectRouteSection } from "./app-routes";
import { LineageGraphPage } from "../features/lineage/components/lineage-graph-page";
import { WorkspaceRepositoryProvider } from "../services/workspace-repository";
import { WorkspaceShellProvider, useWorkspaceShell } from "../features/workspace-shell/state";
import { WorkspaceSessionProvider, useWorkspaceSession, } from "../features/workspace-session/state";
import { AuthenticatedRoute, AuthPage, InvitationAcceptPage, ProjectNewPage, ProjectWorkspaceDrawer, ProjectSectionPage, type ProjectDrawerKind, ProjectWorkspaceAccessBoundary, ProjectsIndexPage, useProjectOverview, } from "../features/user-platform/components/user-platform-pages";
import { ExamPage } from "../features/exam/components/exam-page";
import { DashboardPage } from "../features/dashboard/components/dashboard-page";
import { OnboardingTourProvider } from "../features/onboarding/components/onboarding-tour-provider";
import { clearLegacyRememberedLoginPassword } from "../features/user-platform/lib/remembered-login";
import { useProjectOnboarding } from "../features/onboarding/hooks/use-project-onboarding";
import { PROJECT_TASK_DRAWER_REQUEST_EVENT, PROJECT_WORKSPACE_TARGET_REQUEST_EVENT, type ProjectTaskDrawerRequest, type ProjectWorkspaceTarget, } from "../shared/lib/app-navigation";
function getProtectedRoutePath(route: AppRoute) {
    // Project sections share one authentication scope so menu changes keep the workspace mounted.
    if (route.kind === "project-workspace") {
        return `/projects/${encodeURIComponent(route.projectId)}`;
    }
    if (route.kind === "shell" ||
        route.kind === "dashboard" ||
        route.kind === "projects-index" ||
        route.kind === "projects-new" ||
        route.kind === "legacy-account") {
        return route.path;
    }
    return null;
}
function ProjectWorkspaceShell({ header, projectId, projectSection, activeProjectDrawer, onActiveProjectDrawerChange, onOpenProviderSettings, onOpenAccount, onNavigate, preferredTaskRunId, }: {
    header: React.ReactNode;
    projectId: string;
    projectSection: ProjectRouteSection | null;
    activeProjectDrawer: ProjectDrawerKind | null;
    onActiveProjectDrawerChange: (drawer: ProjectDrawerKind | null) => void;
    onOpenProviderSettings: () => void;
    onOpenAccount: () => void;
    onNavigate: (route: string) => void;
    preferredTaskRunId?: string | null;
}) {
    const { t } = useTranslation();
    const { openDesignHome, openFeasibilityHome, openRequirementsText, openSystemRequirements, selection, } = useWorkspaceShell();
    const { setOpenMobile } = useSidebar();
    const projectOverview = useProjectOverview(projectId);
    const { startProjectTour } = useProjectOnboarding(projectId);
    const projectRuns = projectOverview.runs;
    const projectPath = `/projects/${encodeURIComponent(projectId)}`;
    const traceabilityPrefix = t("traceability.title.scoped", { label: "" });
    const traceabilityScopeLabel = (label: string) => label.startsWith(traceabilityPrefix) ? label.slice(traceabilityPrefix.length) : label;
    const closeDrawer = () => {
        onActiveProjectDrawerChange(null);
    };
    // Section routes share the mounted workspace; model navigation only changes its active view.
    const returnToWorkspace = () => {
        setOpenMobile(false);
        if (projectSection)
            onNavigate(projectPath);
    };
    useEffect(() => {
        const openRequestedTarget = (event: Event) => {
            const target = (event as CustomEvent<ProjectWorkspaceTarget>).detail;
            if (target === "system-requirements")
                openSystemRequirements();
            if (target === "requirement-models")
                openRequirementsText();
            if (target === "design-models")
                openDesignHome();
            if (target === "feasibility")
                openFeasibilityHome();
            if (target === "provider-settings")
                onOpenProviderSettings();
            else if (projectSection)
                onNavigate(`/projects/${encodeURIComponent(projectId)}`);
        };
        window.addEventListener(PROJECT_WORKSPACE_TARGET_REQUEST_EVENT, openRequestedTarget);
        return () => {
            window.removeEventListener(PROJECT_WORKSPACE_TARGET_REQUEST_EVENT, openRequestedTarget);
        };
    }, [
        onOpenProviderSettings,
        openDesignHome,
        openFeasibilityHome,
        openRequirementsText,
        openSystemRequirements,
        projectId,
        projectSection,
        onNavigate,
    ]);
    let body: ReactNode;
    switch (selection.kind) {
        case "system-requirements":
            body = <SystemRequirementsPage />;
            break;
        case "requirements-text":
            body = <RequirementsModelPage />;
            break;
        case "feasibility-home":
            body = (<FeasibilityPage view="overview" initialSelectedArtifacts={selection.initialSelectedArtifacts}/>);
            break;
        case "feasibility-context":
            body = <FeasibilityPage view="context"/>;
            break;
        case "feasibility-business-flow":
            body = <FeasibilityPage view="business-flow"/>;
            break;
        case "feasibility-context-element":
            body = (<FeasibilityPage view="context" highlightedElement={{
                    kind: selection.elementKind,
                    id: selection.elementId,
                }}/>);
            break;
        case "feasibility-context-relationship":
            body = (<FeasibilityPage view="relations" highlightedRelationshipId={selection.relationshipId}/>);
            break;
        case "feasibility-context-trace":
            body = <FeasibilityPage view="trace"/>;
            break;
        case "feasibility-context-elements":
            body = <FeasibilityPage view="elements"/>;
            break;
        case "feasibility-context-relations":
            body = <FeasibilityPage view="relations"/>;
            break;
        case "feasibility-business-flow-element":
            body = (<FeasibilityPage view="business-flow" highlightedElement={{
                    kind: selection.elementKind,
                    id: selection.elementId,
                }}/>);
            break;
        case "feasibility-business-flow-relationship":
            body = (<FeasibilityPage view="business-flow-relations" highlightedRelationshipId={selection.relationshipId}/>);
            break;
        case "feasibility-business-flow-trace":
            body = <FeasibilityPage view="business-flow-trace"/>;
            break;
        case "feasibility-business-flow-elements":
            body = <FeasibilityPage view="business-flow-elements"/>;
            break;
        case "feasibility-business-flow-relations":
            body = <FeasibilityPage view="business-flow-relations"/>;
            break;
        case "feasibility-implementation":
            body = (<FeasibilityPage view="implementation" initialCandidateId={selection.candidateId}/>);
            break;
        case "requirement-trace-matrix":
            body = (<TraceabilityMatrixPage mode="requirements" scope={{
                    diagramKind: selection.diagram,
                    modelId: selection.modelId,
                    label: traceabilityScopeLabel(selection.label),
                }}/>);
            break;
        case "diagram-element":
            body = (<DiagramView type={selection.diagram} modelId={selection.modelId} highlightedElement={{
                    kind: selection.elementKind,
                    id: selection.elementId,
                }}/>);
            break;
        case "diagram-relationship":
            body = (<DiagramView type={selection.diagram} modelId={selection.modelId} initialSection="relations" highlightedRelationshipId={selection.relationshipId}/>);
            break;
        case "diagram":
            body = (<DiagramView type={selection.diagram} modelId={selection.modelId} highlightedElement={null}/>);
            break;
        case "design-home":
            body = <DesignModelPage />;
            break;
        case "design-trace-matrix":
            body = (<TraceabilityMatrixPage mode="design" scope={{
                    diagramKind: selection.diagram,
                    modelId: selection.modelId,
                    label: traceabilityScopeLabel(selection.label),
                }}/>);
            break;
        case "test-home":
            body = <TestModelPage />;
            break;
        case "design-diagram":
            body = (<DesignDiagramView type={selection.diagram} modelId={selection.modelId} highlightedElement={null}/>);
            break;
        case "design-diagram-element":
            body = (<DesignDiagramView type={selection.diagram} modelId={selection.modelId} highlightedElement={{
                    kind: selection.elementKind,
                    id: selection.elementId,
                }}/>);
            break;
        case "design-diagram-relationship":
            body = (<DesignDiagramView type={selection.diagram} modelId={selection.modelId} initialSection="relations" highlightedRelationshipId={selection.relationshipId}/>);
            break;
        case "documents-home":
            body = <InstructionDocumentsPage />;
            break;
        case "document-editor":
            body = <InstructionDocumentsPage activeDocumentId={selection.documentId}/>;
            break;
    }
    if (projectSection === "lineage") {
        body = <LineageGraphPage projectId={projectId} projectRuns={projectRuns} members={projectOverview.members} documents={projectOverview.documents} onViewArtifact={returnToWorkspace}/>;
    }
    else if (projectSection) {
        body = <ProjectSectionPage projectId={projectId} section={projectSection} onNavigate={onNavigate}/>;
    }
    return (<DefaultPagesLayout sidebar={<DefaultSidebar resizeLabel={t("workspace.sidebar.resize")} footer={<>
          
          <SidebarUserDropdown onOpenAccount={onOpenAccount} onNavigate={onNavigate}/>
        </>}>
        <SidebarMenu projectRuns={projectRuns} activeProjectSection={projectSection} onOpenProjectSection={section => onNavigate(`${projectPath}/${section}`)} onNavigateItemSelect={returnToWorkspace}/>
      </DefaultSidebar>} header={React.isValidElement(header)
            ? React.cloneElement(header as React.ReactElement<TopBarProps>, {
                projectDrawer: {
                    projectId,
                    onOpenDrawer: onActiveProjectDrawerChange,
                    projectRuns,
                    projectName: projectOverview.project?.name ?? projectId,
                    onStartTour: () => { void startProjectTour(); },
                },
            })
            : header} contentClassName="min-w-0 p-0">
        <div className="relative flex min-h-full flex-col bg-background">
          <div className="relative min-h-0 flex-1">
            <div id="workspace-active-panel" role="tabpanel" className="min-h-0 overflow-x-clip">
              {body}
            </div>
            <ProjectWorkspaceDrawer projectId={projectId} activeDrawer={activeProjectDrawer} onNavigate={onNavigate} onClose={closeDrawer} preferredTaskRunId={preferredTaskRunId}/>
          </div>
        </div>
    </DefaultPagesLayout>);
}
export function Shell({ initialPath }: {
    initialPath?: string;
}) {
    useEffect(() => {
        // Remove legacy plaintext passwords even when users land on an authenticated page.
        clearLegacyRememberedLoginPassword();
    }, []);
    const { locale } = useAppI18n();
    const [activeProjectDrawer, setActiveProjectDrawer] = useState<ProjectDrawerKind | null>(null);
    const [preferredTaskRunId, setPreferredTaskRunId] = useState<string | null>(null);
    const { generationTasks, selectGenerationTask } = useWorkspaceSession();
    const [accountDialogOpen, setAccountDialogOpen] = useState(false);
    const [globalSettingsRequestId, setGlobalSettingsRequestId] = useState(0);
    const openProviderSettings = useCallback(() => {
        setGlobalSettingsRequestId((current) => current + 1);
        setAccountDialogOpen(true);
    }, []);
    const [loginLoadingRoute, setLoginLoadingRoute] = useState<string | null>(null);
    const [route, setRoute] = useState<AppRoute>(() => {
        const pathname = initialPath ?? (typeof window === "undefined" ? "/" : window.location.pathname);
        return matchAppRoute(pathname);
    });
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        if (new URLSearchParams(window.location.search).get("account") === "profile") {
            setAccountDialogOpen(true);
        }
    }, [route]);
    useEffect(() => {
        document.documentElement.dataset.template = route.kind === 'marketing-home' ? 'flow' : 'admincn';
        // Keep head metadata aligned with client-side History API navigation.
        applyRouteMetadata(route, undefined, locale);
    }, [locale, route]);
    useEffect(() => {
        const handlePopState = () => {
            setActiveProjectDrawer(null);
            setLoginLoadingRoute(null);
            setRoute(matchAppRoute(window.location.pathname));
        };
        window.addEventListener("popstate", handlePopState);
        return () => {
            window.removeEventListener("popstate", handlePopState);
        };
    }, []);
    useEffect(() => {
        const openRequestedTask = (event: Event) => {
            const detail = (event as CustomEvent<ProjectTaskDrawerRequest>).detail ?? {};
            const localTask = detail.clientTaskId
                ? generationTasks.find((task) => task.clientTaskId === detail.clientTaskId)
                : detail.runId
                    ? generationTasks.find((task) => task.runId === detail.runId)
                    : null;
            if (localTask)
                selectGenerationTask(localTask.clientTaskId);
            setPreferredTaskRunId(localTask ? null : (detail.runId ?? null));
            setActiveProjectDrawer("tasks");
        };
        window.addEventListener(PROJECT_TASK_DRAWER_REQUEST_EVENT, openRequestedTask);
        return () => {
            window.removeEventListener(PROJECT_TASK_DRAWER_REQUEST_EVENT, openRequestedTask);
        };
    }, [generationTasks, selectGenerationTask]);
    const navigate = useCallback((nextPath: string, options?: {
        fromLogin?: boolean;
    }) => {
        const nextUrl = new URL(options?.fromLogin && nextPath === "/workspace" ? "/projects" : nextPath, window.location.origin);
        const nextRoute = matchAppRoute(nextUrl.pathname);
        setLoginLoadingRoute(options?.fromLogin && (nextRoute.kind === "dashboard" || nextRoute.kind === "projects-index")
            ? nextRoute.path
            : null);
        const nextLocation = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
        setActiveProjectDrawer(null);
        if (`${window.location.pathname}${window.location.search}` !== nextLocation) {
            window.history.pushState({}, "", nextLocation);
            window.dispatchEvent(new CustomEvent("uml-route-change", {
                detail: { path: nextUrl.pathname, location: nextLocation },
            }));
        }
        setRoute(nextRoute);
    }, []);
    const renderRoute = () => {
        if (route.kind === "marketing-home") {
            return <MarketingHomePage path={route.path} onNavigate={navigate}/>;
        }
        if (route.kind === "product-docs") {
            return <ProductDocsPage onNavigate={navigate}/>;
        }
        if (route.kind === "shell") {
            if (route.path === "/workspace") {
                return <RedirectRoute to="/projects" onNavigate={navigate}/>;
            }
            return <ExamPage />;
        }
        if (route.kind === "auth") {
            return <AuthPage key={route.path} path={route.path} onNavigate={navigate}/>;
        }
        if (route.kind === "invitation-accept") {
            return <InvitationAcceptPage onNavigate={navigate}/>;
        }
        if (route.kind === "dashboard") {
            return <DashboardPage onNavigate={navigate}/>;
        }
        if (route.kind === "projects-index") {
            return <ProjectsIndexPage onNavigate={navigate}/>;
        }
        if (route.kind === "projects-new") {
            return <ProjectNewPage onNavigate={navigate}/>;
        }
        if (route.kind === "legacy-account") {
            return <RedirectRoute to="/projects" onNavigate={navigate}/>;
        }
        if (route.kind === "legacy-redirect") {
            return <RedirectRoute to={route.to} onNavigate={navigate}/>;
        }
        if (route.kind === "project-workspace") {
            return (<ProjectWorkspaceAccessBoundary projectId={route.projectId} onNavigate={navigate}>
          <WorkspaceShellProvider key={route.projectId}>
            <ProjectWorkspaceShell header={<TopBar currentRoute={route.path} onNavigate={navigate} accountDialogOpen={accountDialogOpen} onAccountDialogOpenChange={setAccountDialogOpen} globalSettingsRequestId={globalSettingsRequestId}/>} projectId={route.projectId} projectSection={route.section ?? null} activeProjectDrawer={activeProjectDrawer} onActiveProjectDrawerChange={setActiveProjectDrawer} onOpenProviderSettings={openProviderSettings} onOpenAccount={() => setAccountDialogOpen(true)} onNavigate={navigate} preferredTaskRunId={preferredTaskRunId}/>
          </WorkspaceShellProvider>
        </ProjectWorkspaceAccessBoundary>);
        }
        return <Error404 />;
    };
    const protectedRoutePath = getProtectedRoutePath(route);
    const routeContent = renderRoute();
    const showWorkspaceTopBar = route.kind !== "project-workspace" &&
        route.kind !== "marketing-home" &&
        route.kind !== "product-docs" &&
        route.kind !== "auth" &&
        route.kind !== "invitation-accept" &&
        route.kind !== "legacy-redirect" &&
        route.kind !== "not-found";
    const renderPlatformLayout = (content: ReactNode) => (<DefaultPagesLayout sidebar={<PlatformSidebar path={route.path} onOpenAccount={() => setAccountDialogOpen(true)} onNavigate={navigate}/>} header={<TopBar currentRoute={route.path} onNavigate={navigate} accountDialogOpen={accountDialogOpen} onAccountDialogOpenChange={setAccountDialogOpen} globalSettingsRequestId={globalSettingsRequestId}/>} contentClassName={route.kind === "dashboard" ? "min-w-0 p-0 sm:p-0" : "min-w-0 p-0"}>
        {content}
    </DefaultPagesLayout>);
    const shellContent = (<FloatingAlertProvider>
    <SidebarProvider resizable={route.kind === 'project-workspace'} className={route.kind === 'marketing-home' || route.kind === 'not-found' ? 'block min-h-screen w-full' : 'flex min-h-svh w-full flex-col bg-background text-foreground'}>
      <PageErrorBoundary resetKey={route.path}>
      {protectedRoutePath ? (<AuthenticatedRoute routeKey={protectedRoutePath} onNavigate={navigate} showLoadingScreen={route.kind === "project-workspace" || loginLoadingRoute === route.path} renderLayout={showWorkspaceTopBar ? renderPlatformLayout : undefined}>
          {routeContent}
        </AuthenticatedRoute>) : (showWorkspaceTopBar ? renderPlatformLayout(routeContent) : routeContent)}
      </PageErrorBoundary>
    </SidebarProvider>
    </FloatingAlertProvider>);
    // All protected pages share a stable provider tree; public pages keep their standalone layout.
    return protectedRoutePath
        ? <OnboardingTourProvider>{shellContent}</OnboardingTourProvider>
        : shellContent;
}
function RedirectRoute({ to, onNavigate, }: {
    to: string;
    onNavigate: (route: string) => void;
}) {
    useEffect(() => {
        onNavigate(to);
    }, [onNavigate, to]);
    return (<main className="flex min-h-0 flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
      <RedirectMessage />
    </main>);
}
function RedirectMessage() {
    const { t } = useTranslation();
    return <>{t("common.loading")}</>;
}
export default function App({ initialPath }: {
    initialPath?: string;
}) {
    return (<AppI18nProvider>
      <ThemeProvider>
        <TooltipProvider>
          <FeedbackDialogProvider>
            <WorkspaceRepositoryProvider>
              <WorkspaceSessionProvider>
                <Shell initialPath={initialPath}/>
              </WorkspaceSessionProvider>
            </WorkspaceRepositoryProvider>
          </FeedbackDialogProvider>
        </TooltipProvider>
      </ThemeProvider>
    </AppI18nProvider>);
}
