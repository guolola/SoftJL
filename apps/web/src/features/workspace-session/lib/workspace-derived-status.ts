// Derives stale flags, generation blockers, and visible run status for the session provider.
import { validateModelInput, type DiagramModelSpec, type RequirementBaseline } from "@uml-platform/contracts";
import type {
  DesignDiagramType,
  DiagramType,
} from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { GenerationTask, RunDiagnostics } from "../model/session-state";
import { getDesignModelId } from "../../../entities/diagram/model";
import { requirementRuleIdsBlockingGeneration } from "./requirement-review";
import type { createEmptyRunUiState } from "./run-ui-state";
import {
  designFingerprintMatches,
  designInputFingerprintFor,
  fingerprintMatches,
  hasCompleteDesignTraceability,
  hasCompleteRequirementTraceability,
  isRequirementDiagramStale,
  requirementInputFingerprintFor,
} from "./workspace-context";
import {
  orderedDesignDiagrams,
  orderedRequirementDiagrams,
  collectExistingRequirementDiagramKinds,
} from "./generation-planning";

type RunUiState = ReturnType<typeof createEmptyRunUiState>;

interface WorkspaceDerivedStatusInput {
  currentRunDiagnostics: RunDiagnostics;
  designInputFingerprints: WorkspaceRecord["designInputFingerprints"];
  designModelTraceability: WorkspaceRecord["designModelTraceability"];
  designModels: WorkspaceRecord["designModels"];
  diagramInputFingerprints: WorkspaceRecord["diagramInputFingerprints"];
  diagramVersions: WorkspaceRecord["diagramVersions"];
  generatedDesignDiagrams: DesignDiagramType[];
  generatedDiagrams: DiagramType[];
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"];
  models: WorkspaceRecord["models"];
  requirementBaseline: RequirementBaseline | null;
  requirementInputFingerprint: string | null;
  requirementModelTraceability: WorkspaceRecord["requirementModelTraceability"];
  requirementReviewCandidates: WorkspaceRecord["requirementReviewCandidates"];
  requirementText: string;
  hasUncommittedRequirementDraft: boolean;
  rules: RequirementRule[];
  rulesBasedOnTextVersion: number | null;
  rulesVersion: number;
  runUiState: RunUiState;
  textVersion: number;
  visibleGenerationTask: GenerationTask | null;
}

export function deriveWorkspaceStatus(input: WorkspaceDerivedStatusInput) {
  const requirementSourceMissing = input.requirementText.trim().length === 0;
  const currentRequirementInputFingerprint = requirementInputFingerprintFor(
    input.requirementText,
    input.rules,
  );
  const isRulesStale =
    input.rules.length > 0 &&
    (input.hasUncommittedRequirementDraft ||
      requirementSourceMissing ||
      (input.requirementInputFingerprint
      ? !fingerprintMatches(
          input.requirementInputFingerprint,
          currentRequirementInputFingerprint,
        )
      : input.rulesBasedOnTextVersion !== null &&
        input.rulesBasedOnTextVersion !== input.textVersion));
  const rulesStaleReason: "source-missing" | "text" | "rules" | null =
    !isRulesStale
      ? null
      : requirementSourceMissing
        ? "source-missing"
        : input.hasUncommittedRequirementDraft ||
            input.rulesBasedOnTextVersion !== null &&
            input.rulesBasedOnTextVersion !== input.textVersion
          ? "text"
          : "rules";

  const presentRequirementDiagrams = collectExistingRequirementDiagramKinds(input.models);
  const generatedRequirementDiagramSet = new Set([
    ...input.generatedDiagrams,
    ...presentRequirementDiagrams,
  ]);
  const staleDiagrams = orderedRequirementDiagrams(
    requirementSourceMissing
      ? [...generatedRequirementDiagramSet]
      : [...generatedRequirementDiagramSet].filter((diagram) =>
          isRequirementDiagramStale({
            diagram,
            activeRequirementFingerprint: currentRequirementInputFingerprint,
            generatedDiagrams: input.generatedDiagrams,
            requirementInputFingerprint: input.requirementInputFingerprint,
            diagramInputFingerprints: input.diagramInputFingerprints,
            diagramVersions: input.diagramVersions,
            rulesVersion: input.rulesVersion,
            models: input.models,
            requirementModelTraceability: input.requirementModelTraceability,
            manualModelEditStatus: input.manualModelEditStatus,
          }),
        ),
  );
  const requirementTraceabilityComplete = hasCompleteRequirementTraceability(
    Object.values(input.models),
    input.requirementModelTraceability,
    input.manualModelEditStatus,
  );
  const requirementTraceabilityMissing =
    input.requirementModelTraceability.length > 0
      ? !requirementTraceabilityComplete
      : input.generatedDiagrams.length > 0;
  const currentDesignInputFingerprint = designInputFingerprintFor(
    Object.values(input.models).filter((model): model is DiagramModelSpec =>
      Boolean(model),
    ),
    input.requirementModelTraceability,
  );
  const hasDesignModels = Object.keys(input.designModels).length > 0;
  const designFreshnessComplete =
    !hasDesignModels ||
    Object.entries(input.designModels).every(([modelId]) =>
      designFingerprintMatches(
        input.designInputFingerprints[modelId],
        currentDesignInputFingerprint,
      ),
    );
  const designTraceabilityComplete = hasCompleteDesignTraceability(
    Object.values(input.designModels),
    input.designModelTraceability,
    input.manualModelEditStatus,
    Object.values(input.models),
  );
  const requirementInputStale =
    generatedRequirementDiagramSet.size > 0 &&
    (isRulesStale || staleDiagrams.length > 0);
  const requirementTraceabilityStale =
    generatedRequirementDiagramSet.size > 0 &&
    (requirementInputStale || requirementTraceabilityMissing);
  const pendingRequirementReviewRuleIds = requirementRuleIdsBlockingGeneration(
    input.requirementBaseline,
    input.requirementReviewCandidates,
  );
  const requirementReviewBlockedReason =
    pendingRequirementReviewRuleIds.length > 0
      ? "请先确认需求规则修复结果"
      : null;
  const designGenerationBlockedReason = !input.requirementText.trim()
    ? "请先输入需求文本"
    : requirementReviewBlockedReason ?? (Object.values(input.models).some((model) => model && validateModelInput(model, "requirements").some((issue) => issue.severity === "error"))
      ? "上游需求模型未通过结构校验，请修复或重新生成后继续设计" : null);
  const staleDesignReasons: Record<string, string> = {};
  const staleDesignModelIds = Object.values(input.designModels).flatMap((model) => {
    const modelId = getDesignModelId(model);
    const storedDesignFingerprint = input.designInputFingerprints[modelId];
    const fingerprintFresh = designFingerprintMatches(
      storedDesignFingerprint,
      currentDesignInputFingerprint,
    );
    const reason =
      requirementInputStale
        ? requirementSourceMissing
          ? "需求源头已删除，此设计模型为旧产物，需重新输入需求并重跑。"
          : "需求文本或规则指纹已变化，此设计模型需更新。"
        : storedDesignFingerprint && !fingerprintFresh
          ? "上游需求模型或追踪指纹已变化，此设计模型需更新。"
          : null;
    if (!reason) return [];
    staleDesignReasons[modelId] = reason;
    return [modelId];
  });
  const staleDesignDiagrams = orderedDesignDiagrams(
    Object.values(input.designModels)
      .filter((model) => staleDesignModelIds.includes(getDesignModelId(model)))
      .map((model) => model.diagramKind),
  );
  const designTraceabilityStale =
    hasDesignModels &&
    (requirementTraceabilityStale ||
      !designFreshnessComplete ||
      !designTraceabilityComplete);

  return {
    designGenerationBlockedReason,
    designStaleReasons: staleDesignReasons,
    designTraceabilityStale,
    errorMessage:
      input.visibleGenerationTask?.errorMessage ?? input.runUiState.errorMessage,
    isRulesStale,
    rulesStaleReason,
    requirementReviewBlockedReason,
    requirementTraceabilityStale,
    runMessage:
      input.visibleGenerationTask?.message ?? input.runUiState.runMessage,
    runProgress:
      input.visibleGenerationTask?.progress ?? input.runUiState.runProgress,
    runStatus:
      input.visibleGenerationTask?.status ?? input.runUiState.runStatus,
    staleDesignDiagrams,
    staleDesignModelIds,
    staleDiagrams,
    currentRunDiagnostics:
      input.visibleGenerationTask?.diagnostics ?? input.currentRunDiagnostics,
  };
}
