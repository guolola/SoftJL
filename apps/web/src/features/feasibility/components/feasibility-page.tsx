// Composes feasibility overview, context subviews, and the persisted implementation-plan editor.
import {
  PageContainer,
  PageHeader,
} from "../../../shared/template/layout/page";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Network,
  RefreshCw,
  Wrench,
  Wand2,
} from "lucide-react";
import {
  contextDiagramSpecSchema,
  readFeasibilityBusinessFlowArtifact,
  type ContextDiagramSpec,
  type FeasibilityArtifactKind,
  type FeasibilityImplementationPlan,
  type FeasibilityInputs,
} from "@uml-platform/contracts";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
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
import { ModelBentoCard } from "../../workspace-shell/components/model-bento-card";
import { MobileCompactGrid } from "../../workspace-shell/components/mobile-density";
import { generationCardStatus } from "../../workspace-shell/lib/model-card-status";
import { ModelPicker } from "../../../shared/ui/model-picker";
import {
  USER_SETTINGS_CHANGED_EVENT,
  loadUserSettings,
  patchUserSettings,
} from "../../../shared/lib/user-settings";
import { generationModelBlockedReason as readGenerationModelBlockedReason } from "../../../shared/lib/generation-model";
import { createStartFeasibilityRunInput } from "../../../services/workspace-repository/start-inputs";
import { ApiClientError } from "../../../services/api-client";
import { localizeApiFailure } from "../../../shared/i18n/api-errors";
import {
  FeedbackReopenButton,
  useFeedbackDialog,
  type FeedbackDialogState,
} from "../../../shared/ui/feedback-dialog";
import { generationResultFeedback } from "../../workspace-session/components/generation-dialogs";
import { failedRunResultDialog } from "../../workspace-session/lib/generation-dialog-actions";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { BusinessFlowView } from "./business-flow-view";

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const { openFeedback } = useFeedbackDialog();
  const { openSystemRequirements, openFeasibilityHome } = useWorkspaceShell();
  const {
    syncFeasibilityArtifacts,
    feasibilityContextSaveStatus,
    setFeasibilityContextSaveStatus,
    canUpdateWorkspace,
    canStartRuns,
    generationExecutionMode,
    generationModelBlockedReason,
    workspacePermissionReason,
    beginFeasibilityGenerationTask,
    attachFeasibilityGenerationRun,
    updateFeasibilityGenerationTask,
    failFeasibilityGenerationTask,
  } = useWorkspaceSession();
  const [workspace, setWorkspace] = useState<WorkspaceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactKind[]>([]);
  const [failedArtifacts, setFailedArtifacts] = useState<ArtifactKind[]>([]);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFailureFeedback, setLastFailureFeedback] =
    useState<FeedbackDialogState | null>(null);
  const [selectedArtifacts, setSelectedArtifacts] = useState<ArtifactKind[]>(
    () => initialSelectedArtifacts ?? [],
  );
  const [defaultModel, setDefaultModel] = useState(() => loadUserSettings().defaultModel);
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

  const reload = useCallback(async () => {
    const next = await repository.loadWorkspace();
    setWorkspace(next);
    setSelectedArtifacts((current) => includeFeasibilityDependencies(current, feasibilityArtifactState(next)));
    syncFeasibilityArtifacts(next);
    setLoading(false);
  }, [repository, syncFeasibilityArtifacts]);

  useEffect(() => {
    void reload().catch((cause) => {
      setError(cause instanceof ApiClientError ? cause.message : t("feasibility.errors.load"));
      setLoading(false);
    });
  }, [reload, t]);

  const generate = async (selectedArtifacts: ArtifactKind[]) => {
    // Mirror the UI prerequisites for every entry point, including detail-view regeneration.
    if (generating || !workspace) return;
    const blockedReason = !canUpdateWorkspace || !canStartRuns
      ? workspacePermissionReason ?? t("feasibility.runPermissionDenied")
      : acceptedFeasibilityRules(workspace).length === 0 ? t("feasibility.prerequisiteRules")
        : readGenerationModelBlockedReason(generationExecutionMode) ??
          (selectedArtifacts.length === 0 ? t("feasibility.noArtifactSelected") : null);
    if (blockedReason) { setError(blockedReason); return; }
    if (selectedArtifacts.includes("implementation") &&
      feasibilityArtifactState(workspace).missingDependencies.some((kind) => !selectedArtifacts.includes(kind))) {
      setError(t("feasibility.dependencies.required"));
      return;
    }
    if (!repository.startFeasibilityRun || !repository.getFeasibilityRunSnapshot) {
      const message = t("feasibility.repositoryUnsupported");
      setError(message);
      const feedback: FeedbackDialogState = {
        dedupeKey: "feasibility:unsupported",
        tone: "destructive",
        title: t("feasibility.feedback.failureTitle"),
        message,
      };
      setLastFailureFeedback(feedback);
      openFeedback(feedback);
      return;
    }
    setGenerating(true);
    setActiveArtifacts(selectedArtifacts);
    setFailedArtifacts((current) => current.filter((artifact) => !selectedArtifacts.includes(artifact)));
    setError(null);
    let currentArtifact: ArtifactKind = selectedArtifacts[0] ?? "context";
    let clientTaskId: string | null = null;
    let runId: string | null = null;
    let runFailureMessage: string | null = null;
    try {
      const input = createStartFeasibilityRunInput(selectedArtifacts, generationExecutionMode);
      clientTaskId = beginFeasibilityGenerationTask({
        providerModel: input.providerSettings.model,
        startedAtMs: Date.now(),
      });
      ({ runId } = await repository.startFeasibilityRun(input));
      attachFeasibilityGenerationRun(
        clientTaskId,
        runId,
        input.providerSettings.model,
      );
      if (repository.subscribeToFeasibilityRun) {
        await repository.subscribeToFeasibilityRun(runId, (event) => {
          if (clientTaskId) updateFeasibilityGenerationTask(clientTaskId, event);
          if (event.type === "stage_started" || event.type === "stage_progress") {
            if (event.stage === "generate_implementation") currentArtifact = "implementation";
            else if (event.stage === "generate_business_flow" || event.stage === "render_business_flow") currentArtifact = "business-flow";
            else if (event.stage === "generate_context" || event.stage === "render_context") currentArtifact = "context";
            setGenerationMessage(
              currentArtifact === "business-flow"
                ? t("feasibility.generation.businessFlow")
                : event.stage === "generate_context"
                ? t("feasibility.generation.context")
                : event.stage === "render_context"
                  ? t("feasibility.generation.rendering")
                  : event.stage === "generate_implementation"
                    ? t("feasibility.generation.implementation")
                    : t("feasibility.generation.waiting"),
            );
          }
          if (event.type === "failed") {
            runFailureMessage = localizeApiFailure({ error: event.error }, 500);
            setError(runFailureMessage);
          }
        });
        if (runFailureMessage) throw new Error(runFailureMessage);
      } else {
        while (true) {
          const snapshot = await repository.getFeasibilityRunSnapshot(runId);
          if (snapshot.currentStage === "generate_implementation") currentArtifact = "implementation";
          else if (snapshot.currentStage === "generate_business_flow" || snapshot.currentStage === "render_business_flow") currentArtifact = "business-flow";
          else if (snapshot.currentStage === "generate_context" || snapshot.currentStage === "render_context") currentArtifact = "context";
          if (snapshot.status === "completed") break;
          if (snapshot.status === "failed" || snapshot.status === "cancelled") {
            runFailureMessage = snapshot.status === "cancelled"
              ? t("feasibility.errors.cancelled")
              : localizeApiFailure(snapshot.error ? { error: snapshot.error } : null, 500);
            throw new Error(runFailureMessage);
          }
          await sleep(700);
        }
      }
      await sleep(200);
      await reload();
      window.dispatchEvent(
        new CustomEvent("uml-generation-completed", {
          detail: { kind: "feasibility", selectedArtifacts },
        }),
      );
      setGenerationMessage(t("feasibility.generation.completed"));
      setLastFailureFeedback(null);
      openFeedback({
        dedupeKey: "feasibility:generation:completed",
        revision: runId,
        tone: "success",
        title: t("feasibility.feedback.successTitle"),
        message: t("feasibility.feedback.successMessage", {
          count: selectedArtifacts.length,
        }),
      });
    } catch (cause) {
      const message = runFailureMessage
        ?? (cause instanceof ApiClientError ? cause.message : t("feasibility.errors.generate"));
      if (clientTaskId) failFeasibilityGenerationTask(clientTaskId, message);
      setFailedArtifacts((current) => Array.from(new Set([...current, currentArtifact])));
      await reload().catch(() => undefined);
      setGenerationMessage(null);
      setError(message);
      const feedback = generationResultFeedback(
        failedRunResultDialog({
          clientTaskId,
          message,
          runId,
          stageLabel: t("feasibility.title"),
        }),
      );
      setLastFailureFeedback(feedback);
      openFeedback(feedback);
    } finally {
      setGenerating(false);
      setActiveArtifacts([]);
    }
  };

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
    // Editing a stale or legacy plan must not silently certify a new upstream basis.
    if (planDirty && editBasis.implementationStatus === "ready") {
      patch.implementationFingerprint = feasibilityArtifactState(nextWorkspace).currentImplementationFingerprint;
      nextWorkspace.feasibilityImplementationFingerprint = patch.implementationFingerprint;
    }
    await repository.updateFeasibility?.(patch);
    setWorkspace(nextWorkspace);
    syncFeasibilityArtifacts(nextWorkspace);
    setGenerationMessage(t("feasibility.workspaceSaved"));
  };

  if (loading || !workspace) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{t("feasibility.loading")}</div>;
  }

  const states = feasibilityArtifactState(workspace);
  const crossStageCoverage = buildCrossStageRequirementCoverage(workspace);
  const contextExists = states.contextExists;
  const implementationExists = states.implementationExists;
  const acceptedRules = acceptedFeasibilityRules(workspace);
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
        revision: `${workspace.rulesVersion}:${crossStageCoverage.unknownReferences.join(",")}:${crossStageCoverage.explicitAssumptions}`,
        tone: "warning",
        title: t("feasibility.sourceConsistency.title"),
        message: [
          t("feasibility.sourceConsistency.coverage", {
            covered: crossStageCoverage.rows.filter((row) =>
              row.context || row.implementation || row.requirementModel || row.designModel).length,
            total: crossStageCoverage.rows.length,
          }),
          t("feasibility.sourceConsistency.assumptions", {
            count: crossStageCoverage.explicitAssumptions,
          }),
          t("feasibility.sourceConsistency.disclaimer"),
        ].join("；"),
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
    if (generating) return;
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
  const updateModel = (model: string) => {
    setDefaultModel(model);
    patchUserSettings({ defaultModel: model });
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
    const blockedReason = artifactGenerationBlockedReason;
    return <BusinessFlowView artifact={readFeasibilityBusinessFlowArtifact(workspace.feasibilityBusinessFlow)} rules={acceptedRules}
      section={view === "business-flow-elements" ? "elements" : view === "business-flow-relations" ? "relations" : "diagram"}
      highlightedElement={highlightedElement} highlightedRelationshipId={highlightedRelationshipId}
      stale={states.businessFlowStale} generating={generating} blockedReason={blockedReason}
      message={generationMessage} error={error} onGenerate={() => void generate(["business-flow"])} />;
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
          headerAction: (
            <div className="flex flex-wrap items-center gap-2">
            {artifactGenerationBlockedReason && <span role="status" className="text-xs text-muted-foreground">{artifactGenerationBlockedReason}</span>}
            <Button
              type="button"
              onClick={() => void generate(["context"])}
              disabled={generating || Boolean(artifactGenerationBlockedReason)}
              title={artifactGenerationBlockedReason ?? undefined}
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {contextExists ? t("feasibility.regenerate") : t("feasibility.generate")}
            </Button>
            </div>
          ),
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

        <section className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{t("feasibility.targetArtifacts")}</h2>
              <Badge variant="secondary" className="font-mono">
                {selectedArtifacts.length}/3
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {generationMessage && <span aria-live="polite" className="text-xs text-muted-foreground">{generationMessage}</span>}
            <ModelPicker
              value={defaultModel}
              onValueChange={updateModel}
              align="end"
              disabled={generating || !canUpdateWorkspace || !canStartRuns}
              triggerClassName="bg-card"
            />
            <Button
              type="button"
              onClick={() => void generate(selectedArtifacts)}
              disabled={generating || Boolean(generationBlockedReason)}
              title={generationBlockedReason ?? undefined}
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {t("feasibility.generateAnalysis")}
            </Button>
          </div>
        </section>

        {artifactGenerationBlockedReason && <p role="status" className="text-sm text-muted-foreground">{artifactGenerationBlockedReason}</p>}
        <MobileCompactGrid variant="model-targets">
          <ModelBentoCard
            label={t("feasibility.artifact.context")}
            english="System Environment Diagram"
            description={t("feasibility.artifact.contextDescription")}
            icon={Network}
            categoryColorIndex={0}
            selected={selectedArtifacts.includes("context")}
            disabled={generating || !canUpdateWorkspace || !canStartRuns}
            countLabel={workspace.feasibilityContextTraceability.length}
            ariaLabel={t(selectedArtifacts.includes("context") ? "feasibility.selection.deselectContext" : "feasibility.selection.selectContext")}
            checkboxLabel={t("feasibility.selection.selectContext")}
            onSelectedChange={(selected) => toggleArtifact("context", selected)}
            status={generationCardStatus({ exists: contextExists, stale: states.contextStale, active: activeArtifacts.includes("context") ? "running" : undefined, failed: failedArtifacts.includes("context") })}
          />
          <ModelBentoCard
            label={t("feasibility.artifact.businessFlow")}
            english="Business and System Flow"
            description={t("feasibility.artifact.businessFlowDescription")}
            icon={Network}
            categoryColorIndex={1}
            selected={selectedArtifacts.includes("business-flow")}
            disabled={generating || !canUpdateWorkspace || !canStartRuns}
            countLabel={workspace.feasibilityBusinessFlow?.model.nodes.filter((node) => node.type === "activity").length ?? 0}
            ariaLabel={t(selectedArtifacts.includes("business-flow") ? "feasibility.selection.deselectBusinessFlow" : "feasibility.selection.selectBusinessFlow")}
            checkboxLabel={t("feasibility.selection.selectBusinessFlow")}
            onSelectedChange={(selected) => toggleArtifact("business-flow", selected)}
            status={generationCardStatus({ exists: states.businessFlowExists, stale: states.businessFlowStale, active: activeArtifacts.includes("business-flow") ? "running" : undefined, failed: failedArtifacts.includes("business-flow") })}
          />
          <ModelBentoCard
            label={t("feasibility.artifact.implementation")}
            english="Technical Proposed Solution"
            description={t("feasibility.artifact.implementationArtifactDescription")}
            icon={Wrench}
            categoryColorIndex={2}
            selected={selectedArtifacts.includes("implementation")}
            disabled={generating || !canUpdateWorkspace || !canStartRuns}
            countLabel={workspace.feasibilityImplementationPlan?.candidates.length ?? 0}
            ariaLabel={t(selectedArtifacts.includes("implementation") ? "feasibility.selection.deselectImplementation" : "feasibility.selection.selectImplementation")}
            checkboxLabel={t("feasibility.selection.selectImplementation")}
            onSelectedChange={(selected) => toggleArtifact("implementation", selected)}
            status={generationCardStatus({ exists: implementationExists, stale: states.implementationStale, active: activeArtifacts.includes("implementation") ? "running" : undefined, failed: failedArtifacts.includes("implementation") })}
          />
        </MobileCompactGrid>
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
