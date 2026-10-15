// Defines stable Onborda targets and the workspace stage visited at each tour step.
import type { Step } from "onborda";

export type TourId = "empty-workspace" | "first-project-desktop" | "first-project-mobile";
export type TourStage = "system" | "feasibility" | "requirements" | "design" | "tests" | "documents";

export type TourItem = {
  key: string;
  selector: string;
  side: Step["side"];
  stage?: TourStage;
};

export const TOUR_ITEMS: Record<TourId, readonly TourItem[]> = {
  "empty-workspace": [
    { key: "empty.overview", selector: "#onboarding-empty-state", side: "top" },
    { key: "empty.create", selector: "#onboarding-create-first", side: "top" },
  ],
  "first-project-desktop": [
    { key: "desktop.system", selector: "#requirement-text", side: "right", stage: "system" },
    { key: "desktop.feasibility", selector: '[data-onboarding-nav="feasibility"]', side: "right", stage: "feasibility" },
    { key: "desktop.requirements", selector: '[data-onboarding-nav="requirements"]', side: "right", stage: "requirements" },
    { key: "desktop.diagrams", selector: "#requirement-target-models", side: "top", stage: "requirements" },
    { key: "desktop.design", selector: '[data-onboarding-nav="design"]', side: "right", stage: "design" },
    
    { key: "desktop.tests", selector: '[data-onboarding-nav="test"]', side: "right", stage: "tests" },
    { key: "desktop.documents", selector: '[data-onboarding-nav="documents"]', side: "right", stage: "documents" },
    { key: "desktop.tasks", selector: "#onboarding-tasks-action", side: "bottom" },
    { key: "desktop.history", selector: "#onboarding-history-action", side: "right" },
    { key: "desktop.management", selector: "#onboarding-settings-action", side: "right" },
  ],
  "first-project-mobile": [
    { key: "mobile.system", selector: "#requirement-text", side: "top", stage: "system" },
    { key: "mobile.analysis", selector: "#workspace-active-panel h1", side: "bottom", stage: "feasibility" },
    { key: "mobile.build", selector: "#workspace-active-panel h1", side: "bottom", stage: "design" },
    { key: "mobile.delivery", selector: "#workspace-active-panel h1", side: "bottom", stage: "documents" },
    { key: "mobile.manage", selector: "#onboarding-tasks-action", side: "bottom" },
  ],
};

export function tourItem(tour: TourId, index: number): TourItem | null {
  return TOUR_ITEMS[tour][index] ?? null;
}
