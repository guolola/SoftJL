// Publishes accepted feasibility outputs independently from the remaining parallel branches.
import { workspaceGuardConflicts, type FeasibilityArtifactKind, type FeasibilityRunSnapshot, type RunEventInput } from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

export const feasibilityArtifactLabels: Record<FeasibilityArtifactKind, string> = {
  context: "系统环境图", "business-flow": "业务流程图", implementation: "实现方案",
};

export function feasibilityArtifactFromEvent(event: RunEventInput): FeasibilityArtifactKind | null {
  if (event.type === "artifact_ready") {
    if (event.artifactKind === "feasibilityContext") return "context";
    if (event.artifactKind === "feasibilityBusinessFlow") return "business-flow";
    if (event.artifactKind === "feasibilityImplementation") return "implementation";
  }
  if (!("stage" in event)) return null;
  if (event.stage === "generate_context" || event.stage === "render_context") return "context";
  if (event.stage === "generate_business_flow" || event.stage === "render_business_flow") return "business-flow";
  if (event.stage === "generate_implementation") return "implementation";
  return null;
}

export function completedFeasibilityArtifacts(snapshot: FeasibilityRunSnapshot) {
  const accepted = new Set<FeasibilityArtifactKind>();
  // The accepted output manifest is the sole publication receipt for this run.
  for (const output of snapshot.outputManifest) {
    if (output.kind === "context") accepted.add("context");
    if (output.kind === "businessFlow") accepted.add("business-flow");
    if (output.kind === "implementationPlan") accepted.add("implementation");
  }
  return snapshot.selectedArtifacts.filter((kind) => accepted.has(kind) && (
    kind === "context" ? Boolean(snapshot.contextModel && snapshot.contextPlantUml?.source && snapshot.contextSvg?.svg) :
    kind === "business-flow" ? Boolean(snapshot.businessFlow?.svg.svg) : Boolean(snapshot.implementationPlan)
  ));
}

export function mergeFeasibilityRunSnapshot(workspace: WorkspaceRecord, snapshot: FeasibilityRunSnapshot, completed: FeasibilityArtifactKind[]) {
  // Both streaming publication and terminal recovery must respect newer edits.
  if (snapshot.publicationSkipped || snapshot.workspaceGuard && workspaceGuardConflicts({ snapshot }, { ...workspace }).length) return workspace;
  const next = { ...workspace };
  if (completed.includes("context")) Object.assign(next, {
    feasibilityContextModel: snapshot.contextModel,
    feasibilityContextTraceability: snapshot.contextTraceability,
    feasibilityContextPlantUml: snapshot.contextPlantUml!.source,
    feasibilityContextSvg: snapshot.contextSvg!.svg,
    feasibilityContextFingerprint: snapshot.contextFingerprint,
  });
  if (completed.includes("business-flow")) next.feasibilityBusinessFlow = snapshot.businessFlow;
  if (completed.includes("implementation")) Object.assign(next, {
    feasibilityImplementationPlan: snapshot.implementationPlan,
    feasibilityImplementationFingerprint: snapshot.implementationFingerprint,
  });
  next.visualReviews = { ...workspace.visualReviews,
    ...Object.fromEntries(Object.entries(snapshot.visualReviews ?? {}).map(([id, review]) => [`feasibility:${id}`, review])),
  };
  return next;
}
