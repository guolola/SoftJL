// Starts the first-project tour and restores the user's prior workspace on exit.
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSidebar } from "../../../shared/ui/sidebar";
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

export function useProjectOnboarding(projectId: string) {
  const { t } = useTranslation();
  const tours = useOnboardingTours();
  const workspace = useWorkspaceShell();
  const { isMobile, state, openMobile, setOpen, setOpenMobile } = useSidebar();
  const selectionRef = useRef(workspace.selection);
  const autoAttemptedRef = useRef(false);
  const startRef = useRef<() => Promise<void>>(async () => {});
  selectionRef.current = workspace.selection;

  const startProjectTour = useCallback(async () => {
    if (!tours) return;
    autoAttemptedRef.current = true;
    const tour = isMobile ? "first-project-mobile" : "first-project-desktop";
    const previousTabs = workspace.openTabs;
    const previousTabId = workspace.activeTabId;
    const sidebarWasExpanded = state === "expanded";
    const mobileSidebarWasOpen = openMobile;

    if (isMobile) setOpenMobile(false);
    else setOpen(true);

    await tours.startTour(tour, {
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
  }, [isMobile, openMobile, setOpen, setOpenMobile, state, t, tours, workspace]);

  startRef.current = startProjectTour;

  useEffect(() => {
    let active = true;
    // A failed state fetch suppresses automatic guidance, while the replay button remains usable.
    void platformApi.getOnboardingState().then((onboarding) => {
      if (!active || autoAttemptedRef.current) return;
      if (onboarding.firstProject !== null || onboarding.firstProjectId !== projectId) return;
      autoAttemptedRef.current = true;
      void startRef.current();
    }).catch(() => {});
    return () => { active = false; };
  }, [projectId]);

  return { startProjectTour };
}
