// Renders workspace-level navigation, run controls, and account/project entry points.
import { AdmincnHeader } from "../../../shared/template/layout/header";
import { ProfileDropdown } from './profile-dropdown';
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Home,
  Loader2,
  Menu,
  Moon,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";



import { Button } from "../../../shared/ui/button";

import { AccountDialog } from "../../user-platform/components/account-dialog";
import { useAuthenticatedRouteSession } from "../../user-platform/components/authenticated-route-session";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import { useTheme } from "../../../shared/ui/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/dropdown-menu";

import { useWorkspaceSession } from "../../workspace-session/state";
import { SystemNoticeButton } from "../../system-notices/components/system-notice-dialog";
import {
  SHELL_ROUTE_MODULES,
  type ShellRoutePath,
} from "../../../entities/workspace/modules";
import { LanguagePreferenceMenu } from "../../../shared/i18n/components/language-preference-menu";
import { ThemePresetMenu } from "../../../shared/template/layout/theme-preset-menu";

export type { ShellRoutePath };

export type TopBarProps = {
  currentRoute: string | null;
  onNavigate: (route: string) => void;
  accountDialogOpen?: boolean;
  onAccountDialogOpenChange?: (open: boolean) => void;
  globalSettingsRequestId?: number;
  projectDrawer?: {
    projectId: string;
    onOpenDrawer: (kind: "tasks") => void;
    projectRuns?: PlatformRunSummary[];
    projectName?: string;
    onStartTour?: () => void;
  } | null;
};

type ProjectWorkspaceActionsProps = {
  projectId: string;
  onOpenDrawer: (kind: "tasks") => void;
  projectRuns?: PlatformRunSummary[];
  onStartTour?: () => void;
};

const EMPTY_PROJECT_RUNS: PlatformRunSummary[] = [];

const RUN_STATUS_LABEL = {
  idle: "idle",
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "interrupted",
} as const;


const topBarActionButtonClass =
  "size-9 shrink-0";

const taskStatusButtonClass =
  "h-9 shrink-0 px-2.5";

const mainNavButtonClass =
  "h-9";

const themeIconVariants = {
  initial: { opacity: 0, rotate: -90, scale: 0.5 },
  animate: {
    opacity: 1,
    rotate: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 200, damping: 15 },
  },
  exit: {
    opacity: 0,
    rotate: 90,
    scale: 0.5,
    transition: { duration: 0.15, ease: "easeIn" as const },
  },
};

const reducedThemeIconVariants = {
  initial: { opacity: 1, rotate: 0, scale: 1 },
  animate: { opacity: 1, rotate: 0, scale: 1, transition: { duration: 0 } },
  exit: { opacity: 1, rotate: 0, scale: 1, transition: { duration: 0 } },
};

const SHELL_ROUTE_TRANSLATION_KEYS: Partial<Record<string, "workspace" | "exam" | "tutorial">> = {
  "/workspace": "workspace",
  "/exam": "exam",
  "/tutorial": "tutorial",
};

function shellRouteTranslationKey(route: string) {
  return route === "/projects" ? "projects" : (SHELL_ROUTE_TRANSLATION_KEYS[route] ?? "workspace");
}

function normalizeRunStatus(status: string): keyof typeof RUN_STATUS_LABEL {
  return status in RUN_STATUS_LABEL
    ? (status as keyof typeof RUN_STATUS_LABEL)
    : "idle";
}

function isActiveProjectRun(run: PlatformRunSummary) {
  return run.status === "queued" || run.status === "running";
}

function projectRunTimestamp(run: PlatformRunSummary) {
  const timestamp =
    run.updatedAt ?? run.completedAt ?? run.startedAt ?? run.createdAt ?? "";
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestProjectRun(runs: PlatformRunSummary[]) {
  return [...runs].sort(
    (left, right) => projectRunTimestamp(right) - projectRunTimestamp(left),
  )[0] ?? null;
}

// Stage-based percentages jump between a few values, so active work shows elapsed time instead.
function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

function useElapsedLabel(startedAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  return Number.isFinite(startedAtMs) ? formatElapsed(now - startedAtMs) : null;
}

export { ProjectGenerationTasksDrawerContent } from "./project-generation-tasks";

export function ProjectWorkspaceActions({
  onOpenDrawer,
  projectRuns = EMPTY_PROJECT_RUNS,
  onStartTour,
}: ProjectWorkspaceActionsProps) {
  const { t } = useTranslation();
  const {
    runStatus,
    generationTasks,
    reconcileGenerationTasksWithProjectRuns,
  } = useWorkspaceSession();
  useEffect(() => {
    reconcileGenerationTasksWithProjectRuns(projectRuns);
  }, [projectRuns, reconcileGenerationTasksWithProjectRuns]);

  const activeTaskCount = generationTasks.filter(
    (task) => task.status === "queued" || task.status === "running",
  ).length;
  const taskIsActive = runStatus === "queued" || runStatus === "running";
  const activeProjectRuns = projectRuns.filter(isActiveProjectRun);
  const recentProjectRun = latestProjectRun(projectRuns);
  const selectedProjectRun =
    taskIsActive || activeTaskCount > 0
      ? null
      : (activeProjectRuns[0] ?? recentProjectRun);
  const visibleTaskIsActive = taskIsActive || activeProjectRuns.length > 0;
  const visibleActiveTaskCount = activeTaskCount || activeProjectRuns.length;
  const visibleRunStatus = selectedProjectRun
    ? normalizeRunStatus(selectedProjectRun.status)
    : runStatus;
  const activeLocalTask = generationTasks.find(
    (task) => task.status === "queued" || task.status === "running",
  );
  const activeStartedAt = visibleTaskIsActive
    ? activeLocalTask?.startedAt ?? activeProjectRuns[0]?.startedAt ?? activeProjectRuns[0]?.createdAt ?? null
    : null;
  const elapsedLabel = useElapsedLabel(activeStartedAt);

  return (
    <div className="flex shrink-0 items-center gap-2">
      {onStartTour && (
        <Button type="button" variant="ghost" size="icon" className={topBarActionButtonClass}
          aria-label={t("onboarding.replay")} title={t("onboarding.replay")} onClick={onStartTour}>
          <CircleHelp className="size-5" />
        </Button>
      )}
      <Button
        id="onboarding-tasks-action"
        variant="ghost"
        className={taskStatusButtonClass}
        title={t("status.tasks")}
        aria-label={t("status.tasks")}
        onClick={() => onOpenDrawer("tasks")}
      >
        {visibleTaskIsActive ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : visibleRunStatus === "failed" ? (
          <AlertCircle className="size-5 text-destructive" />
        ) : visibleRunStatus === "interrupted" ? (
          <AlertCircle className="size-5 text-warning" />
        ) : visibleRunStatus === "completed" ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : (
          <Activity className="size-5" />
        )}
        <span className="hidden max-w-36 truncate font-semibold xl:inline">
          {visibleActiveTaskCount > 1
            ? t("status.run.count", { count: visibleActiveTaskCount })
            : visibleTaskIsActive && elapsedLabel
              ? t("status.run.elapsed", {
                  status: t(`status.run.${visibleRunStatus}`),
                  elapsed: elapsedLabel,
                })
              : t(`status.run.${visibleRunStatus}`)}
        </span>
      </Button>
    </div>
  );
}

export function TopBar({
  currentRoute,
  onNavigate,
  accountDialogOpen: controlledAccountDialogOpen,
  onAccountDialogOpenChange,
  globalSettingsRequestId,
  projectDrawer = null,
}: TopBarProps) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const reduceMotion = useReducedMotion();
  const authSession = useAuthenticatedRouteSession();
  const [uncontrolledAccountDialogOpen, setUncontrolledAccountDialogOpen] =
    useState(false);
  const accountDialogOpen =
    controlledAccountDialogOpen ?? uncontrolledAccountDialogOpen;
  const setAccountDialogOpen =
    onAccountDialogOpenChange ?? setUncontrolledAccountDialogOpen;
  const navItems = [
    { route: "/dashboard" as const, label: t("nav.dashboard") },
    { route: "/projects" as const, label: t("nav.projects") },
    ...SHELL_ROUTE_MODULES.filter((item) => item.route !== "/workspace").map((item) => ({
      ...item,
      label: t(`nav.${shellRouteTranslationKey(item.route)}`),
    })),
    { route: "/account/billing" as const, label: t("nav.payment") },
  ];

  return <AdmincnHeader
    showSidebar
    navigation={<nav className="hidden min-w-0 items-center gap-1.5 xl:flex">
        <Button
          variant="ghost"
          type="button"
          aria-label={t("nav.home")}
          className={mainNavButtonClass}
          onClick={() => onNavigate("/projects")}
        >
          <Home className="size-4" />
          {t("nav.home")}
        </Button>
        {projectDrawer?.projectName ? (
          <span className="text-muted-foreground max-w-56 truncate text-sm">
            {projectDrawer.projectName}
          </span>
        ) : null}
      </nav>}
    actions={<>
        {projectDrawer ? (
          <ProjectWorkspaceActions
            projectId={projectDrawer.projectId}
            onOpenDrawer={projectDrawer.onOpenDrawer}
            projectRuns={projectDrawer.projectRuns}
            onStartTour={projectDrawer.onStartTour}
          />
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button
              variant="ghost"
              size="icon"
            className={`${topBarActionButtonClass} xl:hidden`}
              title={t("nav.openMainNavigation")}
              aria-label={t("nav.openMainNavigation")}
             />} nativeButton={true}>

              <Menu className="size-5" />

          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>{t("nav.mainNavigation")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {navItems.map((item) => (
              <DropdownMenuItem key={item.label} onClick={() => onNavigate(item.route)}>
                {item.label}
                {(currentRoute === item.route ||
                  (item.route === "/projects" && currentRoute?.startsWith("/projects"))) && (
                  <span className="ml-auto text-xs text-primary">{t("common.current")}</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SystemNoticeButton className={topBarActionButtonClass} />
        <LanguagePreferenceMenu className={topBarActionButtonClass} />
        <ThemePresetMenu className={topBarActionButtonClass} />
        <Button
          variant="ghost"
          size="icon"
          className={topBarActionButtonClass}
          onClick={toggle}
          title={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
          aria-label={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
          aria-pressed={theme === "dark"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              data-slot="theme-toggle-icon"
              variants={reduceMotion ? reducedThemeIconVariants : themeIconVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex items-center justify-center"
            >
              {theme === "dark" ? <Moon className="size-5" /> : <Sun className="size-5" />}
            </motion.span>
          </AnimatePresence>
        </Button>
        {authSession === null ? (
          <span aria-hidden="true" className="size-9 animate-pulse rounded-full bg-muted" />
        ) : (
          <ProfileDropdown user={authSession?.user ?? null} onAccount={() => setAccountDialogOpen(true)} onNavigate={onNavigate} />
        )}
        <AccountDialog
          showTrigger={false}
          open={accountDialogOpen}
          onOpenChange={setAccountDialogOpen}
          onNavigate={onNavigate}
          initialUser={authSession?.user ?? null}
          globalSettingsRequestId={globalSettingsRequestId}
        />
    </>}
  />;
}
