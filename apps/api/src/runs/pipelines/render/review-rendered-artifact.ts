// Coordinates structural repairs and image rechecks with one durable two-round budget per model.
import { z } from "zod";
import { CURRENT_DIAGRAM_REVIEW_VERSION, isUnverifiableReviewText, diagramReviewFindingSchema, diagramVisualReviewSchema, stageProgressRunEventSchema, validateModelInput, type DiagramVisualReview, type ProviderSettings, type DiagramReviewFinding } from "@uml-platform/contracts";
import { JSON_ONLY_SYSTEM_PROMPT, buildDiagramStructureReviewPrompt, buildDiagramImageReviewPrompt, buildDiagramStructuralRepairPrompt } from "@uml-platform/prompts";
import type { ChatMessage, LlmTransport } from "../../../llm.js";
import type { PngRenderClient } from "../../../adapters/render/png-render-client.js";
import type { RenderClient } from "../../../adapters/render/render-client.js";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "../../../plantuml.js";
import { parseJson } from "../../../normalizers/json/parse-json.js";
import { acceptRepairCandidate, acceptStructuralRepairCandidate, deriveAuthorizedRepairs, reviewObservationClaims, reviewFingerprint, verifyReviewClaims, type DiagramReviewBasis, type ReviewModel } from "../../../normalizers/diagrams/diagram-review.js";
import { verifySvgMapping } from "../../../normalizers/diagrams/svg-review.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { readDiagramReviewCounters } from "../../records/diagram-review-record.js";
import { isRunCancelled, isRunCancelledError, RunCancelledError, throwIfRunCancelled } from "../../records/run-cancellation.js";
import { collectStructuredResult } from "../shared/structured-output.js";
import { createRunLlmChunkHandlers } from "../shared/llm-chunk-events.js";
import { createCallActivity } from "../shared/call-activity.js";
import { stageProgressValue } from "../shared/pipeline-events.js";
import { withModelTaskTimeout } from "../shared/model-task-timeout.js";
import { withIsolatedConversationBranch } from "../shared/conversation-context.js";
import { renderArtifactWithRepair } from "./render-artifact-with-repair.js";

type Rendered = Extract<Awaited<ReturnType<typeof renderArtifactWithRepair>>, { status: "success" }>;
type CheckStatus = NonNullable<DiagramVisualReview["structureStatus"]>;
const judgmentSchema = z.object({ passed: z.boolean(), issues: z.array(z.string()).default([]), findings: z.array(diagramReviewFindingSchema).default([]) });
// Successful checks are reusable only inside this run, for byte-identical
// prompts (including model, source, image, provider and review version).
const passedChecks = new WeakMap<RunRecord, Map<string, string>>();
function unsupportedImage(error: unknown) { return /image.*(?:not supported|unsupported)|(?:not supported|unsupported).*image|does not support.*vision|不支持.*(?:图片|图像|视觉)/i.test(String(error)); }
export class DiagramReviewRenderError extends Error {
  constructor(message: string, public readonly review: DiagramVisualReview) { super(message); this.name = "DiagramReviewRenderError"; }
}
export async function reviewRenderedArtifact(input: {
  record: RunRecord; providerSettings: ProviderSettings; llmTransport: LlmTransport; renderClient: RenderClient; pngRenderClient?: PngRenderClient;
  model: ReviewModel; rendered?: Rendered; basis?: DiagramReviewBasis; mutable?: boolean; validateModel?: (model: ReviewModel) => void;
  reconcileTraceability?: (model: ReviewModel) => unknown; timeoutMs?: number;
}): Promise<{ model: ReviewModel; rendered: Rendered; review: DiagramVisualReview; traceability?: unknown }> {
  const { record, providerSettings, llmTransport, pngRenderClient } = input;
  const basis = input.basis ? structuredClone(input.basis) : undefined;
  const stage = basis?.stage ?? ("designTrace" in record.snapshot ? "design" : "selectedArtifacts" in record.snapshot ? "feasibility" : "requirements");
  let model = structuredClone(input.model), rendered = input.rendered;
  const modelId = model.modelId ?? model.diagramKind;
  const previous = readDiagramReviewCounters(record, modelId, model.diagramKind);
  let checks = previous.attempts, repairs = previous.repairAttempts, structureChecks = previous.structureAttempts;
  const saved = "visualReviews" in record.snapshot ? record.snapshot.visualReviews?.[modelId] : undefined;
  const repairHistory: NonNullable<DiagramVisualReview["repairHistory"]> = previous.repairAttempts ? structuredClone(saved?.repairHistory ?? []) : [];
  let findings: DiagramReviewFinding[] = [], issues: string[] = [], stopReason = "", imageHash: string | undefined;
  let structureStatus: CheckStatus = "passed", renderStatus: CheckStatus = "not_completed", imageStatus: CheckStatus = "skipped";
  const fingerprint = () => reviewFingerprint(basis, model, basis?.traceability, rendered?.artifact.source, imageHash);
  const cancelOrReport = (error: unknown) => { throwIfRunCancelled(record); if (isRunCancelledError(error)) throw error; };
  const result = (): DiagramVisualReview => {
    const allIssues = [...new Set([...issues, ...findings.map((item) => item.observation)])];
    const failed = structureStatus === "failed" || renderStatus === "failed" || imageStatus === "failed";
    const incomplete = structureStatus === "not_completed" || renderStatus === "not_completed" || imageStatus === "not_completed" || findings.some((item) => item.category === "check_execution");
    const pending = allIssues.length > 0;
    return diagramVisualReviewSchema.parse({
      status: failed ? "failed" : incomplete ? "not_completed" : pending ? "pending_review" : imageStatus === "skipped" ? "skipped" : "passed",
      checkOutcome: failed ? "differences" : incomplete ? findings.some((item) => item.verification === "inconclusive") ? "inconclusive" : "not_completed" : pending ? "differences" : imageStatus === "skipped" ? "skipped" : "verified",
      reason: failed ? "结构或绘制校验失败，当前结果未发布" : incomplete ? "检查未完成，请查看检查执行问题" : pending ? "存在业务内容疑问，请查看依据" : imageStatus === "skipped" ? "图片检查已跳过" : "本次自动检查未发现问题",
      issues: allIssues, findings, repairHistory, structureStatus, renderStatus, imageStatus, profileId: `${stage}.${model.diagramKind}`,
      attempts: checks, repairAttempts: repairs, structureAttempts: structureChecks, checkedAt: new Date().toISOString(), inputFingerprint: fingerprint(), stopReason: stopReason || undefined, reviewVersion: CURRENT_DIAGRAM_REVIEW_VERSION,
    });
  };
  const progress = (message: string, status: "running" | "repairing" | "completed" | "pending_review" | "failed") => emitEvent(record, stageProgressRunEventSchema.parse({ type: "stage_progress", stage: "verify_diagram_visual", progress: stageProgressValue("verify_diagram_visual"), diagramKind: model.diagramKind, modelId, subtaskId: modelId, subtaskLabel: model.title, subtaskStatus: status, message }));
  const bounded = <T>(task: (signal: AbortSignal, active: () => void, blank: () => void) => Promise<T>) => withModelTaskTimeout((active, blank, signal) => { throwIfRunCancelled(record); return task(signal, active, blank); }, { label: `${model.title}核对`, idleTimeoutMs: input.timeoutMs ?? 60_000, maxRuntimeMs: input.timeoutMs ?? 180_000, isCancelled: () => isRunCancelled(record), createCancelError: () => new RunCancelledError(record.snapshot.runId) });
  const call = async <T>(operation: "structure_check" | "visual_check" | "model_repair", round: number, messages: ChatMessage[], parse: (raw: string) => T, history?: typeof repairHistory[number]): Promise<T> => {
    const key = reviewFingerprint(operation, providerSettings, CURRENT_DIAGRAM_REVIEW_VERSION, messages);
    const cache = passedChecks.get(record) ?? new Map<string, string>();
    passedChecks.set(record, cache);
    const cached = history ? undefined : cache.get(key);
    if (cached) { throwIfRunCancelled(record); return parse(cached); }
    // Check retries are separate from the durable model/render repair budget.
    for (let attempt = 0; ; attempt++) {
      try {
        const value = await bounded((signal, active, blank) => {
          const handlers = createRunLlmChunkHandlers({ record, stage: "verify_diagram_visual", modelId, subtaskId: modelId, subtaskLabel: model.title, operation, round, onActivity: active, onBlankActivity: blank });
          if (history) { if (repairs >= 2) throw new Error("已达到共享两轮修复上限"); history.callId = handlers.callId; repairs++; repairHistory.push(history); }
          if (operation === "visual_check") checks++;
          if (operation === "structure_check") structureChecks++;
          return withIsolatedConversationBranch(handlers.callId!, () => collectStructuredResult(llmTransport, providerSettings, messages, "verify_diagram_visual", handlers, (raw) => {
            const value = parse(raw);
            const judgment = judgmentSchema.safeParse(value);
            if (!history && judgment.success && judgment.data.passed && !judgment.data.issues.length && !judgment.data.findings.length) cache.set(key, raw);
            return value;
          }, { type: "json_object" }, attempt + 1, signal));
        });
        return value;
      } catch (error) { cancelOrReport(error); if (history || attempt >= 1 || unsupportedImage(error)) throw error; }
    }
  };
  const render = async (candidate: ReviewModel): Promise<Rendered> => {
    const artifact = stage === "design" ? generateDesignPlantUmlArtifacts([candidate as Parameters<typeof generateDesignPlantUmlArtifacts>[0][number]])[0]! : generatePlantUmlArtifacts([candidate as Parameters<typeof generatePlantUmlArtifacts>[0][number]], stage === "feasibility" ? "feasibility" : "requirements")[0]!;
    const value = await bounded((signal) => renderArtifactWithRepair(record, providerSettings, llmTransport, input.renderClient, candidate, artifact, stage, signal));
    throwIfRunCancelled(record); if (value.status !== "success") throw new Error(value.errorMessage); return value;
  };
  const fail = (message: string): never => { stopReason = message; const review = result(); progress(review.reason, "failed"); throw new DiagramReviewRenderError(message, review); };
  const diagnosticFindings = () => validateModelInput(model, stage).filter((item) => item.severity === "error").map((item): DiagramReviewFinding => ({
    id: `${modelId}:${item.code}:${item.path}`, layer: "model", code: item.code, category: "model_structure", modelId, elementId: item.elementId, path: item.path,
    evidence: [{ source: "stage-contract", reference: `${stage}.${model.diagramKind}:${item.code}`, detail: item.message }], observation: item.message, verification: "verified", repairable: true,
  }));
  const hardRepair = async (target: "model" | "render", proofs: DiagramReviewFinding[], candidate: ReviewModel, changes: string[]) => {
    if (!input.mutable || repairs >= 2) return false;
    const history: typeof repairHistory[number] = { round: repairs + 1, target, method: "hard_rule", issueIds: proofs.map((item) => item.id), beforeFingerprint: fingerprint(), status: "failed", changes: [], reason: "程序修复未完成" };
    const activity = createCallActivity({ record, stage: "verify_diagram_visual", modelId, subtaskId: modelId, subtaskLabel: model.title, operation: target === "model" ? "model_repair" : "render_repair", round: history.round });
    history.callId = activity.callId; repairs++; repairHistory.push(history); activity.onStart(); progress(`正在进行第 ${history.round} 轮${target === "model" ? "结构修复" : "图形重建"}`, "repairing");
    try {
      input.validateModel?.(candidate);
      const trace = target === "model" ? input.reconcileTraceability?.(candidate) ?? basis?.traceability : basis?.traceability;
      const rebuilt = await render(candidate);
      if (target === "render") {
        const mismatches = verifySvgMapping(rebuilt.svgArtifact.svg, rebuilt.artifact.renderMapping, modelId, model.diagramKind).findings;
        if (mismatches.length) throw new Error(`绘图器故障：重建后仍未通过绘制校验：${mismatches.map((finding) => `${finding.observation}（预期 ${finding.expected ?? "存在"}，实际 ${finding.actual ?? "缺失"}）`).join("；")}`);
      }
      // Commit the model, trace and render together; rejected candidates never replace the valid tuple.
      model = structuredClone(candidate); rendered = rebuilt; if (basis) basis.traceability = trace;
      history.status = "accepted"; history.changes = changes; history.reason = "程序修复通过结构、追踪和绘制检查"; history.afterFingerprint = fingerprint(); activity.onChunk(changes.join("；")); activity.onComplete(); return true;
    } catch (error) { cancelOrReport(error); history.reason = String(error); stopReason = history.reason; activity.onError(); return false; }
  };
  for (;;) {
    issues = []; findings = []; structureStatus = "passed";
    const authorized = basis ? deriveAuthorizedRepairs(model, basis) : undefined;
    const diagnostics = diagnosticFindings();
    findings.push(...authorized?.findings ?? [], ...diagnostics.filter((item) => !authorized?.findings.some((proof) => proof.code === item.code)));
    if (basis) {
      progress("正在核对模型结构与业务内容", "running");
      try {
        const judgment = await call("structure_check", repairs, [{ role: "system", content: JSON_ONLY_SYSTEM_PROMPT }, { role: "user", content: buildDiagramStructureReviewPrompt({ stage, model, basis, diagnostics }) }], (raw) => judgmentSchema.parse(parseJson(raw)));
        findings.push(...verifyReviewClaims(reviewObservationClaims(judgment, model, "model"), model, basis).map((item) => ({ ...item, id: `structure:${repairs}:${item.id}` })));
      } catch (error) { cancelOrReport(error); structureStatus = "not_completed"; issues.push(`结构核对未完成：${String(error)}`); }
    }
    if (authorized?.changes.length) {
      if (await hardRepair("model", authorized.findings.filter((item) => item.repairable), acceptRepairCandidate(authorized.expectedModel, model, authorized, basis!), authorized.changes)) continue;
      structureStatus = "failed";
      fail(stopReason || (input.mutable ? "已达到共享两轮修复上限，结构问题仍未修复" : "当前模型需要结构修复"));
    }
    if (diagnostics.length) {
      structureStatus = "failed";
      if (input.mutable && repairs < 2 && basis) {
        const history: typeof repairHistory[number] = { round: repairs + 1, target: "model", method: "llm", issueIds: diagnostics.map((item) => item.id), beforeFingerprint: fingerprint(), status: "failed", changes: [], reason: "候选未通过" };
        try {
          const candidate = await call("model_repair", history.round, [{ role: "system", content: JSON_ONLY_SYSTEM_PROMPT }, { role: "user", content: buildDiagramStructuralRepairPrompt({ stage, model, basis, diagnostics }) }], (raw) => (parseJson(raw) as { model: ReviewModel }).model, history);
          const accepted = acceptStructuralRepairCandidate(candidate, model, basis, input.validateModel);
          const trace = input.reconcileTraceability?.(accepted) ?? basis.traceability;
          const nextRender = await render(accepted); model = accepted; rendered = nextRender; basis.traceability = trace;
          history.status = "accepted"; history.changes = diagnostics.map((item) => item.observation); history.reason = "候选通过结构、范围、追踪与绘制校验"; history.afterFingerprint = fingerprint(); continue;
        } catch (error) { cancelOrReport(error); history.status = "rejected"; history.reason = String(error); stopReason = history.reason; }
        if (repairs < 2) continue;
      }
      fail(stopReason || "结构修复失败：已达到共享两轮修复上限，保留上次有效模型");
    }
    try { rendered ??= await render(model); } catch (error) { cancelOrReport(error); renderStatus = "failed"; issues.push(`绘制失败：${String(error)}`); if (await hardRepair("render", [], model, ["重新生成 PlantUML 和图形"])) continue; fail(String(error)); }
    const svgCheck = verifySvgMapping(rendered!.svgArtifact.svg, rendered!.artifact.renderMapping, modelId, model.diagramKind);
    renderStatus = svgCheck.identifiable ? "passed" : "not_completed";
    if (!svgCheck.identifiable || svgCheck.inconclusive?.length) {
      renderStatus = "not_completed";
      findings.push({ id: `${modelId}:svg:unverifiable`, modelId, layer: "render", category: "check_execution", code: "svg-mapping-unverifiable", observation: svgCheck.inconclusive?.join("；") ?? "SVG 没有可识别的元素／关系标记，程序绘制核对未完成", evidence: [{ source: "svg-mapping-capability", reference: `${stage}.${model.diagramKind}`, detail: "未获得完整映射依据，不断言图形缺失，也不认定绘制核对通过" }], verification: "inconclusive", repairable: false });
    }
    if (svgCheck.findings.length) {
      findings.push(...svgCheck.findings); renderStatus = "failed";
      if (await hardRepair("render", svgCheck.findings, model, ["按有效模型重建 PlantUML 与 SVG 元素和关系"])) continue;
      fail(stopReason || "绘图器故障：模型元素或关系缺失，未发布新图形");
    }
    progress("正在核对最新图形与结构化模型", "running");
    if (!pngRenderClient) { imageStatus = "skipped"; stopReason ||= "当前环境缺少 PNG 渲染能力"; }
    else try {
      let image: Awaited<ReturnType<PngRenderClient>> | undefined;
      for (let attempt = 0; !image; attempt++) {
        try { image = await bounded((signal) => pngRenderClient(rendered!.artifact, signal)); }
        catch (error) { cancelOrReport(error); if (attempt >= 1) throw error; }
      }
      imageHash = reviewFingerprint(image.png.toString("base64"));
      const judged = await call("visual_check", repairs, [{ role: "system", content: JSON_ONLY_SYSTEM_PROMPT }, { role: "user", content: [
        { type: "text", text: buildDiagramImageReviewPrompt({ stage, model, source: rendered!.artifact.source, mapping: rendered!.artifact.renderMapping }) },
        { type: "image_url", image_url: { url: `data:image/png;base64,${image.png.toString("base64")}` } },
      ] }], (raw) => judgmentSchema.parse(parseJson(raw)));
      const reported = verifyReviewClaims(reviewObservationClaims(judged, model, "image"), model, basis).map((item) => ({ ...item, id: `image:${repairs}:${item.id}` }));
      findings.push(...reported);
      imageStatus = reported.some((item) => item.category === "check_execution") || issues.some(isUnverifiableReviewText) ? "not_completed" : "passed";
      // A provider's successful image response cannot complete an unavailable deterministic mapping check.
      const mismatches = reported.filter((item) => item.category === "render_mismatch" && item.verification === "verified" && item.repairable);
      if (mismatches.length) {
        imageStatus = "failed";
        if (await hardRepair("render", mismatches, model, ["按有效模型重建图形并重新检查图片"])) continue;
        fail(stopReason || "图形复查仍存在不一致，未发布当前结果");
      }
      if (diagnosticFindings().length || (basis && deriveAuthorizedRepairs(model, basis).changes.length)) continue;
    } catch (error) {
      cancelOrReport(error); if (error instanceof DiagramReviewRenderError) throw error;
      if (unsupportedImage(error)) { imageStatus = "skipped"; stopReason ||= "本次模型明确拒绝图片输入"; }
      else { imageStatus = "not_completed"; issues.push(`图片检查未完成：${String(error)}`); }
    }
    break;
  }
  if (!stopReason && (issues.length || findings.length)) stopReason = findings.some((item) => item.category === "business_content")
    ? "业务内容疑问保留供核实，不自动改写业务含义；检查异常请重试"
    : "检查异常需重试；没有可核实依据，不修改模型";
  const review = result(); progress(review.reason, review.status === "pending_review" || review.status === "not_completed" ? "pending_review" : "completed");
  return { model, rendered: rendered!, review, traceability: basis?.traceability };
}
