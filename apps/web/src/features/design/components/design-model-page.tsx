// Renders design-stage model generation controls, selection state, and requirement-to-design trace summaries.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DiagramModelSpec } from "@uml-platform/contracts";
import { Network } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { PageContainer, PageHeader } from "../../../shared/template/layout/page";
import { GenerationModelControls } from "../../workspace-session/components/generation-model-controls";
import { ModelingGenerationButton } from "../../../shared/ui/modeling-generation-button";
import {
  FeedbackReopenButton,
  type FeedbackDialogState,
} from "../../../shared/ui/feedback-dialog";
import { localizeRunFailure } from "../../../shared/i18n/api-errors";
import {
  DESIGN_DIAGRAM_META,
  DESIGN_DIAGRAM_ORDER,
  DIAGRAM_META,
  DIAGRAM_ORDER,
  getDesignDiagramDescription,
  getDesignDiagramLabel,
  getDiagramLabel,
  getDesignModelId,
  findRequirementModelByKind,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";

import {
  designInputFingerprint,
} from "../../../shared/lib/fingerprint";
import { useWorkspaceShell } from "../../workspace-shell/state";
import {
  MobileCompactGrid,
} from "../../workspace-shell/components/mobile-density";
import { ModelBentoCard } from "../../workspace-shell/components/model-bento-card";
import { useModelCardStatus } from "../../workspace-shell/lib/use-model-card-status";
import { useWorkspaceSession } from "../../workspace-session/state";
import { hasRequirementSources } from "../../workspace-session/lib/workspace-context";
import { designBlockGuidance } from "../lib/design-feedback";
import { TargetSelectionActions } from "../../workspace-shell/components/target-selection-actions";
import { DESIGN_MODEL_DEPENDENCY_MAP, DESIGN_REQUIREMENT_SOURCE_MAP, planDesignRequirementAutoUpstream, resolveDesignGenerationDiagrams } from "../../workspace-session/lib/generation-planning";
import { missingRequirementRulesReason } from "../../workspace-session/lib/generation-preflight";
import { selectableDesignTargets } from "../lib/design-target-selection";
import { modelGenerationSelectionBlockReason } from "../../workspace-session/lib/model-generation-selection";
import { UpstreamWorkflowIllustration } from "../../workspace-shell/components/upstream-workflow-illustration";
import {
  DESIGN_DIAGRAM_ICON,
  upstreamBaselineState,
  upstreamStateFromAvailability,
  type UpstreamInput,
  type UpstreamInputState,
} from "../../workspace-shell/lib/upstream-dependencies";

const DESIGN_WORKFLOW_ID = "design-upstream-workflow";

function localizeDesignBlockReason(reason: string, t: ReturnType<typeof useTranslation>["t"]) {
  const missingSources = /^缺少上游模型：(.+)，请先生成$/u.exec(reason);
  if (missingSources) {
    const labels = missingSources[1].split("、").map((label) => {
      const requirement = DIAGRAM_ORDER.find((kind) => DIAGRAM_META[kind].label === label);
      if (requirement) return getDiagramLabel(requirement, t);
      const design = DESIGN_DIAGRAM_ORDER.find((kind) => DESIGN_DIAGRAM_META[kind].label === label);
      return design ? getDesignDiagramLabel(design, t) : label;
    });
    return t("designPage.blocked.missingSources", { labels: labels.join(t("workflowIllustration.separator")) });
  }
  if (reason.includes("请先到需求规则表")) return reason;
  if (reason === "请先输入需求文本") {
    return t("designPage.blocked.requirementText");
  }
  if (reason === "请先确认需求规则修复结果") {
    return t("designPage.blocked.pendingRules");
  }
  if (reason === "上游需求模型未通过结构校验，请修复或重新生成后继续设计") {
    return t("designPage.blocked.invalidStructure");
  }
  if (reason === "需求模型追踪关系不完整，请先回到需求页处理") {
    return t("designPage.blocked.traceability");
  }
  if (reason === "设计类图已存在但基于旧需求，请先手动更新设计类图") {
    return t("designPage.blocked.staleDesignClass");
  }
  if (reason === "组件（构件）关系已存在但基于旧需求，请先手动更新组件（构件）关系") {
    return t("designPage.blocked.staleDesignComponent");
  }
  if (reason === "需求阶段用例模型没有可用于设计的用例") {
    return t("designPage.blocked.noUseCases");
  }
  const staleSource = /^已有需求阶段(.+)基于旧规则，请先回到需求页更新$/u.exec(reason);
  if (staleSource?.[1]) {
    const diagram = DIAGRAM_ORDER.find((item) => DIAGRAM_META[item].label === staleSource[1]);
    return t("designPage.blocked.staleSource", {
      label: diagram ? getDiagramLabel(diagram, t) : staleSource[1],
    });
  }
  // Selection conflicts are already localized; preserve concrete reasons instead of replacing them with generic guidance.
  return reason;
}

type RequirementSourceStatus = Record<DiagramType, boolean>;
type RequirementSourceDetails = RequirementSourceStatus & {
  useCaseCount: number;
};

function hasAnalysisModels(models: ReturnType<typeof useWorkspaceSession>["models"]) {
  return Boolean(findRequirementModelByKind(models, "analysis"));
}

function hasPrototypeModels(models: ReturnType<typeof useWorkspaceSession>["models"]) {
  return Boolean(findRequirementModelByKind(models, "prototype"));
}

function sameDesignDiagramSelection(
  left: DesignDiagramType[],
  right: DesignDiagramType[],
) {
  return left.length === right.length && left.every((diagram, index) => diagram === right[index]);
}

function getDesignDiagramBlockReason(
  diagram: DesignDiagramType,
  sourceStatus: RequirementSourceDetails,
) {
  if (
    (diagram === "sequence" || diagram === "class") &&
    sourceStatus.usecase &&
    sourceStatus.useCaseCount === 0
  ) {
    return "需求阶段用例模型没有可用于设计的用例";
  }

  return null;
}

function getUseCasesFromRequirementModel(models: ReturnType<typeof useWorkspaceSession>["models"]) {
  const model = findRequirementModelByKind(models, "usecase");
  return model && "useCases" in model && Array.isArray(model.useCases)
    ? model.useCases
    : [];
}

function currentDesignClassFingerprint(
  designModels: ReturnType<typeof useWorkspaceSession>["designModels"],
  designInputFingerprints: ReturnType<typeof useWorkspaceSession>["designInputFingerprints"],
) {
  const classModel = Object.values(designModels).find(
    (model) => model.diagramKind === "class",
  );
  return classModel
    ? designInputFingerprints[getDesignModelId(classModel)] ?? designInputFingerprints.class
    : designInputFingerprints.class;
}

function currentDesignComponentFingerprint(
  designModels: ReturnType<typeof useWorkspaceSession>["designModels"],
  designInputFingerprints: ReturnType<typeof useWorkspaceSession>["designInputFingerprints"],
) {
  const componentModel = Object.values(designModels).find(
    (model) => model.diagramKind === "component",
  );
  return componentModel
    ? designInputFingerprints[getDesignModelId(componentModel)] ??
        designInputFingerprints.component
    : designInputFingerprints.component;
}

function requirementSourcesForDesign(diagram: DesignDiagramType) {
  return DESIGN_REQUIREMENT_SOURCE_MAP[diagram];
}


export function DesignModelPage() {
  const { t } = useTranslation();
  const { designStatusFor, requirementStatusFor } = useModelCardStatus();
  const {
    rules,
    models,
    selectedDesignDiagrams,
    setSelectedDesignDiagrams,
    designModels,
    designSvgArtifacts,
    requirementModelTraceability,
    manualModelEditStatus,
    autoGeneratedUpstreamReviews,
    designDiagramErrors,
    designInputFingerprints,
    staleDiagrams,
    requirementTraceabilityStale,
    generating,
    generateDesignDiagrams,
    designGenerationBlockedReason,
    rulesVersion,
    textVersion,
    workspaceInitialized,
    generationModelBlockedReason,
    canUpdateWorkspace,
    canStartRuns,
    requirementBaseline,
    isRulesStale,
  } = useWorkspaceSession();
  const {
    openDesignDiagram,
    openRequirementTraceMatrix,
    openRequirementsText,
    openSystemRequirements,
  } = useWorkspaceShell();
  const [inspectedDiagram, setInspectedDiagram] = useState<DesignDiagramType>(DESIGN_DIAGRAM_ORDER[0]);

  const sourceStatus = useMemo(
    () => {
      const useCases = getUseCasesFromRequirementModel(models);
      return {
        context: Boolean(findRequirementModelByKind(models, "context")),
        function: Boolean(findRequirementModelByKind(models, "function")),
        usecase: Boolean(findRequirementModelByKind(models, "usecase")),
        activity: Boolean(findRequirementModelByKind(models, "activity")),
        class: Boolean(findRequirementModelByKind(models, "class")),
        deployment: Boolean(findRequirementModelByKind(models, "deployment")),
        prototype: hasPrototypeModels(models),
        analysis: hasAnalysisModels(models),
        useCaseCount: useCases.length,
      };
    },
    [models],
  );

  const currentDesignInputFingerprint = useMemo(
    () =>
      designInputFingerprint(
        Object.values(models).filter(
          (model): model is DiagramModelSpec => Boolean(model),
        ),
        requirementModelTraceability,
      ),
    [models, requirementModelTraceability],
  );

  const getDesignTargetBlockReason = (diagram: DesignDiagramType, batch: DesignDiagramType[]) => {
    // Selection requires saved upstream models; checking a batch cannot substitute for missing inputs.
    const missingSources = [
      ...requirementSourcesForDesign(diagram).filter(source => !sourceStatus[source]).map(source => DIAGRAM_META[source].label),
      ...DESIGN_MODEL_DEPENDENCY_MAP[diagram]
        .filter(source => !Object.values(designModels).some(model => model.diagramKind === source))
        .map(source => DESIGN_DIAGRAM_META[source].label),
    ];
    if (missingSources.length > 0) return `缺少上游模型：${missingSources.join("、")}，请先生成`;
    // Saved upstreams remain the only source; dependency conflicts are handled separately by selection guards.
    const batchDesignDiagrams = resolveDesignGenerationDiagrams(
      batch, Object.values(designModels).map(model => model.diagramKind),
    ).effectiveDiagrams;
    const designSources = resolveDesignGenerationDiagrams(
      [diagram], Object.values(designModels).map(model => model.diagramKind),
    ).effectiveDiagrams;
    const requirementSources = [...new Set(designSources.flatMap(requirementSourcesForDesign))];
    const baseReason = designSources.map(target => getDesignDiagramBlockReason(target, sourceStatus)).find(Boolean);
    if (baseReason) return baseReason;
    const ruleReason = missingRequirementRulesReason(planDesignRequirementAutoUpstream({
      requestedDesignDiagrams: designSources,
      requirementModels: models, rules,
    }));
    if (ruleReason) return ruleReason;
    for (const source of requirementSources) {
      if (sourceStatus[source] && staleDiagrams.includes(source)) {
        return `已有需求阶段${DIAGRAM_META[source].label}基于旧规则，请先回到需求页更新`;
      }
    }
    const requiredModels = Object.values(models).filter((model) => model &&
      requirementSources.includes(model.diagramKind));
    if (requirementTraceabilityStale && requiredModels.length > 0 && !hasRequirementSources(
      requiredModels, requirementModelTraceability, manualModelEditStatus, requirementSources,
    )) {
      return "需求模型追踪关系不完整，请先回到需求页处理";
    }
    if (
      (diagram === "table" || diagram === "component") &&
      !batchDesignDiagrams.includes("class") &&
      Object.values(designModels).some((model) => model.diagramKind === "class") &&
      (currentDesignClassFingerprint(designModels, designInputFingerprints)) !== currentDesignInputFingerprint
    ) {
      return "设计类图已存在但基于旧需求，请先手动更新设计类图";
    }
    if (
      diagram === "deployment" &&
      !batchDesignDiagrams.includes("component") &&
      Object.values(designModels).some((model) => model.diagramKind === "component") &&
      (currentDesignComponentFingerprint(
          designModels,
          designInputFingerprints,
        )) !== currentDesignInputFingerprint
    ) {
      return "组件（构件）关系已存在但基于旧需求，请先手动更新组件（构件）关系";
    }
    return null;
  };
  const effectiveSelected = selectableDesignTargets(selectedDesignDiagrams, getDesignTargetBlockReason);
  const selectedDesignBlockReason =
    effectiveSelected.map(diagram => modelGenerationSelectionBlockReason("design", diagram, effectiveSelected) ?? getDesignTargetBlockReason(diagram, effectiveSelected)).find(Boolean) ?? null;
  // Keep prerequisite guidance reachable when a blocked card cannot be selected.
  const unselectedPrerequisiteBlockReason = effectiveSelected.length === 0 &&
    Object.values(models).some(Boolean)
      ? DESIGN_DIAGRAM_ORDER.map(diagram => getDesignTargetBlockReason(diagram, effectiveSelected)).find(Boolean) ?? null
      : null;
  const visibleGenerationBlockReason =
    designGenerationBlockedReason ??
    selectedDesignBlockReason ??
    unselectedPrerequisiteBlockReason ??
    (rules.length === 0 && !Object.values(designModels).some(Boolean)
      ? "请先输入并确认系统需求"
      : null);
  const viewableSequenceModel = Object.values(designModels).find(
    (model) =>
      model.diagramKind === "sequence" &&
      Boolean(designSvgArtifacts[getDesignModelId(model)]),
  );
  const localizedGenerationBlockReason = visibleGenerationBlockReason
    ? localizeDesignBlockReason(visibleGenerationBlockReason, t)
    : null;

  useEffect(() => {
    if (!sameDesignDiagramSelection(selectedDesignDiagrams, effectiveSelected)) {
      setSelectedDesignDiagrams(effectiveSelected);
    }
  }, [selectedDesignDiagrams, setSelectedDesignDiagrams, effectiveSelected]);

  const canGenerate =
    !generationModelBlockedReason &&
    !designGenerationBlockedReason &&
    !selectedDesignBlockReason &&
    effectiveSelected.length > 0;
  const toggleDiagram = (diagram: DesignDiagramType, checked: boolean) => {
    if (generating || !canUpdateWorkspace || !canStartRuns) return;
    if (checked && modelGenerationSelectionBlockReason("design", diagram, effectiveSelected)) return;
    const next =
      checked
        ? DESIGN_DIAGRAM_ORDER.filter((item) =>
            new Set([...effectiveSelected, diagram]).has(item),
          )
        : effectiveSelected.filter((item) => item !== diagram);
    setSelectedDesignDiagrams(selectableDesignTargets(next, getDesignTargetBlockReason));
  };

  const runGenerate = () => {
    if (!canGenerate || generating) return;
    void generateDesignDiagrams(effectiveSelected);
  };

  const openFirstSequenceDesign = useCallback(() => {
    if (!viewableSequenceModel) return;
    openDesignDiagram(
      "sequence",
      getDesignModelId(viewableSequenceModel),
      viewableSequenceModel.title,
    );
  }, [openDesignDiagram, viewableSequenceModel]);

  const incompleteTraceabilityDiagram = useMemo(
    () => DIAGRAM_ORDER.find((diagram) => {
      const model = findRequirementModelByKind(models, diagram);
      return model && !hasRequirementSources(
        [model], requirementModelTraceability, manualModelEditStatus,
      );
    }) ?? null,
    [manualModelEditStatus, models, requirementModelTraceability],
  );

  const generationBlockFeedback = useMemo<FeedbackDialogState | null>(() => {
    if (
      !workspaceInitialized ||
      !visibleGenerationBlockReason ||
      !localizedGenerationBlockReason
    ) {
      return null;
    }
    const guidance = designBlockGuidance(visibleGenerationBlockReason);
    const action = (() => {
      switch (guidance.target) {
        case "system-requirements":
          return { label: t("feedback.actions.systemRequirements"), onSelect: openSystemRequirements };
        case "requirement-traceability":
          return incompleteTraceabilityDiagram
            ? {
                label: t("feedback.actions.traceability"),
                onSelect: () => openRequirementTraceMatrix(incompleteTraceabilityDiagram),
              }
            : { label: t("feedback.actions.requirementModels"), onSelect: openRequirementsText };
        case "sequence-design":
          return viewableSequenceModel
            ? { label: t("feedback.actions.sequenceDesign"), onSelect: openFirstSequenceDesign }
            : { label: t("feedback.actions.requirementModels"), onSelect: openRequirementsText };
        case "design-class":
          return { label: t("feedback.actions.designClass"), onSelect: () => openDesignDiagram("class") };
        case "design-component":
          return { label: t("feedback.actions.designComponent"), onSelect: () => openDesignDiagram("component") };
        default:
          return { label: t("feedback.actions.requirementModels"), onSelect: openRequirementsText };
      }
    })();
    return {
      dedupeKey: guidance.dedupeKey,
      revision: `${textVersion}:${rulesVersion}:${currentDesignInputFingerprint}:${visibleGenerationBlockReason}`,
      tone: "warning",
      title: t("designPage.guidance.title"),
      message: localizedGenerationBlockReason,
      primaryAction: action,
      keepReopenEntry: true,
    };
  }, [
    currentDesignInputFingerprint,
    incompleteTraceabilityDiagram,
    localizedGenerationBlockReason,
    openDesignDiagram,
    openFirstSequenceDesign,
    openRequirementTraceMatrix,
    openRequirementsText,
    openSystemRequirements,
    rulesVersion,
    t,
    textVersion,
    viewableSequenceModel,
    visibleGenerationBlockReason,
    workspaceInitialized,
  ]);

  const plannedDesignDiagrams = resolveDesignGenerationDiagrams(
    effectiveSelected, Object.values(designModels).map(model => model.diagramKind),
  ).effectiveDiagrams;
  const plannedRequirementDiagrams = planDesignRequirementAutoUpstream({
    requestedDesignDiagrams: plannedDesignDiagrams,
    requirementModels: models,
    rules,
  }).effectiveDiagrams;
  const resolveUpstreamState = (input: UpstreamInput): UpstreamInputState => {
    switch (input.kind) {
      case "baseline":
        return upstreamBaselineState(requirementBaseline, isRulesStale);
      case "requirement": {
        // Use-case event flows are only usable when the use-case model actually contains use cases.
        const exists = sourceStatus[input.diagram] && (!input.eventFlows || sourceStatus.useCaseCount > 0);
        const status = requirementStatusFor(input.diagram);
        return upstreamStateFromAvailability(exists, staleDiagrams.includes(input.diagram), {
          planned: plannedRequirementDiagrams.includes(input.diagram) || status === "queued",
          running: status === "running",
        });
      }
      case "design": {
        const status = designStatusFor(input.diagram);
        const planned = plannedDesignDiagrams.includes(input.diagram) || status === "queued";
        const changedSource = planned || designStatusFor(inspectedDiagram) === "stale";
        return upstreamStateFromAvailability(
          Object.values(designModels).some((model) => model.diagramKind === input.diagram),
          status === "stale" || changedSource,
          { planned: !changedSource && planned, running: status === "running" },
        );
      }
      default: return "missing";
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-background">
      <PageContainer className="flex flex-col gap-5">
          <PageHeader
            title={t("designPage.title")}
            notice={generationBlockFeedback?.keepReopenEntry ? <FeedbackReopenButton feedback={generationBlockFeedback} /> : null}
            description={t("designPage.description")}
          />

          <div className="min-w-0">
            <main className="flex min-w-0 flex-col gap-4">
              <section id="design-target-models" className="flex min-w-0 flex-col gap-4">
                <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Network className="size-5 text-primary" />
                    <h2 className="text-xl font-semibold tracking-normal text-foreground">
                      {t("designPage.targetModels")}
                    </h2>
                    <Badge
                      variant="secondary"
                      className="border-0 px-3 py-1 font-mono text-xs"
                    >
                      {effectiveSelected.length}/{DESIGN_DIAGRAM_ORDER.length}
                    </Badge>
                    <TargetSelectionActions
                      disabled={generating || !canUpdateWorkspace || !canStartRuns}
                      onSelectAll={() => setSelectedDesignDiagrams(selectableDesignTargets([...effectiveSelected, ...DESIGN_DIAGRAM_ORDER], getDesignTargetBlockReason))}
                      onClear={() => setSelectedDesignDiagrams([])}
                    />
                  </div>
                  <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:shrink-0 sm:overflow-visible sm:pb-0">
                    <GenerationModelControls disabled={generating || !canUpdateWorkspace || !canStartRuns} />
                    <ModelingGenerationButton
                      label={t("common.generate")}
                      busy={generating}
                      onClick={runGenerate}
                      disabled={!canGenerate || generating}
                      title={generationModelBlockedReason ?? designGenerationBlockedReason ?? selectedDesignBlockReason ?? undefined}
                    />
                  </div>
                </div>
                <MobileCompactGrid
                  minWidth={720}
                  variant="model-targets"
                >
                  {DESIGN_DIAGRAM_ORDER.map((diagram) => {
                    const meta = DESIGN_DIAGRAM_META[diagram];
                    const localizedLabel = getDesignDiagramLabel(diagram, t);
                    const localizedDescription = getDesignDiagramDescription(diagram, t);
                    const checked = effectiveSelected.includes(diagram);
                    const selectionBlock = modelGenerationSelectionBlockReason("design", diagram, effectiveSelected);
                    const blockReason = getDesignDiagramBlockReason(
                      diagram,
                      sourceStatus,
                    ) ?? getDesignTargetBlockReason(diagram, effectiveSelected) ?? selectionBlock;
                    const hasPendingAutoReview = Object.values(
                      autoGeneratedUpstreamReviews,
                    ).some(
                      (review) =>
                        review.status === "pending" &&
                        review.artifactType === "design-model" &&
                        review.artifactId === diagram,
                    );
                    const generatedModels = Object.values(designModels).filter(
                      (model) => model.diagramKind === diagram,
                    );
                    const viewableModels = generatedModels.filter((model) =>
                      Boolean(designSvgArtifacts[getDesignModelId(model)]),
                    );
                    const generated = viewableModels.length > 0;
                    const error = designDiagramErrors[diagram];
                    const DiagramIcon = DESIGN_DIAGRAM_ICON[diagram];
                    return (
                      <ModelBentoCard
                        key={diagram}
                        label={localizedLabel}
                        english={meta.english}
                        description={localizedDescription}
                        icon={DiagramIcon}
                        categoryColorIndex={DESIGN_DIAGRAM_ORDER.indexOf(diagram)}
                        selected={checked}
                        disabled={Boolean(blockReason)}
                        blockedReason={blockReason ? localizeDesignBlockReason(blockReason, t) : undefined}
                        countLabel={
                          generated
                            ? viewableModels.length || generatedModels.length
                            : 0
                        }
                        pendingReview={hasPendingAutoReview}
                        ariaLabel={t(checked ? "designPage.deselect" : "designPage.select", { label: localizedLabel })}
                        checkboxLabel={localizedLabel}
                        onSelectedChange={(value) => toggleDiagram(diagram, value)}
                        status={designStatusFor(diagram)}
                        inspected={inspectedDiagram === diagram}
                        onInspect={() => setInspectedDiagram(diagram)}
                        content={
                          <div className="space-y-1.5">
                            {selectionBlock && <p className="text-warning">{selectionBlock}</p>}
                            {error && (
                              <div className="text-destructive">
                                {localizeRunFailure(
                                  error.error,
                                  t("errors.codes.RUN_INTERNAL_ERROR"),
                                )}
                              </div>
                            )}
                          </div>
                        }
                      />
                    );
                  })}
                </MobileCompactGrid>
              </section>

            </main>

          </div>
          <UpstreamWorkflowIllustration
            id={DESIGN_WORKFLOW_ID}
            stage="design"
            target={inspectedDiagram}
            targetLabel={getDesignDiagramLabel(inspectedDiagram, t)}
            targetEnglish={DESIGN_DIAGRAM_META[inspectedDiagram].english}
            targetIcon={DESIGN_DIAGRAM_ICON[inspectedDiagram]}
            targetColorIndex={DESIGN_DIAGRAM_ORDER.indexOf(inspectedDiagram)}
            targetHint={t("designPage.source", { source: t(`designPage.sources.${inspectedDiagram}`) })}
            resolveState={resolveUpstreamState}
          />
      </PageContainer>
    </div>
  );
}
