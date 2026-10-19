// Completes only missing provenance bindings without regenerating models or replacing accepted mappings.
import { z } from "zod";
import {
  MAX_GENERATION_REPAIR_ATTEMPTS, requirementTypeAppliesToModel, requirementModelTraceabilityEntrySchema, designModelTraceabilityEntrySchema,
  type DiagramModelSpec, type DesignDiagramModelSpec, type ModelElementRef, type RequirementRule,
  type RequirementModelTraceabilityEntry, type DesignModelTraceabilityEntry, type ProviderSettings, type RunStage, type DiagramKind,
} from "@uml-platform/contracts";
import { buildMissingMappingsPrompt } from "@uml-platform/prompts";
import type { LlmTransport } from "../../../llm.js";
import { collectModelRefs } from "../../../normalizers/traceability/traceability-normalizer.js";
import { parseJson } from "../../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { readDiagramReviewCounters } from "../../records/diagram-review-record.js";
import { throwIfRunCancelled } from "../../records/run-cancellation.js";
import { collectTextResult } from "./structured-output.js";
import { createRunLlmChunkHandlers } from "./llm-chunk-events.js";
import { stageProgressValue } from "./pipeline-events.js";
import { createRunError, throwRunError } from "./errors.js";
import { appendRequirementTrace, appendDesignTrace } from "./trace-events.js";

type Model = DiagramModelSpec | DesignDiagramModelSpec;
type Binding = RequirementModelTraceabilityEntry | DesignModelTraceabilityEntry;
interface RepairInput {
  record: RunRecord; providerSettings: ProviderSettings; llmTransport: LlmTransport;
  stage: RunStage; targetId: string; diagramKind?: DiagramKind | DesignDiagramModelSpec["diagramKind"]; subtaskLabel?: string;
  models: Model[]; abortSignal?: AbortSignal; repairLimit?: number; repairsUsed?: number;
  onActivity?: () => void; onBlankActivity?: () => void;
}
const key = (ref: ModelElementRef) => JSON.stringify([ref.modelId ?? ref.diagramKind, ref.diagramKind, ref.elementId]);
function resolve(ref: ModelElementRef, refs: ModelElementRef[]) {
  const matches = refs.filter(item => item.diagramKind === ref.diagramKind && item.elementId === ref.elementId && (!ref.modelId || ref.modelId === item.modelId));
  return matches.length === 1 ? matches[0] : undefined;
}

async function completeMappings<T extends Binding>(input: RepairInput & {
  field: "requirementModelTraceability" | "designModelTraceability"; bindings: T[];
  schema: z.ZodType<T[]>; source: (entry: T) => ModelElementRef; valid: (entry: T) => boolean; sourceFacts: unknown;
}) {
  const required = collectModelRefs(input.models).refs;
  const catalog = collectModelRefs(input.models, true).refs;
  const valid = (entry: T) => entry.confidence !== "low" && entry.reviewStatus !== "pending" && entry.mappingSource !== "auto-filled-pending-review" && input.valid(entry);
  const accepted = input.bindings.filter(entry => resolve(input.source(entry), catalog) && valid(entry));
  const missing = () => {
    const covered = new Set(accepted.map(entry => key(resolve(input.source(entry), catalog)!)));
    return required.filter(ref => !covered.has(key(ref)));
  };
  let error = "";
  const trace = (round: number, raw: string, message?: string) => {
    const entry = { attempt: round, kind: message ? "parse_error" as const : "llm_output" as const, rawOutput: raw, ...(message ? { errorMessage: message } : {}) };
    if (input.field === "requirementModelTraceability") appendRequirementTrace(input.record, { ...entry, stage: "generate_models" });
    else appendDesignTrace(input.record, { ...entry, stage: input.stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models" });
  };
  let used = Math.max(input.repairsUsed ?? 0, readDiagramReviewCounters(input.record, input.targetId, input.diagramKind).repairAttempts);
  while (missing().length) {
    throwIfRunCancelled(input.record);
    if (used >= (input.repairLimit ?? MAX_GENERATION_REPAIR_ATTEMPTS)) throwRunError(createRunError("RUN_STRUCTURED_OUTPUT_INVALID",
      `${input.field} 映射仍缺少 ${missing().length} 个业务元素（${missing().slice(0, 5).map(ref => `${ref.modelId ?? ref.diagramKind}:${ref.elementId}`).join("、")}），已达到共享 5 次修复上限${error ? `：${error}` : ""}`));
    const targets = missing();
    const allowed = new Set(targets.map(key));
    const round = ++used;
    emitEvent(input.record, { type: "stage_progress", stage: input.stage, progress: stageProgressValue(input.stage),
      subtaskId: input.targetId, modelId: input.targetId, diagramKind: input.diagramKind, subtaskLabel: input.subtaskLabel,
      subtaskStatus: "repairing", message: `正在补齐 ${targets.length} 个业务元素的来源映射（${round}/5），保留已完成映射` });
    const raw = await collectTextResult(input.llmTransport, input.providerSettings,
      [{ role: "system", content: "只能依据提供的真实来源补充指定元素的映射，禁止改写模型或编造来源。" },
        { role: "user", content: buildMissingMappingsPrompt(input.field, targets, input.models, input.sourceFacts, error) }],
      createRunLlmChunkHandlers({ record: input.record, stage: input.stage, subtaskId: input.targetId, modelId: input.targetId,
        diagramKind: input.diagramKind, subtaskLabel: input.subtaskLabel, operation: "model_repair", round,
        onActivity: input.onActivity, onBlankActivity: input.onBlankActivity }), { type: "json_object" }, input.abortSignal);
    trace(round, raw);
    try {
      // Reject model rewrites, existing-element replacements and invalid references before merging any additions.
      const response = z.object({ [input.field]: input.schema }).strict().parse(parseJson(raw));
      const additions = response[input.field] as T[];
      if (!additions.length) throw new Error("未返回缺失元素的映射");
      for (const entry of additions) {
        const ref = resolve(input.source(entry), catalog);
        if (!ref || !allowed.has(key(ref))) throw new Error("返回了缺失清单之外的元素映射");
        if (!valid(entry)) throw new Error("映射引用不存在、类型不适用或缺少有效来源");
      }
      accepted.push(...additions.map(entry => ({ ...entry, mappingSource: "llm" as const })));
      error = "";
    } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); trace(round, raw, error); }
  }
  return accepted;
}

export function repairRequirementMappings(input: RepairInput & { models: DiagramModelSpec[]; rules: RequirementRule[]; bindings: RequirementModelTraceabilityEntry[] }) {
  const rules = new Map(input.rules.map(rule => [rule.id, rule]));
  // Analysis sequences record element-level use-case sources, not direct rule bindings.
  const models = input.models.filter(model => model.diagramKind !== "analysis");
  if (!models.length) return Promise.resolve(input.bindings);
  return completeMappings({ ...input, models, field: "requirementModelTraceability", schema: z.array(requirementModelTraceabilityEntrySchema),
    source: entry => entry.target, valid: entry => { const rule = rules.get(entry.ruleId); return !!rule && requirementTypeAppliesToModel(rule.type, entry.target.diagramKind as DiagramKind); },
    sourceFacts: { rules: input.rules } });
}

export function repairDesignMappings(input: RepairInput & { models: DesignDiagramModelSpec[]; upstreamModels: Model[]; bindings: DesignModelTraceabilityEntry[] }) {
  const refs = collectModelRefs(input.upstreamModels, true).refs;
  return completeMappings({ ...input, field: "designModelTraceability", schema: z.array(designModelTraceabilityEntrySchema),
    source: entry => entry.source, valid: entry => entry.targets.length > 0 && entry.targets.every(ref => !!resolve(ref, refs)) && (entry.upstreamDesignRefs ?? []).every(ref => !!resolve(ref, refs)),
    sourceFacts: { upstreamModels: input.upstreamModels } });
}
