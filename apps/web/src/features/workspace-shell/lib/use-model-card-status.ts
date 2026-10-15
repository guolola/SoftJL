// Reuses sidebar artifact availability and scoped-model filtering for generation cards.
import { getDesignModelId, getRequirementModelId, type DesignDiagramType, type DiagramType } from "../../../entities/diagram/model";
import { useWorkspaceSession } from "../../workspace-session/state";
import { deriveSidebarDiagramState } from "./sidebar-menu-model";
import { generationCardStatus, modelCardTaskStatus, modelTargetMatches } from "./model-card-status";

export function useModelCardStatus() {
  const session = useWorkspaceSession();
  const state = deriveSidebarDiagramState(session);
  return {
    requirementStatusFor(diagram: DiagramType) {
      const task = modelCardTaskStatus(session.generationTasks, "requirements", diagram);
      return generationCardStatus({
        active: task === "queued" || task === "running" ? task : undefined,
        failed: task === "failed" || Object.keys(session.diagramErrors).some(id => modelTargetMatches(id, diagram, "requirements")),
        stale: session.staleDiagrams.includes(diagram),
        exists: state.requirementModelViewable(diagram) || state.requirementModelsByDiagram[diagram].some(model => state.requirementModelViewable(diagram, getRequirementModelId(model))),
      });
    },
    designStatusFor(diagram: DesignDiagramType) {
      const task = modelCardTaskStatus(session.generationTasks, "design", diagram);
      return generationCardStatus({
        active: task === "queued" || task === "running" ? task : undefined,
        failed: task === "failed" || Object.keys(session.designDiagramErrors).some(id => modelTargetMatches(id, diagram, "design")),
        stale: session.staleDesignDiagrams.includes(diagram) || state.designModelsByDiagram[diagram].some(model => session.staleDesignModelIds.includes(getDesignModelId(model))),
        exists: state.designModelViewable(diagram) || state.designModelsByDiagram[diagram].some(model => state.designModelViewable(diagram, getDesignModelId(model))),
      });
    },
  };
}
