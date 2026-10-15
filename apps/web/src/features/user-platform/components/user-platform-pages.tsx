// Hosts authenticated project, account, and provider pages backed by the platform API.
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "../../../shared/ui/drawer";
import { Avatar, AvatarFallback } from "../../../shared/ui/avatar";
import { useIsMobile } from "../../../shared/hooks/use-mobile";
import Forbidden403 from '../../../shared/template/views/pages/misc/forbidden-403';
import ServerError500 from '../../../shared/template/views/pages/misc/server-error-500';
import NotFound404 from '../../../shared/template/views/pages/misc/error-page-404';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TFunction } from "i18next";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import {
  Activity,
  BookOpen,
  Clock3,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { PageHeader } from "../../../shared/template/layout/page";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/dropdown-menu";
import { cn } from "../../../shared/ui/utils";
import {
  ProjectGenerationTasksDrawerContent,
  ProjectWorkspaceActions,
} from "../../workspace-shell/components/top-bar";
import {
  AUTH_SESSION_CHANGED_EVENT,
  PlatformApiError,
  platformApi,
  type PlatformDocument,
  type PlatformProject,
  type PlatformProjectMember,
  type PlatformRunSummary,
  type PlatformAccountProfileResponse,
} from "../services/platform-api";
import {
  PlatformLoadingCoordinatorProvider,
  PlatformLoadingScreen,
  usePlatformLoadingCoordinatorState,
  usePlatformRouteLoading,
  useLoadingTransition,
} from "./platform-loading-screen";
import { AuthenticatedRouteSessionProvider } from "./authenticated-route-session";
import { ManagedProviderSettingsSync } from "./managed-provider-settings-sync";
import { ProjectDocuments } from "./project-documents";
import { ProjectHistory } from "./project-history";
import { ProjectMembers } from "./project-members";
import { PageFrame, SectionCard } from "./project-page-layout";
import { ProjectSettings } from "./project-settings";
import { buildLoginRedirectPath } from "../lib/auth-page-routing";
export { AuthPage } from "./auth-page";
export { AccountPage, AccountSecurityPage } from "./account-pages";
export { InvitationAcceptPage } from "./invitation-accept-page";
export { ProjectNewPage } from "./project-new-page";
export { ProjectsIndexPage } from "./projects-index-page";

type Navigate = (path: string) => void;

const ACTIVE_RUNS_REFRESH_MS = 8_000;

export type ProjectDrawerKind = "tasks" | "members" | "history" | "documents" | "settings";

type ProjectOverviewState = {
  loading: boolean;
  error: string;
  authRequired: boolean;
  forbidden: boolean;
  notFound: boolean;
  project: PlatformProject | null;
  membership: PlatformProjectMember | null;
  members: PlatformProjectMember[];
  runs: PlatformRunSummary[];
  documents: PlatformDocument[];
};

const emptyProjectOverview: ProjectOverviewState = {
  loading: true,
  error: "",
  authRequired: false,
  forbidden: false,
  notFound: false,
  project: null,
  membership: null,
  members: [],
  runs: [],
  documents: [],
};

const ProjectOverviewContext =
  createContext<{ projectId: string; overview: ProjectOverviewState } | null>(null);

export function useCurrentProjectOverview() {
  return useContext(ProjectOverviewContext);
}

export function useProjectOverview(projectId: string) {
  const { t } = useTranslation();
  const providedOverview = useContext(ProjectOverviewContext);
  const contextOverview =
    providedOverview?.projectId === projectId ? providedOverview.overview : null;
  const [state, setState] = useState<ProjectOverviewState>(emptyProjectOverview);

  useEffect(() => {
    if (contextOverview) return;
    let active = true;
    setState({ ...emptyProjectOverview, loading: true });
    Promise.all([
      platformApi.getProject(projectId),
      platformApi.listProjectMembers(projectId),
      platformApi.listProjectRuns(projectId),
      platformApi.listProjectDocuments(projectId),
    ])
      .then(([projectResponse, memberResponse, runResponse, documentResponse]) => {
        if (!active) return;
        setState({
          loading: false,
          error: "",
          authRequired: false,
          forbidden: false,
          notFound: false,
          project: projectResponse.project,
          membership: projectResponse.membership ?? null,
          members: memberResponse.members,
          runs: runResponse.runs,
          documents: documentResponse.documents,
        });
      })
      .catch((error) => {
        if (!active) return;
        const status = error instanceof PlatformApiError ? error.status : 0;
        setState({
          ...emptyProjectOverview,
          loading: false,
          authRequired: status === 401,
          forbidden: status === 403,
          notFound: status === 404,
          error: localizeCaughtFailure(error, t("projectShell.access.loadFailedFallback")),
        });
      });
    return () => {
      active = false;
    };
  }, [contextOverview, projectId, t]);

  const hasActiveRuns = state.runs.some(
    (run) => run.status === "queued" || run.status === "running",
  );

  useEffect(() => {
    if (contextOverview || state.loading || !hasActiveRuns) return;
    let active = true;
    const refreshRuns = () => {
      platformApi
        .listProjectRuns(projectId)
        .then((response) => {
          if (!active) return;
          setState((current) => ({
            ...current,
            runs: response.runs,
          }));
        })
        .catch(() => {
          // Project overview remains usable when background run polling misses a beat.
        });
    };
    const intervalId = window.setInterval(refreshRuns, ACTIVE_RUNS_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [contextOverview, hasActiveRuns, projectId, state.loading]);

  useEffect(() => {
    if (contextOverview) return;
    let active = true;
    const refreshCompletedRuns = () => {
      void platformApi.listProjectRuns(projectId).then((response) => {
        if (!active) return;
        setState((current) => ({ ...current, runs: response.runs }));
      }).catch(() => {
        // Completion refresh is best-effort; the manual history refresh remains available.
      });
    };
    window.addEventListener("uml-generation-completed", refreshCompletedRuns);
    return () => {
      active = false;
      window.removeEventListener("uml-generation-completed", refreshCompletedRuns);
    };
  }, [contextOverview, projectId]);

  return contextOverview ?? state;
}

function renderAccessMessage(
  overview: ProjectOverviewState,
  t: TFunction,
  onNavigate?: Navigate,
) {
  if (overview.authRequired) {
    return (
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base">{t("projectShell.access.loginTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("projectShell.access.loginDescription")}
            </p>
          </div>
          {onNavigate && (
            <Button type="button" onClick={() => onNavigate("/login")}>
              {t("projectShell.access.loginAction")}
            </Button>
          )}
        </div>
      </SectionCard>
    );
  }
  if (overview.forbidden) return <Forbidden403 />;
  if (overview.notFound) return <NotFound404 />;
  if (overview.error) return <ServerError500 />;
  return null;
}

function ProjectWorkspaceLoadingLayout() {
  return (
    <div
      data-testid="project-workspace-loading-layout"
      className="pointer-events-none grid min-h-0 min-w-0 flex-1 grid-cols-[10%_1px_minmax(0,1fr)] overflow-hidden bg-background"
      aria-hidden="true"
    >
      <aside className="h-full min-w-20 border-r border-sidebar-border bg-sidebar" />
      <div className="h-full bg-border/70" />
      <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
        <div className="h-[53px] shrink-0 border-b border-border bg-card" />
        <div className="h-12 shrink-0 border-b border-border bg-background" />
        <div className="min-h-0 flex-1 bg-background" />
      </main>
    </div>
  );
}

export function AuthenticatedRoute({
  children,
  onNavigate,
  routeKey,
  showLoadingScreen = false,
  renderLayout,
}: {
  children: React.ReactNode;
  onNavigate: Navigate;
  routeKey?: string;
  showLoadingScreen?: boolean;
  renderLayout?: (content: React.ReactNode) => React.ReactNode;
}) {
  return (
    <PlatformLoadingCoordinatorProvider>
      <AuthenticatedRouteContent
        onNavigate={onNavigate}
        routeKey={routeKey}
        showLoadingScreen={showLoadingScreen}
        renderLayout={renderLayout}
      >
        {children}
      </AuthenticatedRouteContent>
    </PlatformLoadingCoordinatorProvider>
  );
}

function AuthenticatedRouteContent({
  children,
  onNavigate,
  routeKey,
  showLoadingScreen,
  renderLayout,
}: {
  children: React.ReactNode;
  onNavigate: Navigate;
  routeKey?: string;
  showLoadingScreen: boolean;
  renderLayout?: (content: React.ReactNode) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [verifiedRouteKey, setVerifiedRouteKey] = useState<string | undefined>(undefined);
  const [authSession, setAuthSession] = useState<PlatformAccountProfileResponse | null>(null);
  const childLoading = usePlatformLoadingCoordinatorState();
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const hasVerifiedSessionRef = useRef(false);
  const hasVerifiedSession = Boolean(authSession) && verifiedRouteKey === routeKey;
  const effectiveChecking = checking || !hasVerifiedSession;
  const overlayActive = showLoadingScreen && (effectiveChecking || childLoading.active);
  const overlayMessage = childLoading.message ?? t("projectShell.checkingSession");
  const loadingTransition = useLoadingTransition(overlayActive);

  const verifySession = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setChecking(true);
    platformApi
      .me()
      .then((response) => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setAuthSession(response);
        hasVerifiedSessionRef.current = true;
        setVerifiedRouteKey(routeKey);
        setChecking(false);
      })
      .catch((error) => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        const redirect = typeof window === "undefined"
          ? routeKey ?? "/dashboard"
          : `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const reason = hasVerifiedSessionRef.current
          ? "session-expired"
          : error instanceof PlatformApiError && (error.status === 401 || error.status === 403)
            ? "login-required"
            : "session-check-failed";
        setAuthSession(null);
        setVerifiedRouteKey(undefined);
        setChecking(false);
        onNavigate(buildLoginRedirectPath(redirect, reason));
      });
  }, [onNavigate, routeKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    // Route content stays unmounted until the server has validated the cookie-backed session for this exact route.
    verifySession();
  }, [verifySession]);

  useEffect(() => {
    const handleSessionChanged = () => verifySession();
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged);
    };
  }, [verifySession]);

  if (effectiveChecking && (!authSession || !renderLayout)) {
    if (!showLoadingScreen) {
      return <div data-testid="auth-check-placeholder" className="min-h-0 flex-1" aria-busy="true" />;
    }
    return (
      <PlatformLoadingScreen
        message={overlayMessage}
        variant="fullscreen"
        phase={loadingTransition.phase === "hidden" ? "loading" : loadingTransition.phase}
        progress={loadingTransition.progress}
      />
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <AuthenticatedRouteSessionProvider value={authSession}>
        <ManagedProviderSettingsSync session={authSession} />
        {/* Keep verified navigation mounted while blocking target content until its session check completes. */}
        {renderLayout
          ? renderLayout(effectiveChecking
              ? <div data-testid="auth-check-placeholder" className="min-h-0 flex-1" aria-busy="true" />
              : children)
          : children}
      </AuthenticatedRouteSessionProvider>
      {showLoadingScreen && loadingTransition.visible && loadingTransition.phase !== "hidden" && (
        <PlatformLoadingScreen
          message={overlayMessage}
          variant="fullscreen"
          phase={loadingTransition.phase}
          progress={loadingTransition.progress}
          className={cn(
            "absolute inset-0 z-50",
            !overlayActive && "pointer-events-none",
          )}
        />
      )}
    </div>
  );
}

export function ProjectSectionPage({
  projectId,
  section,
  onNavigate,
}: {
  projectId: string;
  section: "settings" | "members" | "history" | "documents";
  onNavigate: Navigate;
}) {
  const { t } = useTranslation();
  const overview = useProjectOverview(projectId);
  const sectionTitle = {
    settings: t("projectShell.sections.settings"),
    members: t("projectShell.sections.members"),
    history: t("projectShell.sections.history"),
    documents: t("projectShell.sections.documents"),
  }[section];
  const projectName =
    overview.project?.name ??
    (overview.loading ? t("projectShell.loadingProject") : t("projectShell.projectFallback", { projectId }));
  const accessMessage = renderAccessMessage(overview, t, onNavigate);

  return (
    <PageFrame onNavigate={onNavigate}>
      <section aria-label={sectionTitle} className="flex min-w-0 flex-col gap-6">
        {section !== "settings" && section !== "documents" && <PageHeader
          title={sectionTitle}
          description={t(`projectShell.sectionDescriptions.${section}`, { project: projectName })}
          actions={<Button type="button" variant="outline" onClick={() => onNavigate(`/projects/${encodeURIComponent(projectId)}`)}>
            {t("projectShell.backToWorkspace")}
          </Button>}
        />}
        {overview.loading && (
          <SectionCard>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("projectShell.loadingProjectData")}
            </div>
          </SectionCard>
        )}
        {!overview.loading && accessMessage}
        {!overview.loading && !accessMessage && overview.project && section === "settings" && (
          <ProjectSettings
            project={overview.project}
            membershipRole={overview.membership?.role ?? null}
            pageTitle={sectionTitle}
            onProjectDeleted={() => onNavigate("/projects")}
          />
        )}
        {!overview.loading && !accessMessage && overview.project && section === "members" && (
          <ProjectMembers project={overview.project} members={overview.members} membershipRole={overview.membership?.role ?? null} />
        )}
        {!overview.loading && !accessMessage && overview.project && section === "history" && (
          <ProjectHistory projectId={projectId} initialRuns={overview.runs} members={overview.members} />
        )}
        {!overview.loading && !accessMessage && overview.project && section === "documents" && (
          <ProjectDocuments projectId={projectId} documents={overview.documents} pageTitle={sectionTitle} />
        )}
      </section>
    </PageFrame>
  );
}

const projectDrawerMeta: Record<
  ProjectDrawerKind,
  {
    titleKey: string;
    descriptionKey: string;
    icon: typeof Users;
    width: "compact" | "history" | "wide";
  }
> = {
  tasks: {
    titleKey: "projectShell.drawer.tasks",
    descriptionKey: "projectShell.drawer.tasksDescription",
    icon: Activity,
    width: "wide",
  },
  members: {
    titleKey: "projectShell.drawer.members",
    descriptionKey: "projectShell.drawer.membersDescription",
    icon: Users,
    width: "compact",
  },
  history: {
    titleKey: "projectShell.drawer.history",
    descriptionKey: "projectShell.drawer.historyDescription",
    icon: Clock3,
    width: "history",
  },
  documents: {
    titleKey: "projectShell.drawer.documents",
    descriptionKey: "projectShell.drawer.documentsDescription",
    icon: BookOpen,
    width: "compact",
  },
  settings: {
    titleKey: "projectShell.drawer.settings",
    descriptionKey: "projectShell.drawer.settingsDescription",
    icon: Settings,
    width: "wide",
  },
};

function DesktopDrawerOverlay({ onClose }: { onClose: () => void }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-slot="drawer-overlay"
      aria-hidden="true"
      className="fixed inset-0 z-[60] bg-black/45"
      onPointerDown={onClose}
    />,
    document.body,
  );
}

function ProjectDrawerShell({
  open,
  kind,
  projectName,
  accessLabel,
  onClose,
  children,
}: {
  open: boolean;
  kind: ProjectDrawerKind;
  projectName: string;
  accessLabel?: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const meta = projectDrawerMeta[kind];
  const Icon = meta.icon;
  const title = t(meta.titleKey);
  const widthClass =
    kind === "tasks"
      ? "max-w-full data-[vaul-drawer-direction=right]:sm:max-w-3xl"
      : meta.width === "history"
      ? "max-w-full data-[vaul-drawer-direction=right]:sm:max-w-6xl"
      : kind === "members"
      ? "max-w-full data-[vaul-drawer-direction=right]:sm:max-w-2xl"
      : "max-w-full data-[vaul-drawer-direction=right]:sm:max-w-md";

  return (
    <div data-testid="project-workspace-drawer-layer">
      {/* Desktop side drawers keep the page scrollbar so opening them cannot shift the workspace. */}
      {!isMobile && open ? <DesktopDrawerOverlay onClose={onClose} /> : null}
      <Drawer
        direction={isMobile ? "bottom" : "right"}
        modal={isMobile}
        open={open}
        onOpenChange={(next) => { if (!next) onClose(); }}
      >
        <DrawerContent
          data-testid="project-workspace-drawer"
          className={cn("max-w-full gap-0 overflow-x-hidden overflow-y-hidden", !isMobile && "z-[70]", widthClass, kind === "tasks" && isMobile && "h-[90dvh]")}
        >
          <DrawerHeader className="flex-row items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-9.5 rounded-sm after:border-0">
                <AvatarFallback className="bg-primary/10 text-primary size-9.5 shrink-0 rounded-sm [&>svg]:size-4.75">
                  <Icon className="size-5" aria-hidden="true" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <DrawerTitle className="text-base font-semibold">
                  {title}
                </DrawerTitle>
                <DrawerDescription className="truncate text-sm">
                  {projectName}
                </DrawerDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("projectShell.drawer.close", { title })}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </DrawerHeader>
          <div
            data-testid="project-workspace-drawer-body"
            className={cn("min-h-0 min-w-0 flex-1 overflow-x-hidden px-4 py-4", kind === "tasks" ? "flex flex-col overflow-y-hidden" : "overflow-y-auto")}
          >
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function CheckStatusDot() {
  return <span className="size-2 rounded-full bg-primary" aria-hidden="true" />;
}

export function ProjectWorkspaceDrawer({
  projectId,
  activeDrawer,
  onClose,
  onNavigate,
  preferredTaskRunId,
}: {
  projectId: string;
  activeDrawer: ProjectDrawerKind | null;
  onClose: () => void;
  onNavigate?: Navigate;
  preferredTaskRunId?: string | null;
}) {
  const { t } = useTranslation();
  const overview = useProjectOverview(projectId);
  // Unmount closed drawers so their modal focus lock cannot outlive the panel.
  const drawerKind = activeDrawer;
  if (!drawerKind) return null;

  const projectName =
    overview.project?.name ??
    (overview.loading ? t("projectShell.loadingProject") : t("projectShell.projectFallback", { projectId }));
  const accessMessage = renderAccessMessage(overview, t, onNavigate);
  const handleProjectDeleted = () => {
    onClose();
    onNavigate?.("/projects");
  };
  let content: React.ReactNode;

  if (overview.loading) {
    content = (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("projectShell.loadingProjectData")}
      </div>
    );
  } else if (accessMessage || !overview.project) {
    content = accessMessage;
  } else if (drawerKind === "tasks") {
    content = (
      <ProjectGenerationTasksDrawerContent
        projectId={projectId}
        onViewResult={onClose}
        projectRuns={overview.runs}
        preferredRunId={preferredTaskRunId}
      />
    );
  } else if (drawerKind === "settings") {
    content = (
      <ProjectSettings
        project={overview.project}
        membershipRole={overview.membership?.role ?? null}
        layout="drawer"
        onProjectDeleted={handleProjectDeleted}
      />
    );
  } else if (drawerKind === "members") {
    content = (
      <ProjectMembers
        project={overview.project}
        members={overview.members}
        membershipRole={overview.membership?.role ?? null}
        layout="drawer"
      />
    );
  } else if (drawerKind === "history") {
    content = (
      <ProjectHistory
        projectId={projectId}
        initialRuns={overview.runs}
        members={overview.members}
        layout="drawer"
      />
    );
  } else {
    content = <ProjectDocuments projectId={projectId} documents={overview.documents} layout="drawer" />;
  }

  return (
    <ProjectDrawerShell
      open={Boolean(activeDrawer)}
      kind={drawerKind}
      projectName={projectName}
      accessLabel={overview.membership?.role ?? null}
      onClose={onClose}
    >
      {content}
    </ProjectDrawerShell>
  );
}

export function ProjectWorkspaceAccessBoundary({
  projectId,
  onNavigate,
  children,
}: {
  projectId: string;
  onNavigate: Navigate;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const overview = useProjectOverview(projectId);
  const accessMessage = renderAccessMessage(overview, t, onNavigate);
  const coordinatedLoading = usePlatformRouteLoading(
    t("projectShell.openingWorkspace"),
    overview.loading,
  );
  const loadingTransition = useLoadingTransition(overview.loading);
  const overviewContextValue = useMemo(
    () => ({ projectId, overview }),
    [overview, projectId],
  );

  if (overview.loading) {
    if (coordinatedLoading) {
      return <ProjectWorkspaceLoadingLayout />;
    }
    return (
      <PageFrame onNavigate={onNavigate}>
        <PlatformLoadingScreen
          message={t("projectShell.openingWorkspace")}
          variant="content"
          phase={loadingTransition.phase === "hidden" ? "loading" : loadingTransition.phase}
          progress={loadingTransition.progress}
        />
      </PageFrame>
    );
  }

  if (accessMessage || !overview.project) {
    return (
      <div className="relative flex min-h-0 flex-1">
        <PageFrame onNavigate={onNavigate}>{accessMessage}</PageFrame>
        {!coordinatedLoading && loadingTransition.visible && loadingTransition.phase !== "hidden" && (
          <PlatformLoadingScreen
            message={t("projectShell.openingWorkspace")}
            variant="content"
            phase={loadingTransition.phase}
            progress={loadingTransition.progress}
            className="absolute inset-6 z-20"
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <ProjectOverviewContext.Provider value={overviewContextValue}>
        {children}
      </ProjectOverviewContext.Provider>
      {!coordinatedLoading && loadingTransition.visible && loadingTransition.phase !== "hidden" && (
        <PlatformLoadingScreen
          message={t("projectShell.openingWorkspace")}
          variant="content"
          phase={loadingTransition.phase}
          progress={loadingTransition.progress}
          className="absolute inset-6 z-20"
        />
      )}
    </div>
  );
}
