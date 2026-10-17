// Adapts persisted feasibility activity artifacts to the shared diagram detail workspace.
import { useTranslation } from "react-i18next";
import type { FeasibilityBusinessFlowArtifact, RequirementRule } from "@uml-platform/contracts";
import { ModelingGenerationButton } from "../../../shared/ui/modeling-generation-button";
import { GenerationModelControls } from "../../workspace-session/components/generation-model-controls";
import { useWorkspaceSession } from "../../workspace-session/state";
import { BusinessFlowDiagramView, type ContextDiagramSection } from "../../diagrams/components/diagram-detail-page";

export function BusinessFlowView({ artifact, rules, stale, generating, blockedReason, message, error, onGenerate,
  section = "diagram", highlightedElement, highlightedRelationshipId,
}: {
  artifact: FeasibilityBusinessFlowArtifact | null;
  rules: RequirementRule[];
  stale: boolean;
  generating: boolean;
  blockedReason: string | null;
  message: string | null;
  error: string | null;
  onGenerate: () => void;
  section?: ContextDiagramSection;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
}) {
  const { t } = useTranslation();
  const { canUpdateWorkspace, canStartRuns } = useWorkspaceSession();
  return <BusinessFlowDiagramView section={section}
    highlightedElement={highlightedElement} highlightedRelationshipId={highlightedRelationshipId}
    data={{
      model: artifact?.model ?? null,
      plantUmlSource: artifact?.plantUml.source ?? "",
      svgMarkup: artifact?.svg.svg ?? "",
      stale, rules: rules.map((rule) => ({ id: rule.id ?? "", text: rule.text ?? "" })),
      saveStatus: "idle", statusMessage: message, errorMessage: error,
      headerAction: <div className="flex flex-wrap items-center gap-2">
        {blockedReason && <span role="status" className="text-xs text-muted-foreground">{blockedReason}</span>}
        <GenerationModelControls disabled={generating || !canUpdateWorkspace || !canStartRuns} />
        <ModelingGenerationButton label={t("common.generate")} busy={generating}
          onClick={onGenerate} disabled={generating || Boolean(blockedReason)} title={blockedReason ?? undefined} />
      </div>,
    }} />;
}
