// Renders workspace-level navigation, run controls, and account/project entry points.
import { AdmincnHeader } from "../../../shared/template/layout/header";
import { ProfileDropdown } from './profile-dropdown';
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Activity, AlertCircle, Boxes, CheckCircle2, CircleHelp, Home, Loader2, Menu, Moon, Sun, } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { RunStage, } from "@uml-platform/contracts";
import { SidebarTrigger } from '../../../shared/ui/sidebar';
import { Separator } from '../../../shared/ui/separator';
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { AccountDialog } from "../../user-platform/components/account-dialog";
import { useAuthenticatedRouteSession } from "../../user-platform/components/authenticated-route-session";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import { useTheme } from "../../../shared/ui/theme-provider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from "../../../shared/ui/dropdown-menu";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceSession } from "../../workspace-session/state";
import { SystemNoticeButton } from "../../system-notices/components/system-notice-dialog";
import { SHELL_ROUTE_MODULES, type ShellRoutePath, } from "../../../entities/workspace/modules";
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
type RunKind = "requirements" | "design" | "document" | "feasibility";
const STAGE_LABELS: Record<RunStage, string> = {
    generate_business_flow: "generate_business_flow", render_business_flow: "render_business_flow",
    extract_rules: "extract_rules", generate_models: "generate_models", generate_design_sequence: "generate_design_sequence",
    generate_design_models: "generate_design_models", generate_tests: "generate_tests",
    generate_document_text: "generate_document_text", render_document_file: "render_document_file", generate_plantuml: "generate_plantuml",
    render_svg: "render_svg", generate_context: "generate_context", render_context: "render_context", generate_implementation: "generate_implementation",
    verify_diagram_visual: "verify_diagram_visual",
};
const STAGES_BY_KIND: Record<RunKind, RunStage[]> = {
    requirements: [
        "extract_rules",
        "generate_models",
        "generate_plantuml",
        "render_svg",
        "verify_diagram_visual",
    ],
    design: [
        "generate_design_sequence",
        "generate_design_models",
        "generate_plantuml",
        "render_svg",
        "verify_diagram_visual",
    ],
    document: ["generate_document_text", "render_document_file"],
    feasibility: [
        "generate_context",
        "render_context",
        "verify_diagram_visual",
        "generate_business_flow",
        "render_business_flow",
        "generate_implementation",
    ],
};
const topBarActionButtonClass = "size-9 shrink-0";
const taskStatusButtonClass = "h-9 shrink-0 px-2.5";
const mainNavButtonClass = "h-9";
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
function formatStageLabel(stage: RunStage | null, t?: TFunction) {
    if (!stage)
        return t ? t("generation.stages.waiting") : "waiting";
    if (t)
        return t(`generation.stageLabels.${stage}`);
    return STAGE_LABELS[stage] ?? stage;
}
function sanitizeTaskText(text: string | null | undefined) {
    return text ?? "";
}
function getTaskStages(kind: RunKind | null, activeStage: RunStage | null) {
    const base = kind ? [...STAGES_BY_KIND[kind]] : [];
    if (activeStage && !base.includes(activeStage)) {
        base.push(activeStage);
    }
    return base;
}
function normalizeRunStatus(status: string): keyof typeof RUN_STATUS_LABEL {
    return status in RUN_STATUS_LABEL
        ? (status as keyof typeof RUN_STATUS_LABEL)
        : "idle";
}
function normalizeRunKind(kind: PlatformRunSummary["runKind"]): RunKind | null {
    return kind === "requirements" ||
        kind === "design" ||
        kind === "document" ||
        kind === "feasibility"
        ? kind
        : null;
}
function normalizeRunStage(stage: PlatformRunSummary["stage"]): RunStage | null {
    return stage && stage in STAGE_LABELS ? (stage as RunStage) : null;
}
function isActiveProjectRun(run: PlatformRunSummary) {
    return run.status === "queued" || run.status === "running";
}
function isActiveGenerationTask(task: {
    status: string;
}) {
    return task.status === "queued" || task.status === "running";
}
function projectRunTimestamp(run: PlatformRunSummary) {
    const timestamp = run.updatedAt ?? run.completedAt ?? run.startedAt ?? run.createdAt ?? "";
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : 0;
}
function latestProjectRun(runs: PlatformRunSummary[]) {
    return [...runs].sort((left, right) => projectRunTimestamp(right) - projectRunTimestamp(left))[0] ?? null;
}
function getProjectRunProgress(run: PlatformRunSummary) {
    const status = normalizeRunStatus(run.status);
    if (status === "queued")
        return 0;
    if (status === "completed" ||
        status === "failed" ||
        status === "cancelled" ||
        status === "interrupted") {
        return 100;
    }
    const stage = normalizeRunStage(run.stage);
    const stages = getTaskStages(normalizeRunKind(run.runKind), stage);
    const stageIndex = stage ? stages.indexOf(stage) : -1;
    if (stageIndex < 0 || stages.length === 0)
        return status === "running" ? 5 : 0;
    return Math.min(95, Math.max(5, Math.round(((stageIndex + 1) / stages.length) * 100)));
}
export { ProjectGenerationTasksDrawerContent } from "./project-generation-tasks";
export function ProjectWorkspaceActions({ onOpenDrawer, projectRuns = EMPTY_PROJECT_RUNS, onStartTour, }: ProjectWorkspaceActionsProps) {
    const { t } = useTranslation();
    const { runStatus, runProgress, generationTasks, reconcileGenerationTasksWithProjectRuns, } = useWorkspaceSession();
    useEffect(() => {
        reconcileGenerationTasksWithProjectRuns(projectRuns);
    }, [projectRuns, reconcileGenerationTasksWithProjectRuns]);
    const activeTaskCount = generationTasks.filter((task) => task.status === "queued" || task.status === "running").length;
    const taskIsActive = runStatus === "queued" || runStatus === "running";
    const activeProjectRuns = projectRuns.filter(isActiveProjectRun);
    const recentProjectRun = latestProjectRun(projectRuns);
    const selectedProjectRun = taskIsActive || activeTaskCount > 0
        ? null
        : (activeProjectRuns[0] ?? recentProjectRun);
    const visibleTaskIsActive = taskIsActive || activeProjectRuns.length > 0;
    const visibleActiveTaskCount = activeTaskCount || activeProjectRuns.length;
    const visibleRunStatus = selectedProjectRun
        ? normalizeRunStatus(selectedProjectRun.status)
        : runStatus;
    const visibleRunProgress = selectedProjectRun
        ? getProjectRunProgress(selectedProjectRun)
        : runProgress;
    return (<div className="flex shrink-0 items-center gap-2">
      {onStartTour && (<Button type="button" variant="ghost" size="icon" className={topBarActionButtonClass} aria-label={t("onboarding.replay")} title={t("onboarding.replay")} onClick={onStartTour}>
          <CircleHelp className="size-5"/>
        </Button>)}
      <Button id="onboarding-tasks-action" variant="ghost" className={taskStatusButtonClass} title={t("status.tasks")} aria-label={t("status.tasks")} onClick={() => onOpenDrawer("tasks")}>
        {visibleTaskIsActive ? (<Loader2 className="size-5 animate-spin text-primary"/>) : visibleRunStatus === "failed" ? (<AlertCircle className="size-5 text-destructive"/>) : visibleRunStatus === "interrupted" ? (<AlertCircle className="size-5 text-warning"/>) : visibleRunStatus === "completed" ? (<CheckCircle2 className="size-5 text-success"/>) : (<Activity className="size-5"/>)}
        <span className="hidden max-w-36 truncate font-semibold xl:inline">
          {visibleActiveTaskCount > 1
            ? t("status.run.count", { count: visibleActiveTaskCount })
            : visibleTaskIsActive
                ? t("status.run.progress", {
                    status: t(`status.run.${visibleRunStatus}`),
                    progress: visibleRunProgress,
                })
                : t(`status.run.${visibleRunStatus}`)}
        </span>
      </Button>
    </div>);
}
export function TopBar({ currentRoute, onNavigate, accountDialogOpen: controlledAccountDialogOpen, onAccountDialogOpenChange, globalSettingsRequestId, projectDrawer = null, }: TopBarProps) {
    const { t } = useTranslation();
    const { theme, toggle } = useTheme();
    const reduceMotion = useReducedMotion();
    const authSession = useAuthenticatedRouteSession();
    const [uncontrolledAccountDialogOpen, setUncontrolledAccountDialogOpen] = useState(false);
    const accountDialogOpen = controlledAccountDialogOpen ?? uncontrolledAccountDialogOpen;
    const setAccountDialogOpen = onAccountDialogOpenChange ?? setUncontrolledAccountDialogOpen;
    const navItems = [
        { route: "/dashboard" as const, label: t("nav.dashboard") },
        { route: "/projects" as const, label: t("nav.projects") },
        ...SHELL_ROUTE_MODULES.filter((item) => item.route !== "/workspace").map((item) => ({
            ...item,
            label: t(`nav.${shellRouteTranslationKey(item.route)}`),
        })),
    ];
    const currentLabel = navItems.find((item) => currentRoute === item.route ||
        (item.route === "/projects" && currentRoute?.startsWith("/projects")))?.label ?? t("nav.workspace");
    return <AdmincnHeader showSidebar navigation={<nav className="hidden min-w-0 items-center gap-1.5 xl:flex">
        <Button variant="ghost" type="button" aria-label={t("nav.home")} className={mainNavButtonClass} onClick={() => onNavigate("/projects")}>
          <Home className="size-4"/>
          {t("nav.home")}
        </Button>
        {projectDrawer?.projectName ? (<span className="text-muted-foreground max-w-56 truncate text-sm">
            {projectDrawer.projectName}
          </span>) : null}
      </nav>} actions={<>
        {projectDrawer ? (<ProjectWorkspaceActions projectId={projectDrawer.projectId} onOpenDrawer={projectDrawer.onOpenDrawer} projectRuns={projectDrawer.projectRuns} onStartTour={projectDrawer.onStartTour}/>) : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className={`${topBarActionButtonClass} xl:hidden`} title={t("nav.openMainNavigation")} aria-label={t("nav.openMainNavigation")}/>} nativeButton={true}>

              <Menu className="size-5"/>

          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>{t("nav.mainNavigation")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {navItems.map((item) => (<DropdownMenuItem key={item.label} onClick={() => onNavigate(item.route)}>
                {item.label}
                {(currentRoute === item.route ||
                    (item.route === "/projects" && currentRoute?.startsWith("/projects"))) && (<span className="ml-auto text-xs text-primary">{t("common.current")}</span>)}
              </DropdownMenuItem>))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SystemNoticeButton className={topBarActionButtonClass}/>
        <LanguagePreferenceMenu className={topBarActionButtonClass}/>
        <ThemePresetMenu className={topBarActionButtonClass}/>
        <Button variant="ghost" size="icon" className={topBarActionButtonClass} onClick={toggle} title={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")} aria-label={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")} aria-pressed={theme === "dark"}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={theme} data-slot="theme-toggle-icon" variants={reduceMotion ? reducedThemeIconVariants : themeIconVariants} initial="initial" animate="animate" exit="exit" className="flex items-center justify-center">
              {theme === "dark" ? <Moon className="size-5"/> : <Sun className="size-5"/>}
            </motion.span>
          </AnimatePresence>
        </Button>
        {authSession === null ? (<span aria-hidden="true" className="size-9 animate-pulse rounded-full bg-muted"/>) : (<ProfileDropdown user={authSession?.user ?? null} onAccount={() => setAccountDialogOpen(true)} onNavigate={onNavigate}/>)}
        <AccountDialog showTrigger={false} open={accountDialogOpen} onOpenChange={setAccountDialogOpen} onNavigate={onNavigate} initialUser={authSession?.user ?? null} globalSettingsRequestId={globalSettingsRequestId}/>
    </>}/>;
}
