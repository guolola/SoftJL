// Adapts persisted feasibility activity artifacts to the shared diagram detail workspace.
import type { FeasibilityBusinessFlowArtifact, RequirementRule } from "@uml-platform/contracts";
import { BusinessFlowDiagramView, type ContextDiagramSection } from "../../diagrams/components/diagram-detail-page";

export function BusinessFlowView({ artifact, rules, stale, message, error,
  section = "diagram", highlightedElement, highlightedRelationshipId,
}: {
  artifact: FeasibilityBusinessFlowArtifact | null;
  rules: RequirementRule[];
  stale: boolean;
  message: string | null;
  error: string | null;
  section?: ContextDiagramSection;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
}) {
  return <BusinessFlowDiagramView section={section}
    highlightedElement={highlightedElement} highlightedRelationshipId={highlightedRelationshipId}
    data={{
      model: artifact?.model ?? null,
      plantUmlSource: artifact?.plantUml.source ?? "",
      svgMarkup: artifact?.svg.svg ?? "",
      stale, rules: rules.map((rule) => ({ id: rule.id ?? "", text: rule.text ?? "" })),
      saveStatus: "idle", statusMessage: message, errorMessage: error,
    }} />;
}
