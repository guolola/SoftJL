// Owns the authenticated projects index, filters, and create-project dialog composition.
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../../shared/ui/alert";
import { Card } from "../../../shared/ui/card";
import { PerspectiveCard } from "../../../shared/ui/interactive-card";
import { AnimatedTooltip } from "../../../shared/ui/motion-tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  Clock3,
  CircleHelp,
  FileText,
  Lock,
  Plus,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../../shared/ui/input-group";
import { Label } from "../../../shared/ui/label";
import { SelectControl } from "../../../shared/ui/select";
import { EmptyState, PageContainer, PageHeader } from "../../../shared/template/layout/page";
import { cn } from "../../../shared/ui/utils";
import { i18n as appI18n } from "../../../shared/i18n";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import {
  PROJECT_SCOPE_OPTIONS,
  projectFromApi,
  type StaticProject,
} from "../lib/project-presentation";
import {
  PlatformApiError,
  platformApi,
  type PlatformProject,
} from "../services/platform-api";
import { useAuthenticatedRouteSession } from "./authenticated-route-session";
import { ProjectCreateForm } from "./project-create-form";
import { useOnboardingTours } from "../../onboarding/components/onboarding-tour-provider";

type Navigate = (path: string) => void;

const STABLE_PLATFORM_SCROLL_CLASS =
  "min-h-0 min-w-0 w-full overflow-x-clip bg-background";

export function ProjectsIndexPage({ onNavigate }: { onNavigate: Navigate }) {
  const { t: translate, i18n: activeI18n } = useTranslation();
  const hasProviderResources =
    typeof activeI18n.exists === "function" && activeI18n.exists("projects.openProject");
  const t = hasProviderResources ? translate : appI18n.t.bind(appI18n);
  const language = hasProviderResources
    ? activeI18n.resolvedLanguage || activeI18n.language
    : appI18n.resolvedLanguage || appI18n.language;
  const locale = language === "en" ? "en" : "zh-CN";
  const [projectRecords, setProjectRecords] = useState<PlatformProject[]>([]);
  const [loading, setLoading] = useState(true);
  const authSession = useAuthenticatedRouteSession();
  const tours = useOnboardingTours();
  const tourStartAttemptedRef = useRef(false);
  const startTourRef = useRef<() => void>(() => {});
  const [statusKind, setStatusKind] = useState<"empty" | "loaded" | "authRequired" | "forbidden" | "loadFailed" | null>(null);
  const [statusErrorMessage, setStatusErrorMessage] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [listError, setListError] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [sort, setSort] = useState("generated");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const createDialogLocationRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAuthRequired(false);
    setForbidden(false);
    setListError(false);
    platformApi
      .listProjects()
      .then((response) => {
        if (!active) return;
        setListError(false);
        setProjectRecords(response.projects);
        setStatusKind(response.projects.length === 0 ? "empty" : "loaded");
        setStatusErrorMessage("");
      })
      .catch((error) => {
        if (!active) return;
        const statusCode = error instanceof PlatformApiError ? error.status : 0;
        setProjectRecords([]);
        setAuthRequired(statusCode === 401);
        setForbidden(statusCode === 403);
        setListError(statusCode !== 401 && statusCode !== 403);
        if (statusCode === 401) {
          setStatusKind("authRequired");
          setStatusErrorMessage("");
        } else if (statusCode === 403) {
          setStatusKind("forbidden");
          setStatusErrorMessage("");
        } else {
          setStatusKind("loadFailed");
          setStatusErrorMessage(localizeCaughtFailure(error, t("projects.status.loadFailed")));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authSession?.user]);

  const startEmptyTour = () => {
    tourStartAttemptedRef.current = true;
    void tours?.startTour("empty-workspace");
  };
  startTourRef.current = startEmptyTour;

  useEffect(() => {
    if (!tours || loading || statusKind !== "empty" || !authSession?.user?.id || tourStartAttemptedRef.current) return;
    let active = true;
    // Only a successful server read may trigger the tour automatically.
    void platformApi.getOnboardingState().then((onboarding) => {
      if (!active || onboarding.emptyWorkspace !== null || tourStartAttemptedRef.current) return;
      startTourRef.current();
    }).catch(() => {});
    return () => { active = false; };
  }, [authSession?.user?.id, loading, statusKind, tours]);

  const projects = useMemo(
    () =>
      projectRecords.map((project) =>
        projectFromApi(project, authSession?.user ?? null, locale, t("projects.noDescription")),
      ),
    [authSession?.user, locale, projectRecords],
  );

  const status = useMemo(() => {
    if (statusKind === "empty") return t("projects.status.empty");
    if (statusKind === "loaded") return t("projects.status.loaded");
    if (statusKind === "authRequired") return t("projects.status.authRequired");
    if (statusKind === "forbidden") return t("projects.status.forbidden");
    if (statusKind === "loadFailed") {
      return statusErrorMessage
        ? t("projects.status.loadFailedWithMessage", { message: statusErrorMessage })
        : t("projects.status.loadFailed");
    }
    return "";
  }, [statusErrorMessage, statusKind, t]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects
      .filter((project) => {
        if (query && !project.searchableText.includes(query)) return false;
        if (scope === "archived") return project.status === "archived";
        if (scope === "team") return project.visibilityKind === "team";
        if (scope === "mine") return project.isOwnedByCurrentUser || project.memberCount <= 1;
        return true;
      })
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name, locale);
        if (sort === "generated") {
          return (right.lastGeneratedAt || "").localeCompare(left.lastGeneratedAt || "");
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [locale, projects, scope, search, sort]);

  const openCreateProject = () => {
    if (authRequired || listError) {
      onNavigate("/login");
      return;
    }
    setCreateDialogOpen(true);
  };

  useEffect(() => {
    createDialogLocationRef.current = createDialogOpen
      ? `${window.location.pathname}${window.location.search}`
      : null;
  }, [createDialogOpen]);

  useEffect(() => {
    const closeIfLocationChanged = () => {
      const openedAt = createDialogLocationRef.current;
      if (!openedAt) return;
      const currentLocation = `${window.location.pathname}${window.location.search}`;
      if (currentLocation !== openedAt) {
        setCreateDialogOpen(false);
      }
    };
    const closeForRouteChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail.path !== "string") return;
      closeIfLocationChanged();
    };
    window.addEventListener("uml-route-change", closeForRouteChange);
    window.addEventListener("popstate", closeIfLocationChanged);
    return () => {
      window.removeEventListener("uml-route-change", closeForRouteChange);
      window.removeEventListener("popstate", closeIfLocationChanged);
    };
  }, []);

  if (loading) {
    return (
      <main
        data-testid="projects-index-shell"
        className={cn("relative", STABLE_PLATFORM_SCROLL_CLASS)}
        aria-busy="true"
      />
    );
  }

  return (
    <main
      data-testid="projects-index-shell"
      className={cn("relative", STABLE_PLATFORM_SCROLL_CLASS)}
    >
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title={t("projects.indexTitle")}
          description={t("projects.indexDescription")}
          actions={
            <>
              {!authRequired && !forbidden && !listError && projects.length === 0 && (
                <Button type="button" variant="outline" size="lg" onClick={startEmptyTour}>
                  <CircleHelp className="size-4" />
                  {t("onboarding.replay")}
                </Button>
              )}
              <Button type="button" size="lg" onClick={openCreateProject}>
                <Plus className="size-4" />
                {authRequired || listError ? t("projects.newProjectAfterLogin") : t("projects.newProject")}
              </Button>
            </>
          }
        />

        {(authRequired || forbidden || listError) && (
          <Alert variant="destructive">
            <AlertTitle>
              <h2 className="text-base font-medium">
                {authRequired
                  ? t("projects.access.loginTitle")
                  : forbidden
                    ? t("projects.access.forbiddenTitle")
                    : t("projects.access.unavailableTitle")}
              </h2>
            </AlertTitle>
            <AlertDescription>
              {authRequired
                ? t("projects.access.loginDescription")
                : forbidden
                  ? t("projects.access.forbiddenDescription")
                  : status || t("projects.access.unavailableDescription")}
            </AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" onClick={() => onNavigate("/login")}>
                {authRequired ? t("projects.access.loginAction") : t("projects.access.goLoginAction")}
              </Button>
            </AlertAction>
          </Alert>
        )}

        {!authRequired && !forbidden && !listError && (
          <Card as="section"
            data-testid="projects-filter-panel"
            className="gap-0 py-0 p-3 md:p-[17px]"
          >
            <div className="flex min-w-0 flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between md:gap-8">
              <div
                className="grid w-full min-w-0 grid-cols-4 gap-1.5 md:w-auto md:shrink-0 md:flex md:gap-2"
                role="group"
                aria-label={t("projects.scopeAria")}
              >
                {PROJECT_SCOPE_OPTIONS.map((option) => {
                  const selected = scope === option.value;
                  return (
                    <Button variant={selected ? "secondary" : "ghost"}
                      key={option.value}
                      type="button"
                      aria-label={t(option.labelKey)}
                      aria-pressed={selected}
                      className="h-8 min-w-0 px-2 text-sm md:shrink-0 md:px-3"
                      onClick={() => setScope(option.value)}
                    >
                      <span className="md:hidden">{t(option.shortLabelKey)}</span>
                      <span className="hidden md:inline">{t(option.labelKey)}</span>
                    </Button>
                  );
                })}
              </div>
              <div className="flex w-full min-w-0 items-center gap-2 md:w-auto md:flex-1 md:justify-end md:gap-4">
                <InputGroup className="min-w-0 flex-1 md:max-w-2xs">
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                  <Label className="sr-only" htmlFor="projects-search">
                    {t("projects.searchAria")}
                  </Label>
                  <InputGroupInput
                    id="projects-search"
                    placeholder={t("projects.searchPlaceholder")}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </InputGroup>
                <SelectControl
                  aria-label={t("projects.sortAria")}
                  value={sort}
                  onValueChange={setSort}
                  className="w-28 shrink-0 md:w-fit"
                  options={[
                    { value: "recent", label: t("projects.sort.recent") },
                    { value: "generated", label: t("projects.sort.generated") },
                    { value: "name", label: t("projects.sort.name") },
                  ]}
                />
              </div>
            </div>
          </Card>
        )}

        {!authRequired && !forbidden && !listError && projects.length > 0 && visibleProjects.length === 0 && (
          <EmptyState
            icon={Search}
            title={t("projects.noMatchesTitle")}
            description={t("projects.noMatchesDescription")}
            className="mx-auto"
          />
        )}

        {!authRequired && !forbidden && !listError && projects.length > 0 && visibleProjects.length > 0 && (
          <div
            data-testid="projects-card-grid"
            data-mobile-card-density="two-column"
            className="grid grid-cols-2 gap-3 md:gap-5 xl:grid-cols-3 xl:gap-6"
          >
            {visibleProjects.map((project) => (
              <PerspectiveCard
                key={project.id}
                data-background-key={project.background.key}
                className={
                  project.status === "archived"
                    ? "group flex min-h-[174px] flex-col opacity-75 md:min-h-[287px]"
                    : "group flex min-h-[182px] flex-col md:min-h-[303px]"
                }
              >
                <div className="relative aspect-video w-full overflow-hidden border-b border-border/60 bg-muted">
                  <img
                    src={project.background.imageUrl}
                    alt=""
                    className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/35 to-transparent" />
                </div>
                <div className="relative z-10 flex flex-1 flex-col gap-2 p-4 md:p-5">
                  <div className="flex min-w-0 items-start justify-between gap-2 md:gap-3">
                    <h2 className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-5 text-foreground md:text-xl md:leading-7">
                      {project.name}
                    </h2>
                    <Badge
                      variant={project.status === "archived" ? "outline" : "secondary"}
                      className={
                        project.status === "archived"
                          ? "shrink-0 px-1.5 py-0.5 text-[10px] leading-4 md:px-2 md:py-1 md:text-xs"
                          : "shrink-0 px-1.5 py-0.5 text-[10px] leading-4 md:px-2 md:py-1 md:text-xs"
                      }
                    >
                      {project.statusLabel}
                    </Badge>
                  </div>
                  <p className="line-clamp-1 min-h-5 min-w-0 max-w-full overflow-hidden text-[12px] leading-5 text-muted-foreground md:line-clamp-2 md:min-h-10 md:text-sm md:leading-5">
                    {project.description}
                  </p>
                  <div className="grid gap-1 pt-0.5 text-[12px] leading-4 text-muted-foreground md:gap-2 md:pt-2 md:text-sm md:leading-5">
                    <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                      <UserRound className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">
                        {t("projects.ownerPrefix", { owner: project.owner })}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                      {project.status === "archived" ? (
                        <Archive className="size-3.5 shrink-0" />
                      ) : project.visibilityKind === "private" ? (
                        <Lock className="size-3.5 shrink-0" />
                      ) : (
                        <Users className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">{project.visibility}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                      <Clock3 className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">
                        {t("projects.updatedPrefix", { date: project.updatedAtDisplay })}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="relative z-10 mt-auto flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-4 py-3">
                  <div className="flex items-start">
                    {project.status === "archived" ? (
                      <span className="line-clamp-2 font-mono text-[10px] font-medium leading-4 text-muted-foreground md:text-xs">
                        {t("projects.lastUpdatedPrefix", { date: project.updatedAtDisplay })}
                      </span>
                    ) : (
                      <>
                        <AnimatedTooltip
                          items={project.members.map((member) => ({
                            id: `${project.id}:${member.id}`,
                            image: member.avatarUrl,
                            fallback: member.initial,
                            name: member.label,
                            designation: String(t(`projectShell.membersUi.roles.${member.role}`, {
                              defaultValue: member.role,
                            })),
                            ariaLabel: String(t("projects.memberAvatar", { name: member.label })),
                          }))}
                        />
                        {project.memberCount > project.members.length && (
                          <span
                            aria-label={t("projects.otherMembers", {
                              count: project.memberCount - project.members.length,
                            })}
                            className="mr-[-8px] inline-flex size-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[11px] font-semibold text-muted-foreground md:size-8 md:text-xs"
                          >
                            +{project.memberCount - project.members.length}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 shrink-0 px-0 text-sm leading-5 md:text-base"
                    onClick={() => onNavigate(`/projects/${project.id}`)}
                  >
                    {t("projects.openProject")}
                    <span className="sr-only"> {project.name}</span>
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </PerspectiveCard>
            ))}
          </div>
        )}

        {!authRequired && !forbidden && !listError && projects.length === 0 && (
          <div id="onboarding-empty-state" className="mx-auto w-full max-w-lg">
          <EmptyState
            icon={FileText}
            title={t("projects.emptyTitle")}
            description={t("projects.emptyDescription")}
            className="mx-auto"
            action={
              <Button id="onboarding-create-first" type="button" size="lg" onClick={openCreateProject}>
                <Plus className="size-4" />
                {t("projects.createFirstProject")}
              </Button>
            }
          />
          </div>
        )}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("projects.createProject")}</DialogTitle>
              <DialogDescription>
                {t("projects.createProjectDescription")}
              </DialogDescription>
            </DialogHeader>
            <ProjectCreateForm onNavigate={onNavigate} />
          </DialogContent>
        </Dialog>
      </PageContainer>
    </main>
  );
}
