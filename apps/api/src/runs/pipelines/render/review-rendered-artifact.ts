// Validates and renders models locally; only confirmed structural defects can request a bounded model correction.
import { MAX_GENERATION_REPAIR_ATTEMPTS } from "@uml-platform/contracts";
import { CURRENT_DIAGRAM_REVIEW_VERSION, diagramVisualReviewSchema, stageProgressRunEventSchema, validateModelInput, ModelSemanticError, type DiagramVisualReview, type ProviderSettings, type DiagramReviewFinding } from "@uml-platform/contracts";
import { JSON_ONLY_SYSTEM_PROMPT } from "@uml-platform/prompts";
import type { ChatMessage, LlmTransport } from "../../../adapters/llm/llm-transport.js";
import type { RenderClient } from "../../../adapters/render/render-client.js";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "../../../adapters/plantuml/model-renderer.js";
import { parseJson } from "../../../normalizers/json/parse-json.js";
import { acceptRepairCandidate, acceptStructuralRepairCandidate, deriveAuthorizedRepairs, reviewFingerprint, type DiagramReviewBasis, type ReviewModel } from "../../../normalizers/diagrams/diagram-review.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { readDiagramReviewCounters } from "../../records/diagram-review-record.js";
import { isRunCancelled, isRunCancelledError, RunCancelledError, throwIfRunCancelled } from "../../records/run-cancellation.js";
import { collectStructuredResult } from "../shared/structured-output.js";
import { createRunLlmChunkHandlers } from "../shared/llm-chunk-events.js";
import { createCallActivity } from "../shared/call-activity.js";
import { stageProgressValue } from "../shared/pipeline-events.js";
import { withModelTaskTimeout } from "../shared/model-task-timeout.js";
import { renderArtifactWithRepair } from "./render-artifact-with-repair.js";
import { ModelGenerationConversation } from "../shared/model-generation-conversation.js";

type Rendered = Extract<Awaited<ReturnType<typeof renderArtifactWithRepair>>, { status: "success" }>;
type CheckStatus = NonNullable<DiagramVisualReview["structureStatus"]>;
export class DiagramReviewRenderError extends Error {
  constructor(message: string, public readonly review: DiagramVisualReview) { super(message); this.name = "DiagramReviewRenderError"; }
}
export async function reviewRenderedArtifact(input: {
  record: RunRecord; providerSettings: ProviderSettings; llmTransport: LlmTransport; renderClient: RenderClient;
  model: ReviewModel; rendered?: Rendered; basis?: DiagramReviewBasis; mutable?: boolean; validateModel?: (model: ReviewModel) => void;
  reconcileTraceability?: (model: ReviewModel) => unknown; timeoutMs?: number;
  validateTraceability?: (model: ReviewModel, traceability: unknown) => void;
  generationRepair?: {
    conversation: ModelGenerationConversation;
    parse: (raw: string, current: ReviewModel) => { model: ReviewModel; traceability: unknown };
  };
}): Promise<{ model: ReviewModel; rendered: Rendered; review: DiagramVisualReview; traceability?: unknown }> {
  const { record, providerSettings, llmTransport } = input;
  const basis = input.basis ? structuredClone(input.basis) : undefined;
  const stage = basis?.stage ?? ("designTrace" in record.snapshot ? "design" : "selectedArtifacts" in record.snapshot ? "feasibility" : "requirements");
  let model = structuredClone(input.model), rendered = input.rendered;
  const modelId = model.modelId ?? model.diagramKind;
  const previous = readDiagramReviewCounters(record, modelId, model.diagramKind);
  const checks = previous.attempts;
  let repairs = previous.repairAttempts;
  let correction = input.generationRepair?.conversation;
  let correctionError: unknown;
  const saved = "visualReviews" in record.snapshot ? record.snapshot.visualReviews?.[modelId] : undefined;
  const repairHistory: NonNullable<DiagramVisualReview["repairHistory"]> = previous.repairAttempts ? structuredClone(saved?.repairHistory ?? []) : [];
  let findings: DiagramReviewFinding[] = [], issues: string[] = [], stopReason = "";
  let structureStatus: CheckStatus = "passed", renderStatus: CheckStatus = "not_completed";
  const fingerprint = () => reviewFingerprint(basis, model, basis?.traceability, rendered?.artifact.source);
  const cancelOrReport = (error: unknown) => { throwIfRunCancelled(record); if (isRunCancelledError(error)) throw error; };
  const result = (): DiagramVisualReview => {
    const allIssues = [...new Set([...issues, ...findings.map((item) => item.observation)])];
    const failed = structureStatus === "failed" || renderStatus === "failed";
    const incomplete = structureStatus === "not_completed" || renderStatus === "not_completed" || findings.some((item) => item.category === "check_execution");
    const pending = allIssues.length > 0;
    return diagramVisualReviewSchema.parse({
      status: failed ? "failed" : incomplete ? "not_completed" : pending ? "pending_review" : "passed",
      checkOutcome: failed ? "differences" : incomplete ? findings.some((item) => item.verification === "inconclusive") ? "inconclusive" : "not_completed" : pending ? "differences" : "verified",
      reason: failed ? "程序结构校验或绘制失败，当前结果未发布" : incomplete ? "程序校验未完成，请查看执行问题" : pending ? "程序校验发现待处理问题，请查看依据" : "程序结构校验与绘制通过；业务自检在模型生成时完成，未另行调用 LLM 复核",
      issues: allIssues, findings, repairHistory, structureStatus, renderStatus, imageStatus: "skipped", profileId: `${stage}.${model.diagramKind}`,
      attempts: checks, repairAttempts: repairs, structureAttempts: 0, checkedAt: new Date().toISOString(), inputFingerprint: fingerprint(), stopReason: stopReason || undefined, reviewVersion: CURRENT_DIAGRAM_REVIEW_VERSION,
    });
  };
  const progress = (message: string, status: "running" | "repairing" | "completed" | "pending_review" | "failed") => emitEvent(record, stageProgressRunEventSchema.parse({ type: "stage_progress", stage: "verify_diagram_visual", progress: stageProgressValue("verify_diagram_visual"), diagramKind: model.diagramKind, modelId, subtaskId: modelId, subtaskLabel: model.title, subtaskStatus: status, message }));
  const bounded = <T>(task: (signal: AbortSignal, active: () => void, blank: () => void) => Promise<T>) => withModelTaskTimeout((active, blank, signal) => { throwIfRunCancelled(record); return task(signal, active, blank); }, { label: `${model.title}核对`, idleTimeoutMs: input.timeoutMs ?? 60_000, maxRuntimeMs: input.timeoutMs ?? 180_000, isCancelled: () => isRunCancelled(record), createCancelError: () => new RunCancelledError(record.snapshot.runId) });
  const correctModel = <T>(messages: ChatMessage[], parse: (raw: string) => T, history: typeof repairHistory[number]): Promise<T> => bounded((signal, active, blank) => {
    const handlers = createRunLlmChunkHandlers({ record, stage: "verify_diagram_visual", modelId, subtaskId: modelId, subtaskLabel: model.title, operation: "model_repair", round: history.round, onActivity: active, onBlankActivity: blank });
    if (repairs >= MAX_GENERATION_REPAIR_ATTEMPTS) throw new Error("已达到共享 5 次修复上限");
    history.callId = handlers.callId; repairs++; repairHistory.push(history);
    // Each structural correction continues its artifact's complete message history.
    return collectStructuredResult(llmTransport, providerSettings, messages, "verify_diagram_visual", handlers, parse, { type: "json_object" }, history.round, signal);
  });
  const render = async (candidate: ReviewModel): Promise<Rendered> => {
    const artifact = stage === "design" ? generateDesignPlantUmlArtifacts([candidate as Parameters<typeof generateDesignPlantUmlArtifacts>[0][number]])[0]! : generatePlantUmlArtifacts([candidate as Parameters<typeof generatePlantUmlArtifacts>[0][number]], stage === "feasibility" ? "feasibility" : "requirements")[0]!;
    const value = await bounded((signal) => renderArtifactWithRepair(record, input.renderClient, candidate, artifact, stage, signal));
    throwIfRunCancelled(record); if (value.status !== "success") throw new Error(value.errorMessage); return value;
  };
  const fail = (message: string): never => { stopReason = message; const review = result(); progress(review.reason, "failed"); throw new DiagramReviewRenderError(message, review); };
  const diagnosticFindings = () => validateModelInput(model, stage).filter((item) => item.severity === "error").map((item): DiagramReviewFinding => ({
    id: `${modelId}:${item.code}:${item.path}`, layer: "model", code: item.code, category: "model_structure", modelId, elementId: item.elementId, path: item.path,
    evidence: [{ source: "stage-contract", reference: `${stage}.${model.diagramKind}:${item.code}`, detail: item.message }], observation: item.message, verification: "verified", repairable: true,
  }));
  const hardRepair = async (target: "model" | "render", proofs: DiagramReviewFinding[], candidate: ReviewModel, changes: string[]) => {
    if (!input.mutable || repairs >= MAX_GENERATION_REPAIR_ATTEMPTS) return false;
    const history: typeof repairHistory[number] = { round: repairs + 1, target, method: "hard_rule", issueIds: proofs.map((item) => item.id), beforeFingerprint: fingerprint(), status: "failed", changes: [], reason: "程序修复未完成" };
    const activity = createCallActivity({ record, stage: "verify_diagram_visual", modelId, subtaskId: modelId, subtaskLabel: model.title, operation: target === "model" ? "model_repair" : "render_repair", round: history.round });
    history.callId = activity.callId; repairs++; repairHistory.push(history); activity.onStart(); progress(`正在进行第 ${history.round} 轮${target === "model" ? "结构修复" : "图形重建"}`, "repairing");
    try {
      input.validateModel?.(candidate);
      const trace = target === "model" ? input.reconcileTraceability?.(candidate) ?? basis?.traceability : basis?.traceability;
      input.validateTraceability?.(candidate, trace);
      const rebuilt = await render(candidate);
      // Commit the model, trace and render together; rejected candidates never replace the valid tuple.
      model = structuredClone(candidate); rendered = rebuilt; if (basis) basis.traceability = trace;
      correctionError = undefined;
      history.status = "accepted"; history.changes = changes; history.reason = "程序修复通过结构、追踪校验并完成绘制"; history.afterFingerprint = fingerprint(); activity.onChunk(changes.join("；")); activity.onComplete(); return true;
    } catch (error) { if (target === "model") correctionError = error; cancelOrReport(error); history.reason = String(error); stopReason = history.reason; activity.onError(); return false; }
  };
  for (;;) {
    issues = []; findings = []; structureStatus = "passed";
    progress("正在执行程序结构校验与绘制", "running");
    const authorized = basis ? deriveAuthorizedRepairs(model, basis) : undefined;
    const diagnostics = diagnosticFindings();
    try { input.validateTraceability?.(model, basis?.traceability); } catch (error) { correctionError = error; }
    findings.push(...authorized?.findings ?? [], ...diagnostics.filter((item) => !authorized?.findings.some((proof) => proof.code === item.code)));
    if (authorized?.changes.length) {
      if (await hardRepair("model", authorized.findings.filter((item) => item.repairable), acceptRepairCandidate(authorized.expectedModel, model, authorized, basis!), authorized.changes)) continue;
      if (!input.generationRepair || !input.mutable || repairs >= MAX_GENERATION_REPAIR_ATTEMPTS) {
        if (input.mutable && repairs < MAX_GENERATION_REPAIR_ATTEMPTS) continue;
        structureStatus = "failed";
        fail(stopReason || (input.mutable ? "已达到共享 5 次修复上限，结构问题仍未修复" : "当前模型需要结构修复"));
      }
    }
    if (diagnostics.length || correctionError) {
      structureStatus = "failed";
      if (input.mutable && repairs < MAX_GENERATION_REPAIR_ATTEMPTS && basis) {
        const history: typeof repairHistory[number] = { round: repairs + 1, target: "model", method: "llm", issueIds: diagnostics.map((item) => item.id), beforeFingerprint: fingerprint(), status: "failed", changes: [], reason: "候选未通过" };
        try {
          if (!correction) {
            correction = new ModelGenerationConversation(modelId, [
              { role: "system", content: JSON_ONLY_SYSTEM_PROMPT },
              { role: "user", content: `修正当前 ${stage} 阶段模型。返回完整模型 JSON，保持其身份和已有业务语义，引用必须来自给定依据。\n来源依据：${JSON.stringify(basis)}` },
            ], MAX_GENERATION_REPAIR_ATTEMPTS - repairs);
            correction.accept(JSON.stringify(model));
          }
          // Generated artifacts keep the exact original turns and append feedback;
          // standalone redraws can start from their current saved artifact.
          correction.prepare(correctionError ?? new ModelSemanticError(validateModelInput(model, stage)), input.generationRepair
            ? `当前修复对象为 ${model.modelId ?? model.diagramKind}。保持首次生成的完整输出结构，同时返回该模型及其全部来源映射。当前模型：${JSON.stringify(model)}` : undefined);
          const candidate = await correctModel(correction.messages, (raw) => {
            const content = correction!.accept(raw);
            return input.generationRepair?.parse(content, model) ?? { model: parseJson(content) as ReviewModel, traceability: basis.traceability };
          }, history);
          const accepted = authorized?.changes.length
            ? acceptRepairCandidate(candidate.model, model, authorized, basis, input.validateModel)
            : diagnostics.length ? acceptStructuralRepairCandidate(candidate.model, model, basis, input.validateModel)
            : (() => {
              if (reviewFingerprint(candidate.model) !== reviewFingerprint(model)) throw new Error("来源修复不得改写没有结构错误的模型");
              return structuredClone(candidate.model);
            })();
          const trace = input.generationRepair ? candidate.traceability : input.reconcileTraceability?.(accepted) ?? basis.traceability;
          input.validateTraceability?.(accepted, trace);
          const nextRender = await render(accepted); model = accepted; rendered = nextRender; basis.traceability = trace;
          correctionError = undefined;
          history.status = "accepted"; history.changes = diagnostics.map((item) => item.observation); history.reason = "候选通过结构、范围、追踪校验并完成绘制"; history.afterFingerprint = fingerprint(); continue;
        } catch (error) { correctionError = error; cancelOrReport(error); history.status = "rejected"; history.reason = String(error); stopReason = history.reason; }
        if (repairs < MAX_GENERATION_REPAIR_ATTEMPTS) continue;
      }
      fail(stopReason || "结构修复失败：已达到共享 5 次修复上限，保留上次有效模型");
    }
    // Business self-check belongs to generation. A valid artifact reaches rendering without another LLM request.
    try { rendered ??= await render(model); } catch (error) {
      cancelOrReport(error); renderStatus = "failed"; issues.push(`绘制失败：${String(error)}`);
      let recovered = false;
      // Every rebuild consumes the same budget; do not hide extra render retries between recorded rounds.
      while (input.mutable && repairs < MAX_GENERATION_REPAIR_ATTEMPTS) {
        if (await hardRepair("render", [], model, ["重新生成 PlantUML 和图形"])) { recovered = true; break; }
      }
      if (recovered) continue;
      fail(String(error));
    }
    // A successful program render is distinct from the removed LLM image/semantic reviews.
    renderStatus = "passed";
    break;
  }
  if (!stopReason && (issues.length || findings.length)) stopReason = findings.some((item) => item.category === "business_content")
    ? "业务内容疑问保留供核实，不自动改写业务含义；检查异常请重试"
    : "检查异常需重试；没有可核实依据，不修改模型";
  const review = result(); progress(review.reason, review.status === "pending_review" || review.status === "not_completed" ? "pending_review" : "completed");
  return { model, rendered: rendered!, review, traceability: basis?.traceability };
}
