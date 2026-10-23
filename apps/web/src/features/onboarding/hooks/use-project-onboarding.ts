// Starts the first-project tour and restores the user's prior workspace on exit.
import { useCallback, useEffect, useRef } from "react";
import { useSidebar } from "../../../shared/ui/sidebar";
import { useRouteContentReady } from "../../../shared/lib/route-content-readiness";
import { consumeProjectIntroduction, hasPendingProjectIntroduction } from "../../../shared/lib/project-introduction";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { platformApi } from "../../user-platform/services/platform-api";
import { useOnboardingTours } from "../components/onboarding-tour-provider";
import { tourItem, type TourStage } from "../model/tour-catalog";

const STAGE_SELECTION_KIND = {
  system: "system-requirements",
  feasibility: "feasibility-home",
  requirements: "requirements-text",
  design: "design-home",
  tests: "test-home",
  documents: "documents-home",
} as const;

function waitForStage(stage: TourStage, currentKind: () => string, timeoutMs = 4000) {
  if (currentKind() === STAGE_SELECTION_KIND[stage]) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (currentKind() === STAGE_SELECTION_KIND[stage]) {
        resolve();
      } else if (Date.now() - started >= timeoutMs) {
        reject(new Error(`Workspace stage did not open: ${stage}`));
      } else {
        window.setTimeout(check, 30);
      }
    };
    check();
  });
}

export function useProjectOnboarding(projectId: string, enabled = true) {
  const tours = useOnboardingTours();
  const toursAvailable = Boolean(tours);
  const routeReady = useRouteContentReady();
  const workspace = useWorkspaceShell();
  const { isMobile, state, openMobile, setOpen, setOpenMobile } = useSidebar();
  const selectionRef = useRef(workspace.selection);
  const autoAttemptedRef = useRef(false);
  const startRef = useRef<() => Promise<void>>(async () => {});
  selectionRef.current = workspace.selection;

  const startProjectTour = useCallback(async () => {
    if (!tours || !routeReady) return;
    autoAttemptedRef.current = true;
    const tour = isMobile ? "first-project-mobile" : "first-project-desktop";
    const previousTabs = workspace.openTabs;
    const previousTabId = workspace.activeTabId;
    const sidebarWasExpanded = state === "expanded";
    const mobileSidebarWasOpen = openMobile;

    if (isMobile) setOpenMobile(false);
    else setOpen(true);

    const started = await tours.startTour(tour, {
      prepareStep: async (index) => {
        const stage = tourItem(tour, index)?.stage;
        if (!stage) return;
        switch (stage) {
          case "system": workspace.openSystemRequirements(); break;
          case "feasibility": workspace.openFeasibilityHome(); break;
          case "requirements": workspace.openRequirementsText(); break;
          case "design": workspace.openDesignHome(); break;
          
          case "tests": workspace.openTestHome(); break;
          case "documents": workspace.openDocumentsHome(); break;
        }
        await waitForStage(stage, () => selectionRef.current.kind);
      },
      onExit: () => {
        workspace.restoreWorkspaceTabs(previousTabs, previousTabId);
        if (isMobile) setOpenMobile(mobileSidebarWasOpen);
        else setOpen(sidebarWasExpanded);
      },
    });
    if (started) consumeProjectIntroduction(projectId, "professional");
  }, [isMobile, openMobile, projectId, routeReady, setOpen, setOpenMobile, state, tours, workspace]);

  startRef.current = startProjectTour;

  useEffect(() => {
    if (!enabled || !routeReady || !toursAvailable) return;
    let active = true;
    // A failed state fetch suppresses automatic guidance, while the replay button remains usable.
    void platformApi.getOnboardingState().then((onboarding) => {
      if (!active || autoAttemptedRef.current) return;
      if (onboarding.firstProject !== null) {
        consumeProjectIntroduction(projectId, "professional");
        return;
      }
      // A quick-modeling project may own firstProjectId; a newly created engineering project still deserves its first guide.
      if (onboarding.firstProjectId !== projectId && !hasPendingProjectIntroduction(projectId, "professional")) return;
      autoAttemptedRef.current = true;
      void startRef.current();
    }).catch(() => {});
    return () => { active = false; };
  }, [projectId, enabled, routeReady, toursAvailable]);

  return { startProjectTour };
}
