// Computes generation preflight blockers and dependency plans without mutating session state.
import {
  designDiagramKindFromRecordKey,
  validateModelInput,
  type DiagramModelSpec,
  type RequirementBaseline,
} from "@uml-platform/contracts";
import type {
  DesignDiagramType,
  DiagramType,
} from "../../../entities/diagram/model";
import { getDesignModelId, findRequirementModelByKind } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { GenerationResultDialogState } from "../components/generation-dialogs";
import { i18n } from "../../../shared/i18n/i18n";
import {
  requestOpenProjectWorkspaceTarget,
  type ProjectWorkspaceTarget,
} from "../../../shared/lib/app-navigation";
import {
  DESIGN_REQUIREMENT_SOURCE_MAP,
  collectExistingDesignDiagramKinds,
  diagramLabels,
  hasRequirementModelKind,
  orderedDesignDiagrams,
  orderedRequirementDiagrams,
  planDesignRequirementAutoUpstream,
  planRequirementAutoUpstream,
  resolveDesignGenerationDiagrams,
  type RequirementAutoUpstreamPlan,
} from "./generation-planning";
import {
  currentDesignComponentFingerprint,
  currentDesignClassFingerprint,
  designFingerprintMatches,
  designInputFingerprintFor,
  fingerprintMatches,
  hasCompleteRequirementTraceability,
  isRequirementDiagramStale,
  requirementInputFingerprintFor,
  sequenceModelsCoverUseCases,
} from "./workspace-context";

type PreflightBlock = Pick<
  GenerationResultDialogState,
  "title" | "tone" | "message" | "stageLabel" | "targetLabel" | "primaryAction"
>;

function openWorkspaceAction(target: ProjectWorkspaceTarget, labelKey: "systemRequirements" | "requirementModels" | "designModels") {
  return {
    label: i18n.t(`feedback.actions.${labelKey}`),
    onSelect: () => requestOpenProjectWorkspaceTarget(target),
  };
}

type RequirementGenerationPreflight =
  | { status: "empty" }
  | { status: "blocked"; block: PreflightBlock }
  | {
      status: "ready";
      activeRequirementFingerprint: string;
      diagrams: DiagramType[];
      plan: RequirementAutoUpstreamPlan;
    };

type DesignGenerationPreflight =
  | { status: "empty" }
  | { status: "blocked"; block: PreflightBlock }
  | {
      status: "ready";
      existingDesignDiagrams: DesignDiagramType[];
      requestedDiagrams: DesignDiagramType[];
      requirementPlan: RequirementAutoUpstreamPlan;
    };

interface SharedRequirementPreflightInput {
  diagramInputFingerprints: WorkspaceRecord["diagramInputFingerprints"];
  diagramVersions: WorkspaceRecord["diagramVersions"];
  generatedDiagrams: DiagramType[];
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"];
  models: WorkspaceRecord["models"];
  requirementBaseline: RequirementBaseline | null;
  requirementInputFingerprint: string | null;
  requirementModelTraceability: WorkspaceRecord["requirementModelTraceability"];
  requirementReviewCandidates: WorkspaceRecord["requirementReviewCandidates"];
  requirementText: string;
  rules: RequirementRule[];
  rulesBasedOnTextVersion: number | null;
  rulesVersion: number;
  textVersion: number;
}

interface RequirementGenerationPreflightInput
  extends SharedRequirementPreflightInput {
  selectedDiagrams: DiagramType[];
  only?: DiagramType[];
}

interface DesignGenerationPreflightInput extends SharedRequirementPreflightInput {
  designDiagramErrors: WorkspaceRecord["designDiagramErrors"];
  designInputFingerprints: WorkspaceRecord["designInputFingerprints"];
  designModels: WorkspaceRecord["designModels"];
  designSvgArtifacts: WorkspaceRecord["designSvgArtifacts"];
  only?: DesignDiagramType[];
  selectedDesignDiagrams: DesignDiagramType[];
}

function staleRulesBlock(targetLabel: string): PreflightBlock {
  return {
    title: "需求规则已过期",
    tone: "warning",
    message: "需求规则已过期，请先手动更新需求规则",
    stageLabel: "需求规则",
    targetLabel,
    primaryAction: openWorkspaceAction("system-requirements", "systemRequirements"),
  };
}

function invalidStructureBlock(models: unknown[], stage: "requirements" | "design", targetLabel: string): PreflightBlock | null {
  const count = models.flatMap((model) => validateModelInput(model, stage).filter((issue) => issue.severity === "error")).length;
  if (!count) return null;
  return {
    title: "上游模型结构需修复", tone: "warning",
    message: i18n.t("errors.codes.MODEL_STRUCTURE_INVALID", { count }),
    stageLabel: stage === "requirements" ? "需求模型" : "设计模型", targetLabel,
    primaryAction: stage === "requirements"
      ? openWorkspaceAction("requirement-models", "requirementModels")
      : openWorkspaceAction("design-models", "designModels"),
  };
}

function designDiagramHasError(
  diagramErrors: WorkspaceRecord["designDiagramErrors"],
  diagram: DesignDiagramType,
) {
  return Object.keys(diagramErrors).some((id) => {
    if (id === diagram) return true;
    if (id.startsWith(`${diagram}:`)) return true;
    return designDiagramKindFromRecordKey(id) === diagram;
  });
}

function designDiagramHasViewableArtifact(
  input: Pick<DesignGenerationPreflightInput, "designModels" | "designSvgArtifacts">,
  diagram: DesignDiagramType,
) {
  return Object.values(input.designModels)
    .filter((model) => model.diagramKind === diagram)
    .some((model) => Boolean(input.designSvgArtifacts[getDesignModelId(model)]));
}

function requestedDesignDiagramsForPreflight(
  input: DesignGenerationPreflightInput,
) {
  const requestedDiagrams = orderedDesignDiagrams(
    input.only ?? input.selectedDesignDiagrams,
  );
  const shouldResumeFailedBatch =
    requestedDiagrams.length > 1 &&
    Object.keys(input.designDiagramErrors).length > 0;
  if (!shouldResumeFailedBatch) return requestedDiagrams;

  return requestedDiagrams.filter((diagram) => {
    if (designDiagramHasError(input.designDiagramErrors, diagram)) return true;
    if (
      diagram === "sequence" &&
      !sequenceModelsCoverUseCases(input.designModels, findRequirementModelByKind(input.models, "usecase"))
    ) {
      return true;
    }
    return !designDiagramHasViewableArtifact(input, diagram);
  });
}

function hasStaleRules(input: SharedRequirementPreflightInput) {
  const activeRequirementFingerprint = requirementInputFingerprintFor(
    input.requirementText,
    input.rules,
  );
  const stale =
    input.rules.length > 0 &&
    (input.requirementInputFingerprint
      ? !fingerprintMatches(
          input.requirementInputFingerprint,
          activeRequirementFingerprint,
        )
      : input.rulesBasedOnTextVersion !== null &&
        input.rulesBasedOnTextVersion !== input.textVersion);
  return { activeRequirementFingerprint, stale };
}

export function analyzeRequirementGenerationPreflight(
  input: RequirementGenerationPreflightInput,
): RequirementGenerationPreflight {
  const diagrams = orderedRequirementDiagrams(input.only ?? input.selectedDiagrams);
  if (diagrams.length === 0) {
    return { status: "empty" };
  }
  const { activeRequirementFingerprint, stale } = hasStaleRules(input);
  if (stale) {
    return { status: "blocked", block: staleRulesBlock("已选需求模型") };
  }
  // Regeneration may replace an invalid source; analysis alone must consume a valid saved use case.
  if (diagrams.includes("analysis") && !diagrams.includes("usecase")) {
    const source = findRequirementModelByKind(input.models, "usecase");
    const block = source && invalidStructureBlock([source], "requirements", "用例分析模型");
    if (block) return { status: "blocked", block };
  }
  const plan = planRequirementAutoUpstream({
    requestedDiagrams: diagrams,
    existingModels: input.models,
    rules: input.rules,
  });
  if (plan.needsRulesRun && input.rules.length === 0 && !input.requirementText.trim()) {
    return {
      status: "blocked",
      block: {
        title: "缺少需求来源",
        tone: "warning",
        message: "缺少需求来源，无法自动生成需求规则",
        stageLabel: "需求规则",
        targetLabel: "已选需求模型",
        primaryAction: openWorkspaceAction("system-requirements", "systemRequirements"),
      },
    };
  }
  if (
    diagrams.includes("analysis") &&
    hasRequirementModelKind(input.models, "usecase") &&
    isRequirementDiagramStale({
      diagram: "usecase",
      activeRequirementFingerprint,
      generatedDiagrams: input.generatedDiagrams,
      requirementInputFingerprint: input.requirementInputFingerprint,
      diagramInputFingerprints: input.diagramInputFingerprints,
      diagramVersions: input.diagramVersions,
      rulesVersion: input.rulesVersion,
      models: input.models,
      requirementModelTraceability: input.requirementModelTraceability,
      manualModelEditStatus: input.manualModelEditStatus,
    })
  ) {
    return {
      status: "blocked",
      block: {
        title: "上游模型需更新",
        tone: "warning",
        message: "用例模型已存在但基于旧规则，请先手动更新用例模型",
        stageLabel: "需求模型",
        targetLabel: "已选需求模型",
        primaryAction: openWorkspaceAction("requirement-models", "requirementModels"),
      },
    };
  }

  return {
    status: "ready",
    activeRequirementFingerprint,
    diagrams,
    plan,
  };
}

export function analyzeDesignGenerationPreflight(
  input: DesignGenerationPreflightInput,
): DesignGenerationPreflight {
  const requestedDiagrams = requestedDesignDiagramsForPreflight(input);
  if (requestedDiagrams.length === 0) {
    return { status: "empty" };
  }
  const { activeRequirementFingerprint, stale } = hasStaleRules(input);
  if (stale) {
    return { status: "blocked", block: staleRulesBlock("已选设计模型") };
  }
  const existingDesignDiagrams = collectExistingDesignDiagramKinds(
    input.designModels,
  );
  const resolvedDesignPlan = resolveDesignGenerationDiagrams(
    requestedDiagrams,
    existingDesignDiagrams,
  );
  const requirementStructureBlock = invalidStructureBlock(Object.values(input.models).filter(Boolean), "requirements", "已选设计模型");
  if (requirementStructureBlock) return { status: "blocked", block: requirementStructureBlock };
  const designStructureBlock = invalidStructureBlock(
    Object.values(input.designModels).filter((model) => !resolvedDesignPlan.effectiveDiagrams.includes(model.diagramKind)),
    "design", "已选设计模型",
  );
  if (designStructureBlock) return { status: "blocked", block: designStructureBlock };
  const requirementPlan = planDesignRequirementAutoUpstream({
    requestedDesignDiagrams: resolvedDesignPlan.effectiveDiagrams,
    requirementModels: input.models,
    rules: input.rules,
  });
  const requiredExistingRequirementSources = orderedRequirementDiagrams(
    requestedDiagrams.flatMap((diagram) =>
      DESIGN_REQUIREMENT_SOURCE_MAP[diagram].filter((source) =>
        hasRequirementModelKind(input.models, source),
      ),
    ),
  );
  const staleRequirementSources = requiredExistingRequirementSources.filter(
    (diagram) =>
      isRequirementDiagramStale({
        diagram,
        activeRequirementFingerprint,
        generatedDiagrams: input.generatedDiagrams,
        requirementInputFingerprint: input.requirementInputFingerprint,
        diagramInputFingerprints: input.diagramInputFingerprints,
        diagramVersions: input.diagramVersions,
        rulesVersion: input.rulesVersion,
        models: input.models,
        requirementModelTraceability: input.requirementModelTraceability,
        manualModelEditStatus: input.manualModelEditStatus,
      }),
  );
  if (staleRequirementSources.length > 0) {
    return {
      status: "blocked",
      block: {
        title: "需求上游需更新",
        tone: "warning",
        message: `已有需求阶段${diagramLabels(staleRequirementSources).join("、")}基于旧规则，请先回到需求页更新`,
        stageLabel: "需求模型",
        targetLabel: "已选设计模型",
        primaryAction: openWorkspaceAction("requirement-models", "requirementModels"),
      },
    };
  }
  const existingRequirementTraceabilityComplete =
    hasCompleteRequirementTraceability(
      Object.values(input.models),
      input.requirementModelTraceability,
      input.manualModelEditStatus,
    );
  const existingRequirementTraceabilityMissing =
    requiredExistingRequirementSources.length > 0 &&
    (input.requirementModelTraceability.length > 0
      ? !existingRequirementTraceabilityComplete
      : Object.values(input.models).some(Boolean));
  if (existingRequirementTraceabilityMissing) {
    return {
      status: "blocked",
      block: {
        title: "需求追踪需处理",
        tone: "warning",
        message: "需求模型追踪关系不完整，请先回到需求页处理",
        stageLabel: "需求模型",
        targetLabel: "已选设计模型",
        primaryAction: openWorkspaceAction("requirement-models", "requirementModels"),
      },
    };
  }
  const activeDesignFingerprint = designInputFingerprintFor(
    Object.values(input.models).filter((model): model is DiagramModelSpec =>
      Boolean(model),
    ),
    input.requirementModelTraceability,
  );
  const sequenceWillGenerate =
    resolvedDesignPlan.effectiveDiagrams.includes("sequence");
  const needsExistingSequenceDependency = resolvedDesignPlan.effectiveDiagrams.some(
    (diagram) => diagram === "class" || diagram === "navigation",
  );
  if (
    needsExistingSequenceDependency &&
    !sequenceWillGenerate &&
    existingDesignDiagrams.includes("sequence") &&
    !sequenceModelsCoverUseCases(input.designModels, findRequirementModelByKind(input.models, "usecase"))
  ) {
    return {
      status: "blocked",
      block: {
        title: "设计依赖需更新",
        tone: "warning",
        message: "已有用例实现设计覆盖不足，请先手动更新用例实现设计",
        stageLabel: "设计模型",
        targetLabel: "已选设计模型",
        primaryAction: openWorkspaceAction("design-models", "designModels"),
      },
    };
  }
  if (
    (requestedDiagrams.includes("table") ||
      requestedDiagrams.includes("component")) &&
    !resolvedDesignPlan.effectiveDiagrams.includes("class") &&
    existingDesignDiagrams.includes("class") &&
    !designFingerprintMatches(
      currentDesignClassFingerprint(input.designModels, input.designInputFingerprints),
      activeDesignFingerprint,
    )
  ) {
    return {
      status: "blocked",
      block: {
        title: "设计依赖需更新",
        tone: "warning",
        message: "设计类图已存在但基于旧需求，请先手动更新设计类图",
        stageLabel: "设计模型",
        targetLabel: "已选设计模型",
        primaryAction: openWorkspaceAction("design-models", "designModels"),
      },
    };
  }
  if (
    requestedDiagrams.includes("deployment") &&
    !resolvedDesignPlan.effectiveDiagrams.includes("component") &&
    existingDesignDiagrams.includes("component") &&
    !designFingerprintMatches(
      currentDesignComponentFingerprint(
        input.designModels,
        input.designInputFingerprints,
      ),
      activeDesignFingerprint,
    )
  ) {
    return {
      status: "blocked",
      block: {
        title: "设计依赖需更新",
        tone: "warning",
        message: "组件（构件）关系已存在但基于旧需求，请先手动更新组件（构件）关系",
        stageLabel: "设计模型",
        targetLabel: "已选设计模型",
        primaryAction: openWorkspaceAction("design-models", "designModels"),
      },
    };
  }

  return {
    status: "ready",
    existingDesignDiagrams,
    requestedDiagrams,
    requirementPlan,
  };
}
