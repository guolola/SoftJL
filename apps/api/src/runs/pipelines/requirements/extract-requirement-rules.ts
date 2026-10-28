// Extracts rule candidates with backend validation against one immutable source snapshot.
import { snapshotInputFingerprint, type ProviderSettings } from "@uml-platform/contracts";
import { buildExtractRulesPrompt } from "@uml-platform/prompts";
import type { LlmTransport } from "../../../adapters/llm/llm-transport.js";
import { EXTRACT_REQUIREMENT_RULES_RESPONSE_FORMAT } from "../../../adapters/llm/response-formats/index.js";
import { validateRequirementRules, type ValidatedRequirementRules } from "../../../normalizers/requirements/requirement-rule-normalizer.js";
import { splitRequirementInput, type RequirementSourceUnit } from "../../../normalizers/requirements/requirement-source-units.js";
import type { RunRecord } from "../../records/run-record-store.js";
import type { ModelTaskActivity } from "../shared/model-task-timeout.js";
import { generateWithModelConversation } from "../shared/model-generation-session.js";
import { repairDiagnostics } from "../../../normalizers/structured-output/repair-diagnostics.js";
import { createRunError, throwRunError } from "../shared/errors.js";
import { requirementMultimodalContent, type RequirementInputImage } from "./prepare-requirement-input.js";

export async function extractRequirementRulesWithRepair(input: {
  record: RunRecord;
  requirementText: string;
  sourceText?: string;
  sourceUnits?: RequirementSourceUnit[];
  images?: RequirementInputImage[];
  providerSettings: ProviderSettings;
  llmTransport: LlmTransport;
  onActivity?: ModelTaskActivity;
  onBlankActivity?: ModelTaskActivity;
  abortSignal?: AbortSignal;
}): Promise<ValidatedRequirementRules> {
  const sourceText = input.sourceText ?? input.requirementText;
  const units = structuredClone(input.sourceUnits ?? splitRequirementInput(sourceText));
  const snapshotSource = () => {
    const snapshot = input.record.snapshot;
    return snapshotInputFingerprint({ requirementText: "requirementText" in snapshot ? snapshot.requirementText : undefined,
      submittedRequirementText: "submittedRequirementText" in snapshot ? snapshot.submittedRequirementText : undefined,
      attachments: "attachments" in snapshot ? snapshot.attachments : undefined,
      baseline: "requirementBaseline" in snapshot ? snapshot.requirementBaseline : undefined });
  };
  const initialSource = snapshotSource();
  try { return await generateWithModelConversation({
    record: input.record, providerSettings: input.providerSettings, transport: input.llmTransport,
    stage: "extract_rules", targetId: "requirement-rules", label: "需求规则抽取", artifactKind: "requirement-rules",
    // Assemble text and image evidence rules together so their citation requirements cannot conflict.
    prompt: requirementMultimodalContent(buildExtractRulesPrompt(input.requirementText, { hasImages: Boolean(input.images?.length) }), input.images ?? []), schema: EXTRACT_REQUIREMENT_RULES_RESPONSE_FORMAT,
    validate: raw => validateRequirementRules(JSON.parse(raw), { sourceText, units }),
    assertSourceCurrent: () => { if (snapshotSource() !== initialSource) throw new Error("需求来源已变化，请重新发起抽取"); },
    onActivity: input.onActivity, onBlankActivity: input.onBlankActivity, abortSignal: input.abortSignal,
  }); } catch (error) {
    if (error instanceof Error && error.message.includes("structured output failed") && repairDiagnostics(error).some(issue => issue.code === "rules-empty")) {
      throwRunError(createRunError("RUN_REQUIREMENT_RULES_EMPTY", error.message));
    }
    throw error;
  }
}
