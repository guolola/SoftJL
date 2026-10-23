// Owns the authenticated projects index, filters, and create-project dialog composition.
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../../shared/ui/alert";
import { Card } from "../../../shared/ui/card";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { RainbowButton } from "../../../shared/ui/rainbow-button";
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
import { PageContainer, PageHeader, TablePagination } from "../../../shared/template/layout/page";
import { cn } from "../../../shared/ui/utils";
import { i18n as appI18n } from "../../../shared/i18n/index";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import {
  PROJECT_SCOPE_OPTIONS,
  projectFromApi,
} from "../lib/project-presentation";
import {
  PlatformApiError,
  platformApi,
  type PlatformProject,
} from "../services/platform-api";
import { useAuthenticatedRouteSession } from "./authenticated-route-session";
import { ProjectCreateForm } from "./project-create-form";
import { ProjectExpandableCards } from "./project-expandable-cards";
import ProjectsEmptyBento from "./bento-grid-25/projects-empty-bento";

type Navigate = (path: string) => void;

const STABLE_PLATFORM_SCROLL_CLASS =
  "min-h-0 min-w-0 w-full overflow-x-clip bg-background";

export function ProjectsIndexPage({ onNavigate }: { onNavigate: Navigate }) {
  const { t: translate, i18n: activeI18n } = useTranslation();
  const hasProviderResources =
    typeof activeI18n.exists === "function" && activeI18n.exists("projects.openProject");
  const t = hasProviderResources ? translate : appI18n.t.bind(appI18n);
  const failureTranslation = useRef(t);
  failureTranslation.current = t;
  const language = hasProviderResources
    ? activeI18n.resolvedLanguage || activeI18n.language
    : appI18n.resolvedLanguage || appI18n.language;
  const locale = language === "en" ? "en" : "zh-CN";
  const [projectRecords, setProjectRecords] = useState<PlatformProject[]>([]);
  const [loading, setLoading] = useState(true);
  const authSession = useAuthenticatedRouteSession();
  const [statusKind, setStatusKind] = useState<"empty" | "loaded" | "authRequired" | "forbidden" | "loadFailed" | null>(null);
  const [statusErrorMessage, setStatusErrorMessage] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [listError, setListError] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<(typeof PROJECT_SCOPE_OPTIONS)[number]["value"]>("all");
  const [sort, setSort] = useState("generated");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
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
        setPage(1);
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
          setStatusErrorMessage(localizeCaughtFailure(error, failureTranslation.current("projects.status.loadFailed")));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authSession?.user]);

  const projects = useMemo(
    () =>
      projectRecords.map((project) =>
        projectFromApi(project, authSession?.user ?? null, locale, t("projects.noDescription")),
      ),
    [authSession?.user, locale, projectRecords, t],
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
        if (scope === "standard" || scope === "professional") return project.projectMode === scope;
        if (scope === "shared") return project.memberCount > 1;
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

  // Paginate only after filtering and sorting so every project remains searchable.
  const pageCount = Math.max(1, Math.ceil(visibleProjects.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pagedProjects = visibleProjects.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
              <RainbowButton
                type="button"
                className="h-10 w-auto gap-1.5 px-6 text-base whitespace-nowrap"
                onClick={openCreateProject}
              >
                <Plus className="size-4" />
                {authRequired || listError ? t("projects.newProjectAfterLogin") : t("projects.newProject")}
              </RainbowButton>
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
                      onClick={() => { setScope(option.value); setPage(1); }}
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
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                  />
                </InputGroup>
                <SelectControl
                  aria-label={t("projects.sortAria")}
                  value={sort}
                  onValueChange={(value) => { setSort(value); setPage(1); }}
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

        {!authRequired && !forbidden && !listError && projects.length > 0 && visibleProjects.length > 0 && (
          <ProjectExpandableCards projects={pagedProjects} onNavigate={onNavigate} />
        )}

        {!authRequired && !forbidden && !listError && visibleProjects.length > 0 && (
          <TablePagination
            total={visibleProjects.length}
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            pageSizeOptions={[12, 24, 48]}
            onPageChange={(value) => setPage(Math.min(Math.max(1, value), pageCount))}
            onPageSizeChange={(value) => { setPageSize(value); setPage(1); }}
            itemLabel={t("projects.pagination.itemLabel")}
            className="px-0"
          />
        )}

        {!authRequired && !forbidden && !listError && projects.length === 0 && (
          <ProjectsEmptyBento />
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
