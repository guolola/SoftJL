// Repairs rule extraction with complete source, draft and exact-source validation.
import { MAX_GENERATION_REPAIR_ATTEMPTS } from "@uml-platform/contracts";
import {
  stageProgressRunEventSchema,
  type ProviderSettings,
  type RequirementRulesResult,
} from "@uml-platform/contracts";
import { buildExtractRulesPrompt, buildRepairExtractedRulesPrompt } from "@uml-platform/prompts";
import type { LlmTransport } from "../../../adapters/llm/llm-transport.js";
import { getExtractRequirementRulesResponseFormat } from "../../../adapters/llm/response-formats/index.js";
import { formatParseError, parseJson } from "../../../normalizers/json/parse-json.js";
import { normalizeRequirementRulesResult } from "../../../normalizers/requirements/requirement-rule-normalizer.js";
import { throwIfRunCancelled } from "../../records/run-cancellation.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";

import { createRunLlmChunkHandlers } from "../shared/llm-chunk-events.js";
import { createMessages } from "../shared/llm-messages.js";
import type { ModelTaskActivity } from "../shared/model-task-timeout.js";
import { stageProgressValue } from "../shared/pipeline-events.js";
import { collectStructuredResult } from "../shared/structured-output.js";

const MAX_RULE_REPAIR_ATTEMPTS = MAX_GENERATION_REPAIR_ATTEMPTS;

export async function extractRequirementRulesWithRepair(input: {
  record: RunRecord;
  requirementText: string;
  providerSettings: ProviderSettings;
  llmTransport: LlmTransport;
  onActivity?: ModelTaskActivity;
  onBlankActivity?: ModelTaskActivity;
  abortSignal?: AbortSignal;
}): Promise<RequirementRulesResult> {
  // Keep extraction repairs local to the complete current source and latest draft.
  let prompt = buildExtractRulesPrompt(input.requirementText);
  let previousOutput = "";
  const responseFormat = getExtractRequirementRulesResponseFormat(input.providerSettings);
  for (let attempt = 0; ; attempt += 1) {
    throwIfRunCancelled(input.record);
    input.abortSignal?.throwIfAborted();
    let validationFailed = false;
    try {
      return await collectStructuredResult(
        input.llmTransport,
        input.providerSettings,
        createMessages(prompt),
        "extract_rules",
        createRunLlmChunkHandlers({
          record: input.record,
          stage: "extract_rules",
          onActivity: input.onActivity,
          onBlankActivity: input.onBlankActivity,
          subtaskId: "requirement-rules",
          subtaskLabel: attempt ? "需求规则格式修复" : "需求规则抽取",
          operation: attempt ? "model_repair" : undefined,
          round: attempt ? attempt : undefined,
        }),
        (text) => {
          previousOutput = text;
          try {
            const result = normalizeRequirementRulesResult(parseJson(text), input.requirementText);
            const invalid = result.rules.filter(rule => !rule.sourceFragment || !input.requirementText.includes(rule.sourceFragment));
            if (invalid.length) throw new Error(`sourceFragment 必须逐字引用原始需求，以下规则来源无效：${invalid.map(rule => rule.id).join(", ")}`);
            return result;
          } catch (error) {
            validationFailed = true;
            throw error;
          }
        },
        responseFormat,
        attempt + 1,
        input.abortSignal,
      );
    } catch (error) {
      throwIfRunCancelled(input.record);
      input.abortSignal?.throwIfAborted();
      // Transport failures keep their provider error; only returned JSON enters the repair loop.
      if (!validationFailed || attempt === MAX_RULE_REPAIR_ATTEMPTS) throw error;
      emitEvent(input.record, stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage: "extract_rules",
        progress: stageProgressValue("extract_rules"),
        message: `需求规则结构、分类或来源校验未通过，正在修复（${attempt + 1}/${MAX_RULE_REPAIR_ATTEMPTS}）`,
      }));
      input.onActivity?.();
      prompt = buildRepairExtractedRulesPrompt(formatParseError(error), input.requirementText, previousOutput);
    }
  }

}
