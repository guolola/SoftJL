// Projects server-side project run summaries into readonly workspace status signals.
import type { DesignDiagramKind, DiagramKind, DocumentKind } from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_ORDER,
  DIAGRAM_ORDER,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import type { SidebarNodeStatus } from "./sidebar-menu-model";

type ActiveStatus = "queued" | "running";

const requirementDiagramSet = new Set<string>(DIAGRAM_ORDER);
const designDiagramSet = new Set<string>(DESIGN_DIAGRAM_ORDER);
const REQUIRED_REQUIREMENT_FALLBACKS: DiagramType[] = ["usecase", "class"];
const REQUIRED_DESIGN_FALLBACKS: DesignDiagramType[] = ["sequence", "class"];

export function isActiveProjectRun(run: Pick<PlatformRunSummary, "status">) {
  return run.status === "queued" || run.status === "running";
}

export function activeProjectRunStatus(run: Pick<PlatformRunSummary, "status">) {
  return run.status === "queued" ? "queued" : "running";
}

function mergeActiveStatus(current: ActiveStatus | undefined, next: ActiveStatus) {
  if (current === "running" || next === "running") return "running";
  return "queued";
}

export function mergeProjectedStatus(
  current: SidebarNodeStatus | undefined,
  next: ActiveStatus | undefined,
) {
  if (!next) return current;
  if (current === "running" || next === "running") return "running";
  if (current === "queued" || next === "queued") return "queued";
  return current;
}

export function activeStatusForProjectRunKind(
  projectRuns: PlatformRunSummary[] | undefined,
  runKind: "requirements" | "design" | "document",
  matches: (run: PlatformRunSummary) => boolean = () => true,
) {
  return (projectRuns ?? [])
    .filter((run) => run.runKind === runKind && isActiveProjectRun(run) && matches(run))
    .reduce<ActiveStatus | undefined>(
      (status, run) => mergeActiveStatus(status, activeProjectRunStatus(run)),
      undefined,
    );
}

function activeRequirementRunIsModelStage(run: PlatformRunSummary) {
  return run.stage !== "extract_rules";
}

function requirementDiagramsFromRun(run: PlatformRunSummary) {
  const selected = ((run.selectedDiagrams ?? []) as DiagramKind[])
    .filter((diagram): diagram is DiagramType => requirementDiagramSet.has(diagram));
  return selected.length > 0 || !activeRequirementRunIsModelStage(run)
    ? selected
    : REQUIRED_REQUIREMENT_FALLBACKS;
}

function designDiagramsFromRun(run: PlatformRunSummary) {
  const requested = ((run.requestedDiagrams ?? []) as DesignDiagramKind[])
    .filter((diagram): diagram is DesignDiagramType => designDiagramSet.has(diagram));
  if (requested.length > 0) return requested;
  const selected = ((run.selectedDiagrams ?? []) as DesignDiagramKind[])
    .filter((diagram): diagram is DesignDiagramType => designDiagramSet.has(diagram));
  return selected.length > 0 ? selected : REQUIRED_DESIGN_FALLBACKS;
}

export function activeRequirementProjectDiagramStatuses(
  projectRuns: PlatformRunSummary[] | undefined,
) {
  const statuses = new Map<DiagramType, ActiveStatus>();
  for (const run of projectRuns ?? []) {
    if (run.runKind !== "requirements" || !isActiveProjectRun(run)) continue;
    for (const diagram of requirementDiagramsFromRun(run)) {
      statuses.set(
        diagram,
        mergeActiveStatus(statuses.get(diagram), activeProjectRunStatus(run)),
      );
    }
  }
  return statuses;
}

export function activeDesignProjectDiagramStatuses(
  projectRuns: PlatformRunSummary[] | undefined,
) {
  const statuses = new Map<DesignDiagramType, ActiveStatus>();
  for (const run of projectRuns ?? []) {
    if (run.runKind !== "design" || !isActiveProjectRun(run)) continue;
    for (const diagram of designDiagramsFromRun(run)) {
      statuses.set(
        diagram,
        mergeActiveStatus(statuses.get(diagram), activeProjectRunStatus(run)),
      );
    }
  }
  return statuses;
}

export function activeDocumentProjectRunStatus(
  projectRuns: PlatformRunSummary[] | undefined,
  documentKind: DocumentKind,
) {
  return activeStatusForProjectRunKind(
    projectRuns,
    "document",
    (run) => run.documentKind === documentKind,
  );
}
