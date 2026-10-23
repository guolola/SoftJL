// Composes feasibility overview, context subviews, and the persisted implementation-plan editor.
import {
  PageContainer,
  PageHeader,
} from "../../../shared/template/layout/page";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  contextDiagramSpecSchema,
  readFeasibilityBusinessFlowArtifact,
  type ContextDiagramSpec,
  type FeasibilityArtifactKind,
  type FeasibilityImplementationPlan,
  type FeasibilityInputs,
} from "@uml-platform/contracts";
import { useWorkspaceRepository } from "../../../services/workspace-repository/index";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import {
  ContextDiagramView,
  type ContextDiagramSection,
} from "../../diagrams/components/diagram-detail-page";
import { TraceabilityMatrixPage } from "../../traceability/components/traceability-matrix-page";
import { acceptedFeasibilityRules, feasibilityArtifactState, includeFeasibilityDependencies } from "../lib/feasibility-freshness";
import { buildCrossStageRequirementCoverage } from "../lib/cross-stage-requirement-coverage";
import { buildContextTraceability } from "../lib/context-traceability";
import { useWorkspaceSession } from "../../workspace-session/state";
import { ImplementationPlanDashboard } from "./implementation-plan-dashboard";
import { FeasibilitySupplementsDialog } from "./feasibility-supplements-dialog";
import { ModelBentoCard } from "../../workspace-shell/components/model-bento-card";
import { TargetSelectionActions } from "../../workspace-shell/components/target-selection-actions";
import { MobileCompactGrid } from "../../workspace-shell/components/mobile-density";
import { generationCardStatus } from "../../workspace-shell/lib/model-card-status";
import { GenerationModelControls } from "../../workspace-session/components/generation-model-controls";
import { ModelingGenerationButton } from "../../../shared/ui/modeling-generation-button";
import {
  USER_SETTINGS_CHANGED_EVENT,
  loadUserSettings,
} from "../../../shared/lib/user-settings";
import { ApiClientError } from "../../../services/api-client/index";
import {
  FeedbackReopenButton,
  type FeedbackDialogState,
} from "../../../shared/ui/feedback-dialog";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { BusinessFlowView } from "./business-flow-view";
import { UpstreamWorkflowIllustration } from "../../workspace-shell/components/upstream-workflow-illustration";
import {
  FEASIBILITY_ARTIFACT_ICON,
  FEASIBILITY_ARTIFACT_ORDER,
  upstreamBaselineState,
  upstreamStateFromAvailability,
  type UpstreamInput,
  type UpstreamInputState,
} from "../../workspace-shell/lib/upstream-dependencies";

const FEASIBILITY_WORKFLOW_ID = "feasibility-upstream-workflow";
const FEASIBILITY_ARTIFACT_ENGLISH = {
  context: "System Environment Diagram",
  "business-flow": "Business and System Flow",
  implementation: "Technical Proposed Solution",
} satisfies Record<FeasibilityArtifactKind, string>;

// Supplementary facts are optional; any user-entered fact counts as provided.
function hasSupplementaryFacts(inputs: FeasibilityInputs | null | undefined) {
  return Object.values(inputs ?? {}).some((value) =>
    Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null);
}

export type FeasibilityView =
  | "overview"
  | "business-flow"
  | "business-flow-trace"
  | "business-flow-elements"
  | "business-flow-relations"
  | "context"
  | "trace"
  | "elements"
  | "relations"
  | "implementation";

type ArtifactKind = FeasibilityArtifactKind;

export function FeasibilityPage({
  view,
  highlightedElement,
  highlightedRelationshipId,
  initialCandidateId,
  initialSelectedArtifacts,
}: {
  view: FeasibilityView;
  highlightedElement?: { kind: string; id: string } | null;
  highlightedRelationshipId?: string | null;
  initialCandidateId?: string;
  initialSelectedArtifacts?: FeasibilityArtifactKind[];
}) {
  const { t } = useTranslation();
  const repository = useWorkspaceRepository();
  const { openSystemRequirements, openFeasibilityHome } = useWorkspaceShell();
  const {
    syncFeasibilityArtifacts,
    feasibilityContextSaveStatus,
    setFeasibilityContextSaveStatus,
    canUpdateWorkspace,
    canStartRuns,
    generationModelBlockedReason,
    workspacePermissionReason,
    feasibilityGeneration,
    isRulesStale,
  } = useWorkspaceSession();
  const { workspace, loading, generating, activeArtifacts, failedArtifacts,
    generationMessage, setGenerationMessage, error, setError, lastFailureFeedback, reload, generate } = feasibilityGeneration;
  const [selectedArtifactChoices, setSelectedArtifacts] = useState<ArtifactKind[]>(
    () => initialSelectedArtifacts ?? [],
  );
  const selectedArtifacts = workspace
    ? acceptedFeasibilityRules(workspace).length > 0
      ? includeFeasibilityDependencies(selectedArtifactChoices, feasibilityArtifactState(workspace))
      : []
    : selectedArtifactChoices;
  const [defaultModel, setDefaultModel] = useState(() => loadUserSettings().defaultModel);
  const [inspectedArtifact, setInspectedArtifact] = useState<ArtifactKind>(FEASIBILITY_ARTIFACT_ORDER[0]);
  const [supplementsOpen, setSupplementsOpen] = useState(false);
  const appliedNavigationSelection = useRef<FeasibilityArtifactKind[] | undefined>(undefined);

  // The shell can reuse this page when navigating from solution details to the overview.
  useEffect(() => {
    if (!workspace || !initialSelectedArtifacts || appliedNavigationSelection.current === initialSelectedArtifacts) return;
    appliedNavigationSelection.current = initialSelectedArtifacts;
    setSelectedArtifacts(includeFeasibilityDependencies(initialSelectedArtifacts, feasibilityArtifactState(workspace)));
  }, [initialSelectedArtifacts, workspace]);

  useEffect(() => {
    const syncSettings = () => setDefaultModel(loadUserSettings().defaultModel);
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
  }, []);

  useEffect(() => {
    if (workspace) setSelectedArtifacts((current) => includeFeasibilityDependencies(current, feasibilityArtifactState(workspace)));
  }, [workspace]);

  const saveContext = async (model: ContextDiagramSpec) => {
    if (!workspace || !repository.renderStructuredModel) return;
    setError(null);
    setGenerationMessage(t("feasibility.contextSave.saving"));
    setFeasibilityContextSaveStatus("saving");
    try {
      const parsed = contextDiagramSpecSchema.parse(model);
      validateContextSources(parsed, acceptedFeasibilityRules(workspace).map((rule) => rule.id));
      const contextTraceability = buildContextTraceability(parsed);
      const rendered = await repository.renderStructuredModel(parsed, "feasibility");
      // Persist the validated model and every derived artifact together, so a render failure cannot replace the last valid version.
      await repository.updateFeasibility?.({
        contextModel: parsed,
        contextTraceability,
        contextPlantUml: rendered.plantUmlSource,
        contextSvg: rendered.svg,
        contextFingerprint: feasibilityArtifactState(workspace).currentContextFingerprint,
      });
      await reload();
      setFeasibilityContextSaveStatus("saved");
      setGenerationMessage(t("feasibility.contextSave.saved"));
    } catch (cause) {
      setFeasibilityContextSaveStatus("error");
      setGenerationMessage(null);
      const message = cause instanceof ApiClientError ? cause.message : t("feasibility.errors.saveContext");
      setError(message);
      throw new Error(message);
    }
  };

  const savePlan = async (plan: FeasibilityImplementationPlan, inputs: FeasibilityInputs, planDirty: boolean) => {
    if (!workspace) return;
    const latestWorkspace = await repository.loadWorkspace();
    const editBasis = feasibilityArtifactState({ ...latestWorkspace,
      feasibilityImplementationPlan: workspace.feasibilityImplementationPlan,
      feasibilityImplementationFingerprint: workspace.feasibilityImplementationFingerprint });
    const nextWorkspace = { ...latestWorkspace, feasibilityInputs: inputs, feasibilityImplementationPlan: plan };
    const patch: Parameters<NonNullable<typeof repository.updateFeasibility>>[0] = {
      inputs,
      implementationPlan: plan,
    };
    // Editing an outdated plan must not silently certify a new upstream basis.
    if (planDirty && editBasis.implementationStatus === "ready") {
      patch.implementationFingerprint = feasibilityArtifactState(nextWorkspace).currentImplementationFingerprint;
      nextWorkspace.feasibilityImplementationFingerprint = patch.implementationFingerprint;
    }
    await repository.updateFeasibility?.(patch);
    syncFeasibilityArtifacts(nextWorkspace);
    setGenerationMessage(t("feasibility.workspaceSaved"));
  };

  const supplementsBlockedReason = !canUpdateWorkspace
    ? workspacePermissionReason ?? t("feasibility.supplements.readOnly")
    : generating ? t("feasibility.supplements.waitForGeneration")
      : !repository.updateFeasibility ? t("feasibility.supplements.unavailable") : null;

  const saveSupplements = async (inputs: FeasibilityInputs) => {
    if (!workspace || supplementsBlockedReason || !repository.updateFeasibility) {
      throw new Error(supplementsBlockedReason ?? t("feasibility.supplements.unavailable"));
    }
    try {
      // Facts have their own persistence boundary; model contents and generation fingerprints stay intact.
      await repository.updateFeasibility({ inputs });
      await reload();
      setGenerationMessage(t("feasibility.supplements.saved"));
    } catch (cause) {
      throw new Error(cause instanceof ApiClientError ? cause.message : t("feasibility.supplements.saveFailed"));
    }
  };

  if (loading || !workspace) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{t("feasibility.loading")}</div>;
  }

  const states = feasibilityArtifactState(workspace);
  const crossStageCoverage = buildCrossStageRequirementCoverage(workspace);
  const contextExists = states.contextExists;
  const implementationExists = states.implementationExists;
  const acceptedRules = acceptedFeasibilityRules(workspace);
  const targetSelectionBlocked = generating || !canUpdateWorkspace || !canStartRuns || acceptedRules.length === 0;
  const latestContextExists = contextExists && !states.contextStale;
  const artifactGenerationBlockedReason = !canUpdateWorkspace || !canStartRuns
    ? workspacePermissionReason ?? t("feasibility.runPermissionDenied")
    : acceptedRules.length === 0 ? t("feasibility.prerequisiteRules") : generationModelBlockedReason;
  const generationBlockedReason = artifactGenerationBlockedReason ??
    (selectedArtifacts.length === 0 ? t("feasibility.noArtifactSelected") : null);
  const prerequisiteFeedback: FeedbackDialogState | null =
    acceptedRules.length === 0
      ? {
          dedupeKey: "feasibility:prerequisite:requirements",
          revision: workspace.rulesVersion,
          tone: "warning",
          title: t("feasibility.feedback.prerequisiteTitle"),
          message: t("feasibility.prerequisiteRules"),
          primaryAction: {
            label: t("feedback.actions.systemRequirements"),
            onSelect: openSystemRequirements,
          },
          keepReopenEntry: true,
        }
      : generationModelBlockedReason
        ? {
            dedupeKey: "feasibility:prerequisite:provider",
            revision: defaultModel,
            tone: "warning",
            title: t("feasibility.feedback.prerequisiteTitle"),
            message: generationModelBlockedReason,
            keepReopenEntry: true,
          }
        : null;
  const consistencyFeedback: FeedbackDialogState | null = crossStageCoverage.sourceConsistent
    ? null
    : {
        dedupeKey: "feasibility:source-consistency",
        revision: `${workspace.rulesVersion}:${crossStageCoverage.staleArtifacts.join(",")}:${crossStageCoverage.unknownReferences.join(",")}`,
        tone: "warning",
        title: t("feasibility.sourceConsistency.title"),
        message: [
          crossStageCoverage.staleArtifacts.length > 0 && t("feasibility.sourceConsistency.staleArtifacts", {
            artifacts: crossStageCoverage.staleArtifacts.map((kind) =>
              t(`feasibility.artifact.${kind === "business-flow" ? "businessFlow" : kind}`)).join("、"),
          }),
          crossStageCoverage.unknownReferences.length > 0 && t("feasibility.sourceConsistency.unknownReferences", {
            ids: crossStageCoverage.unknownReferences.join("、"),
          }),
        ].filter(Boolean).join("\n"),
        keepReopenEntry: true,
      };
  const pageFeedbackItems = [
    prerequisiteFeedback,
    error ? lastFailureFeedback : null,
    consistencyFeedback,
  ].filter((feedback): feedback is FeedbackDialogState => Boolean(feedback));
  const pageFeedback: FeedbackDialogState | null = pageFeedbackItems.length > 0
    ? {
        ...pageFeedbackItems[0],
        dedupeKey: `feasibility:page:${pageFeedbackItems.map((item) => item.dedupeKey).join("|")}`,
        message: pageFeedbackItems.map((item) => item.message).join("；"),
        tone: pageFeedbackItems.some((item) => item.tone === "destructive")
          ? "destructive"
          : "warning",
        keepReopenEntry: true,
      }
    : null;
  const toggleArtifact = (artifact: ArtifactKind, selected: boolean) => {
    if (targetSelectionBlocked) return;
    setSelectedArtifacts((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(artifact);
        if (artifact === "implementation") states.missingDependencies.forEach((kind) => next.add(kind));
      } else {
        next.delete(artifact);
        if (artifact === "context" && !latestContextExists) next.delete("implementation");
        if (artifact === "business-flow" && states.businessFlowStatus !== "ready") next.delete("implementation");
      }
      return (["context", "business-flow", "implementation"] as const).filter((item) => next.has(item));
    });
  };
  if (view === "trace") {
    return (
      <TraceabilityMatrixPage
        mode="context"
        contextData={{
          model: workspace.feasibilityContextModel,
          traceability: workspace.feasibilityContextTraceability,
          rules: acceptedRules,
          stale: states.contextStale,
        }}
      />
    );
  }

  if (view === "business-flow-trace") {
    return <TraceabilityMatrixPage mode="business-flow" businessFlowData={{
      artifact: readFeasibilityBusinessFlowArtifact(workspace.feasibilityBusinessFlow),
      rules: acceptedRules, stale: states.businessFlowStale,
    }} />;
  }

  if (view === "business-flow" || view === "business-flow-elements" || view === "business-flow-relations") {
    return <BusinessFlowView artifact={readFeasibilityBusinessFlowArtifact(workspace.feasibilityBusinessFlow)} rules={acceptedRules}
      section={view === "business-flow-elements" ? "elements" : view === "business-flow-relations" ? "relations" : "diagram"}
      highlightedElement={highlightedElement} highlightedRelationshipId={highlightedRelationshipId}
      stale={states.businessFlowStale} message={generationMessage} error={error} />;
  }

  if (view === "context" || view === "elements" || view === "relations") {
    const section: ContextDiagramSection = view === "elements"
      ? "elements"
      : view === "relations"
        ? "relations"
        : "diagram";
    return (
      <ContextDiagramView
        section={section}
        highlightedElement={highlightedElement}
        highlightedRelationshipId={highlightedRelationshipId}
        data={{
          model: workspace.feasibilityContextModel,
          plantUmlSource: workspace.feasibilityContextPlantUml,
          svgMarkup: workspace.feasibilityContextSvg,
          stale: states.contextStale,
          rules: acceptedRules.map((rule) => ({ id: rule.id, text: rule.text })),
          saveStatus: feasibilityContextSaveStatus,
          statusMessage: generationMessage,
          errorMessage: error,
          onSave: saveContext,
        }}
      />
    );
  }

  if (view === "implementation") {
    return (
      <div className="min-h-full bg-background">
        <ImplementationPlanDashboard
          workspace={workspace}
          states={states}
          initialCandidateId={initialCandidateId}
          contextExists={contextExists}
          generating={generating}
          blockedReason={artifactGenerationBlockedReason}
          message={generationMessage}
          errorMessage={error}
          onRegenerate={() => generate(["implementation"])}
          onCompleteDependencies={() => openFeasibilityHome({ initialSelectedArtifacts: includeFeasibilityDependencies(["implementation"], states) })}
          onSave={savePlan}
        />
      </div>
    );
  }

  const pageTitle = t("feasibility.title");
  const artifactLabel = (kind: ArtifactKind) =>
    t(`feasibility.artifact.${kind === "business-flow" ? "businessFlow" : kind}`);
  const resolveUpstreamState = (input: UpstreamInput): UpstreamInputState => {
    switch (input.kind) {
      case "rules": return acceptedRules.length === 0 ? "missing" : isRulesStale ? "stale" : "ready";
      case "baseline": return upstreamBaselineState(workspace.requirementBaseline, isRulesStale);
      case "supplementary": return hasSupplementaryFacts(workspace.feasibilityInputs) ? "ready" : "missing";
      case "feasibility": {
        const status = input.artifact === "context" ? states.contextStatus
          : input.artifact === "business-flow" ? states.businessFlowStatus : states.implementationStatus;
        return upstreamStateFromAvailability(status !== "missing", status === "stale", {
          planned: selectedArtifacts.includes(input.artifact),
          running: activeArtifacts.includes(input.artifact),
        });
      }
      default: return "missing";
    }
  };
  const inspectProps = (kind: ArtifactKind) => ({
    inspected: inspectedArtifact === kind,
    onInspect: () => setInspectedArtifact(kind),
  });

  return (
    <div className="min-h-full bg-background">
      <PageContainer className="flex flex-col gap-5">
        <PageHeader
          title={pageTitle}
          notice={pageFeedback ? (
            <FeedbackReopenButton
              feedback={pageFeedback}
              label={t("feedback.needsAttentionCount", { count: pageFeedbackItems.length })}
            />
          ) : null}
          description={t("feasibility.overviewDescription")}
        />

        <Card as="section" size="sm" aria-labelledby="feasibility-supplements-title" className="gap-3 px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 id="feasibility-supplements-title" className="font-semibold">{t("feasibility.supplements.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("feasibility.supplements.overviewDescription")}</p>
            </div>
            <Button variant="outline" disabled={Boolean(supplementsBlockedReason)} onClick={() => {
              if (!supplementsBlockedReason) setSupplementsOpen(true);
            }}>{t("feasibility.supplements.edit")}</Button>
          </div>
          {supplementsBlockedReason && <p className="text-sm text-muted-foreground">{supplementsBlockedReason}</p>}
        </Card>
        {supplementsOpen && <FeasibilitySupplementsDialog
          inputs={workspace.feasibilityInputs}
          blockedReason={supplementsBlockedReason}
          onSave={saveSupplements}
          onClose={() => setSupplementsOpen(false)}
        />}

        <section className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{t("feasibility.targetArtifacts")}</h2>
              <Badge variant="secondary" className="font-mono">
                {selectedArtifacts.length}/3
              </Badge>
              <TargetSelectionActions
                disabled={targetSelectionBlocked}
                onSelectAll={() => {
                  if (targetSelectionBlocked) return;
                  setSelectedArtifacts(["context", "business-flow", "implementation"]);
                }}
                onClear={() => {
                  if (generating || !canUpdateWorkspace || !canStartRuns) return;
                  setSelectedArtifacts([]);
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {generationMessage && <span aria-live="polite" className="text-xs text-muted-foreground">{generationMessage}</span>}
            <GenerationModelControls disabled={generating || !canUpdateWorkspace || !canStartRuns} />
            <ModelingGenerationButton
              label={t("common.generate")}
              busy={generating}
              onClick={() => void generate(selectedArtifacts)}
              disabled={generating || Boolean(generationBlockedReason)}
              title={generationBlockedReason ?? undefined}
            />
          </div>
        </section>

        {artifactGenerationBlockedReason && <p role="status" className="text-sm text-muted-foreground">{artifactGenerationBlockedReason}</p>}
        <MobileCompactGrid variant="model-targets">
          <ModelBentoCard
            label={t("feasibility.artifact.context")}
            english={FEASIBILITY_ARTIFACT_ENGLISH.context}
            description={t("feasibility.artifact.contextDescription")}
            icon={FEASIBILITY_ARTIFACT_ICON.context}
            {...inspectProps("context")}
            categoryColorIndex={0}
            selected={selectedArtifacts.includes("context")}
            disabled={targetSelectionBlocked}
            countLabel={workspace.feasibilityContextTraceability.length}
            ariaLabel={t(selectedArtifacts.includes("context") ? "feasibility.selection.deselectContext" : "feasibility.selection.selectContext")}
            checkboxLabel={t("feasibility.selection.selectContext")}
            onSelectedChange={(selected) => toggleArtifact("context", selected)}
            status={generationCardStatus({ exists: contextExists, stale: states.contextStale, active: activeArtifacts.includes("context") ? "running" : undefined, failed: failedArtifacts.includes("context") })}
          />
          <ModelBentoCard
            label={t("feasibility.artifact.businessFlow")}
            english={FEASIBILITY_ARTIFACT_ENGLISH["business-flow"]}
            description={t("feasibility.artifact.businessFlowDescription")}
            icon={FEASIBILITY_ARTIFACT_ICON["business-flow"]}
            {...inspectProps("business-flow")}
            categoryColorIndex={1}
            selected={selectedArtifacts.includes("business-flow")}
            disabled={targetSelectionBlocked}
            countLabel={workspace.feasibilityBusinessFlow?.model.nodes.filter((node) => node.type === "activity").length ?? 0}
            ariaLabel={t(selectedArtifacts.includes("business-flow") ? "feasibility.selection.deselectBusinessFlow" : "feasibility.selection.selectBusinessFlow")}
            checkboxLabel={t("feasibility.selection.selectBusinessFlow")}
            onSelectedChange={(selected) => toggleArtifact("business-flow", selected)}
            status={generationCardStatus({ exists: states.businessFlowExists, stale: states.businessFlowStale, active: activeArtifacts.includes("business-flow") ? "running" : undefined, failed: failedArtifacts.includes("business-flow") })}
          />
          <ModelBentoCard
            label={t("feasibility.artifact.implementation")}
            english={FEASIBILITY_ARTIFACT_ENGLISH.implementation}
            description={t("feasibility.artifact.implementationArtifactDescription")}
            icon={FEASIBILITY_ARTIFACT_ICON.implementation}
            {...inspectProps("implementation")}
            categoryColorIndex={2}
            selected={selectedArtifacts.includes("implementation")}
            disabled={targetSelectionBlocked}
            countLabel={workspace.feasibilityImplementationPlan?.candidates.length ?? 0}
            ariaLabel={t(selectedArtifacts.includes("implementation") ? "feasibility.selection.deselectImplementation" : "feasibility.selection.selectImplementation")}
            checkboxLabel={t("feasibility.selection.selectImplementation")}
            onSelectedChange={(selected) => toggleArtifact("implementation", selected)}
            status={generationCardStatus({ exists: implementationExists, stale: states.implementationStale, active: activeArtifacts.includes("implementation") ? "running" : undefined, failed: failedArtifacts.includes("implementation") })}
          />
        </MobileCompactGrid>
        <UpstreamWorkflowIllustration
          id={FEASIBILITY_WORKFLOW_ID}
          stage="feasibility"
          target={inspectedArtifact}
          targetLabel={artifactLabel(inspectedArtifact)}
          targetEnglish={FEASIBILITY_ARTIFACT_ENGLISH[inspectedArtifact]}
          targetIcon={FEASIBILITY_ARTIFACT_ICON[inspectedArtifact]}
          targetColorIndex={FEASIBILITY_ARTIFACT_ORDER.indexOf(inspectedArtifact)}
          rules={acceptedRules}
          resolveState={resolveUpstreamState}
        />
      </PageContainer>
    </div>
  );
}

function validateContextSources(model: ContextDiagramSpec, validRuleIds: string[]) {
  const validIds = new Set(validRuleIds);
  const elements = [model.system, ...model.people, ...model.externalSystems];
  const elementIds = new Set<string>();
  for (const element of elements) {
    if (elementIds.has(element.id)) throw new Error(`上下文元素标识重复：${element.id}`);
    elementIds.add(element.id);
  }
  if (model.system.id !== "system") throw new Error("中心系统标识必须保持为 system。");
  for (const target of [...model.people, ...model.externalSystems, ...model.relationships]) {
    const invalid = target.sourceRequirementIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) throw new Error(`来源需求规则已失效：${invalid.join("、")}`);
  }
  for (const relation of model.relationships) {
    if (!elementIds.has(relation.sourceId) || !elementIds.has(relation.targetId)) {
      throw new Error(`关系 ${relation.label} 存在无效端点。`);
    }
  }
}
