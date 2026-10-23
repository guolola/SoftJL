// Derives stale flags, generation blockers, and visible run status for the session provider.
import { designRequirementModelIds, validateModelInput, type DiagramModelSpec, type RequirementBaseline } from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { GenerationTask, RunDiagnostics } from "../model/session-state";
import { getDesignModelId, getRequirementModelId } from "../../../entities/diagram/model";
import type { createEmptyRunUiState } from "./run-ui-state";
import { designFingerprintMatches, designInputFingerprintFor, fingerprintMatches,  hasRequirementSources, isRequirementDiagramStale, requirementInputFingerprintFor } from "./workspace-context";
import { orderedDesignDiagrams, orderedRequirementDiagrams, collectExistingRequirementDiagramKinds } from "./generation-planning";

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

  requirementText: string;
  committedRequirementText?: string;
  hasUncommittedRequirementDraft: boolean;
  rules: RequirementRule[];
  rulesBasedOnTextVersion: number | null;
  rulesVersion: number;
  runUiState: RunUiState;
  textVersion: number;
  visibleGenerationTask: GenerationTask | null;
}

export function deriveWorkspaceStatus(input: WorkspaceDerivedStatusInput) {
  // Draft edits do not change the source on which published rules/models depend.
  const requirementText = input.committedRequirementText ?? input.requirementText;
  const requirementSourceMissing = requirementText.trim().length === 0;
  const currentRequirementInputFingerprint = requirementInputFingerprintFor(
    requirementText,
    input.rules,
  );
  const isRulesStale =
    input.rules.length > 0 &&
    (requirementSourceMissing ||
      (!input.requirementInputFingerprint || !fingerprintMatches(
          input.requirementInputFingerprint,
          currentRequirementInputFingerprint,
        )));
  const rulesStaleReason: "source-missing" | "text" | "rules" | null =
    !isRulesStale
      ? null
      : requirementSourceMissing
        ? "source-missing"
        : input.rulesBasedOnTextVersion !== null &&
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
  const requirementTraceabilityComplete = hasRequirementSources(
    Object.values(input.models),
    input.requirementModelTraceability,
    input.manualModelEditStatus,
  );
  const staleRequirementModelIds = Object.entries(input.models).flatMap(([id, model]) => {
    if (!model) return [];
    const key = getRequirementModelId(model);
    const stamp = input.diagramInputFingerprints[key] ?? input.diagramInputFingerprints[id] ?? input.diagramInputFingerprints[model.diagramKind];
    return requirementSourceMissing || (stamp ? !fingerprintMatches(stamp, currentRequirementInputFingerprint)
      : staleDiagrams.includes(model.diagramKind)) ? [key] : [];
  });
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

const requirementInputStale =
    generatedRequirementDiagramSet.size > 0 &&
    (isRulesStale || staleDiagrams.length > 0);
  const requirementTraceabilityStale =
    generatedRequirementDiagramSet.size > 0 &&
    (requirementInputStale || requirementTraceabilityMissing);
  // Extracted rules count as generated; rule confirmation never gates design generation.
  const designGenerationBlockedReason = !requirementText.trim()
    ? "请先输入需求文本"
    : (Object.values(input.models).some((model) => model && validateModelInput(model, "requirements").some((issue) => issue.severity === "error"))
      ? "上游需求模型未通过结构校验，请修复或重新生成后继续设计" : null);
  const staleDesignReasons: Record<string, string> = {};
  const staleDesignModelIds = Object.values(input.designModels).flatMap((model) => {
    const modelId = getDesignModelId(model);
    const storedDesignFingerprint = input.designInputFingerprints[modelId];
    const fingerprintFresh = designFingerprintMatches(
      storedDesignFingerprint,
      currentDesignInputFingerprint,
    );
    const dependencies = designRequirementModelIds({ ...input }, modelId);
    const staleSource = dependencies.some((id) => {
      const source = input.models[id];
      return !source || staleRequirementModelIds.includes(getRequirementModelId(source));
    });
    const reason =
      requirementSourceMissing || staleSource
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

return {
    designGenerationBlockedReason,
    designStaleReasons: staleDesignReasons,

isRulesStale,
    rulesStaleReason,
    requirementTraceabilityStale,

runStatus:
      input.visibleGenerationTask?.status ?? input.runUiState.runStatus,
    staleDesignDiagrams,
    staleDesignModelIds,
    staleDiagrams,
    staleRequirementModelIds,
    currentRunDiagnostics:
      input.visibleGenerationTask?.diagnostics ?? input.currentRunDiagnostics,
  };
}
