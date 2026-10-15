// Counts distinct output types in the current project workspace and document library.
import { dashboardProgressArtifactTypes, dashboardProgressStages, type DashboardSummary, type DocumentLibraryItem } from "@uml-platform/contracts";

type ProgressDocument = Pick<DocumentLibraryItem, "status" | "documentKind">;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function present(value: unknown) { return Object.keys(record(value)).length > 0; }

export function buildDashboardProgress(state: Record<string, unknown>, documents: ProgressDocument[]): NonNullable<DashboardSummary["projects"][number]["progress"]> {
  const generated = new Set<string>();
  // Several analysis/sequence models still represent one type. Read current outputs rather
  // than historical task successes, which would also count removed or replaced artifacts.
  for (const [key, stage] of [["models", "requirements"], ["designModels", "design"]]) {
    for (const model of Object.values(record(state[key]))) {
      const kind = record(model).diagramKind;
      if (typeof kind === "string") generated.add(`${stage}:${kind}`);
    }
  }
  if (present(state.feasibilityContextModel)) generated.add("feasibility:context");
  if (present(record(state.feasibilityBusinessFlow).model)) generated.add("feasibility:business-flow");
  if (present(state.feasibilityImplementationPlan)) generated.add("feasibility:implementation");
  for (const document of documents) if (document.status !== "deleted") generated.add(`document:${document.documentKind}`);
  const stages = dashboardProgressStages.map(kind => {
    const types = dashboardProgressArtifactTypes.filter(type => type.startsWith(`${kind}:`));
    return { kind, completed: types.filter(type => generated.has(type)).length, total: types.length };
  });
  const completed = stages.reduce((sum, stage) => sum + stage.completed, 0);
  const total = stages.reduce((sum, stage) => sum + stage.total, 0);
  return { completed, total, percentage: total ? Math.round(completed / total * 1000) / 10 : null, stages };
}
