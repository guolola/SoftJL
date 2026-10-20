// Authenticates ordinary project commands and delegates generation and durable transitions to their owners.
import { createHttpErrorResponse } from "../../server/http-error-response.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { documentStyleSettingsSchema, standardAnswerSchema, standardModelSchema, standardAttachmentSchema, standardQuoteSchema, type StandardProjectState } from "@uml-platform/contracts";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import { publishStandardDocument } from "../../documents/standard/publish-standard-document.js";
import { requireProjectPermission, isProjectPermissionError } from "../../auth/guards.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { LlmTransport } from "../../llm.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import { createScheduledLlmTransport, type LlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import { resolveProviderRateLimitPolicy, type ProviderUsageTracker } from "../../provider-configs/provider-usage-tracker.js";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import type { RunTelemetryStore } from "../../runs/records/run-telemetry-store.js";
import { checkGenerationUsageLimit, checkProviderUsageLimit, recordGenerationUsage, recordProviderUsage,
  resolveProviderSettingsForRun, providerResolutionFailureResponse } from "../../runs/providers/run-provider-gates.js";
import { readStandardState, updateStandardState, recoverInterruptedStandardRun } from "../../runs/records/standard-project-record.js";
import { interruptStandardRunMessages } from "../../runs/records/standard-run-messages.js";
import { runStandardProject, renderStandardDiagram } from "../../runs/pipelines/standard/standard-project-pipeline.js";
import { runStandardAgent } from "../../runs/pipelines/standard/standard-agent-pipeline.js";
import { prepareStandardAgentTurn } from "../../runs/pipelines/standard/standard-agent-turn.js";
import { createStandardPiStream } from "../../adapters/llm/pi-provider.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import type { ModelCatalog } from "../../provider-configs/model-catalog.js";
import { registerProjectModelContextRoutes } from "../projects/register-project-model-context-routes.js";
import { validModelingImage } from "../../runs/providers/modeling-input-validation.js";
import { applyConversationRevision, resolveConversationRevision } from "../../runs/records/standard-conversation-revision.js";

import { createRunRecordStore, type RunRecordStore } from "../../runs/records/run-record-store.js";
import { startStandardRunRecord, syncStandardRunRecord } from "../../runs/records/standard-run-record.js";

const commandSchema = z.object({
  operation: z.enum(["chat", "edit", "regenerate", "prepare", "generate", "retry", "resume", "tests", "requirementsSpec", "softwareDesignSpec"]),
  messageId: z.string().min(1).max(160).optional(), expectedHeadId: z.string().min(1).max(160).optional(), language: z.enum(["zh-CN", "en"]).optional(),
  requestId: z.string().uuid().optional(), resumeRunId: z.string().optional(),
  message: z.string().trim().min(1).max(60000).optional(),
  reasoning: z.boolean().optional(), attachments: z.array(standardAttachmentSchema).max(4).optional(), quote: standardQuoteSchema.optional(),
  description: z.string().trim().min(1).max(60000).optional(),
  answers: z.array(standardAnswerSchema).max(3).optional(), useRecommendations: z.boolean().optional(),
  diagramId: z.string().max(160).optional(),
  documentStyle: documentStyleSettingsSchema.optional(),
  providerSettings: z.object({ providerConfigId: z.string().min(1), model: z.string().min(1) }),
});
const publicState = ({ piSession: _privateSession, acceptedCommands: _receipts, ...state }: StandardProjectState) => state;
const active = (state: StandardProjectState) => state.run?.status === "running";

export function registerStandardProjectRoutes(deps: {
  runs?: RunRecordStore;
  app: FastifyInstance; authStore: AuthStore; llmTransport: LlmTransport; renderClient: RenderClient;
  pngRenderClient: PngRenderClient; llmScheduler: LlmScheduler; providerConfigs: ProviderConfigStore;
  providerUsageTracker?: ProviderUsageTracker; generationUsage?: GenerationUsageService;
  analyticsStore?: RunTelemetryStore;
  documentLibrary?: DocumentLibrary;
  modelCatalog?: ModelCatalog;
}) {
  const { app, authStore } = deps;
  const runs = deps.runs ?? createRunRecordStore();
  const path = "/api/projects/:projectId/standard";
  const controllers = new Map<string, AbortController>();
  const processStartedAt = Date.now() - process.uptime() * 1000;
  registerProjectModelContextRoutes(deps);
  app.addHook("onClose", async () => {
    for (const [runId, controller] of controllers) { controller.abort(); deps.llmScheduler.cancelRun(runId); }
  });
  app.get(path, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(request, reply, authStore, projectId, "view_project");
    if (isProjectPermissionError(context)) return context;
    if (context.project.projectMode !== "standard") return reply.code(409).send(createHttpErrorResponse(reply));
    const workspace = await authStore.getProjectWorkspace(projectId);
    let state = readStandardState(workspace.state, context.project.description ?? "");
    // Only reconcile runs older than this process. A live start may be between its database commit and controller registration.
    if (state.run?.status === "running" && !controllers.has(state.run.id) && Date.parse(state.run.startedAt) < processStartedAt) {
      state = await recoverInterruptedStandardRun(authStore, projectId, context.user.id, state.run.id);
      await syncStandardRunRecord(runs, state);
    }
    return { state: publicState(state) };
  });
  app.post(`${path}/cancel`, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(request, reply, authStore, projectId, "start_runs");
    if (isProjectPermissionError(context)) return context;
    if (context.project.projectMode !== "standard") return reply.code(409).send(createHttpErrorResponse(reply));
    const state = await updateStandardState(authStore, projectId, context.user.id, state => {
      if (!active(state)) return;
      controllers.get(state.run!.id)?.abort();
      deps.llmScheduler.cancelRun(state.run!.id);
      state.contextStatus = "ready";
      state.run = { ...state.run!, status: "stopped", finishedAt: new Date().toISOString() };
      for (const diagram of Object.values(state.diagrams)) if (["running", "pending"].includes(diagram.status)) {
        diagram.status = "failed"; diagram.error = "生成已停止";
      }
      interruptStandardRunMessages(state, "已按你的要求停止本轮生成。");
    });
    await syncStandardRunRecord(runs, state);
    return { state: publicState(state) };
  });
  app.patch(path, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(request, reply, authStore, projectId, "update_project");
    if (isProjectPermissionError(context)) return context;
    if (context.project.projectMode !== "standard" || context.project.status !== "active") return reply.code(409).send(createHttpErrorResponse(reply));
    const parsed = z.object({ description: z.string().trim().min(1).max(60000) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(createHttpErrorResponse(reply));
    try {
      const state = await updateStandardState(authStore, projectId, context.user.id, state => {
        if (active(state)) throw new Error("生成期间请等待后再编辑");
        // Ordinary edits never invalidate or regenerate diagrams, tests or documents.
        if (state.description !== parsed.data.description) state.rounds = [];
        state.description = parsed.data.description;
      });
      return { state: publicState(state) };
    } catch (error) { return reply.code(409).send(createHttpErrorResponse(reply)); }
  });
  app.post(`${path}/messages/:messageId/feedback`, async (request, reply) => {
    const { projectId, messageId } = request.params as { projectId: string; messageId: string };
    const context = await requireProjectPermission(request, reply, authStore, projectId, "update_project");
    if (isProjectPermissionError(context)) return context;
    if (context.project.projectMode !== "standard" || context.project.status !== "active") return reply.code(409).send(createHttpErrorResponse(reply));
    const body = z.object({ type: z.enum(["positive", "negative"]) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send(createHttpErrorResponse(reply));
    try {
      const state = await updateStandardState(authStore, projectId, context.user.id, state => {
        const message = state.conversation?.find(item => item.id === messageId && item.role === "assistant" && item.status === "completed");
        if (!message) throw new Error("消息尚未完成或不存在");
        message.feedback = body.data.type;
      });
      return { state: publicState(state) };
    } catch { return reply.code(409).send(createHttpErrorResponse(reply)); }
  });
  app.post(path, { bodyLimit: 6_000_000 }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(request, reply, authStore, projectId, "start_runs");
    if (isProjectPermissionError(context)) return context;
    if (context.project.projectMode !== "standard") return reply.code(409).send(createHttpErrorResponse(reply));
    if (context.project.status !== "active") return reply.code(409).send(createHttpErrorResponse(reply));
    const parsed = commandSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(createHttpErrorResponse(reply, { issues: parsed.error.issues }));
    const current = readStandardState((await authStore.getProjectWorkspace(projectId)).state, context.project.description ?? "");
    // A lost POST response can be retried with the same identifier without starting another model run.
    if (parsed.data.requestId && current.acceptedCommands?.includes(parsed.data.requestId)) return { state: publicState(current) };
    let command: z.infer<typeof commandSchema>;
    try { command = { ...parsed.data, ...resolveConversationRevision(current, parsed.data) }; }
    catch (error) { return reply.code(409).send(createHttpErrorResponse(reply)); }
    if (command.operation === "resume" && (!current.run || current.run.id !== command.resumeRunId || !["stopped", "failed"].includes(current.run.status))) return reply.code(409).send(createHttpErrorResponse(reply));
    if (["chat", "edit", "regenerate"].includes(command.operation) && !command.message && !command.attachments?.length && !command.useRecommendations && !command.answers?.length) return reply.code(400).send(createHttpErrorResponse(reply));
    if (command.operation === "edit" && !command.message && !command.attachments?.length) return reply.code(400).send(createHttpErrorResponse(reply));
    if (command.operation === "prepare" && !(command.description || current.description).trim()) return reply.code(400).send(createHttpErrorResponse(reply));
    if (active(current)) return reply.code(409).send(createHttpErrorResponse(reply));
    if (!["prepare", "chat", "edit", "regenerate", "resume"].includes(command.operation) && !current.outline) return reply.code(400).send(createHttpErrorResponse(reply));
    if (command.operation === "retry" && !current.diagrams[command.diagramId ?? ""]) return reply.code(400).send(createHttpErrorResponse(reply));
    const metadata = { projectId, userId: context.user.id, createdAt: new Date().toISOString() };
    const runAccessGuard = { resolveRunAccess: async () => ({ userId: context.user.id, username: context.user.username }) };
    const generationGate = await checkGenerationUsageLimit({ generationUsage: deps.generationUsage, runAccessGuard, request, reply });
    if (generationGate !== true) return generationGate;
    const resolution = await resolveProviderSettingsForRun({ providerSettings: command.providerSettings, metadata, providerConfigs: deps.providerConfigs });
    if (!resolution.ok) return providerResolutionFailureResponse(reply, resolution);
    const providerConfigId = command.providerSettings.providerConfigId;
    const capacity = deps.modelCatalog?.resolve(providerConfigId, resolution.providerSettings.model, resolution.providerSettings.apiBaseUrl);
    if ((command.operation === "requirementsSpec" || command.operation === "softwareDesignSpec") && capacity?.capabilities?.reasoning !== true) command.reasoning = undefined;
    if (command.reasoning && capacity?.capabilities?.reasoning !== true) return reply.code(400).send(createHttpErrorResponse(reply));
    if (command.attachments?.some(item => item.type === "image") && capacity?.capabilities?.vision !== true) return reply.code(400).send(createHttpErrorResponse(reply));
    if (command.attachments?.some(item => item.type === "image" && !validModelingImage(item.contentType, item.data))) return reply.code(400).send(createHttpErrorResponse(reply));
    if ((command.message?.length ?? 0) + (command.quote?.text.length ?? 0) + (command.attachments ?? []).reduce((sum, item) => sum + (item.type === "document" ? item.text.length : 0), 0) > 60000) return reply.code(400).send(createHttpErrorResponse(reply));
    const taskType = command.operation.endsWith("Spec") ? "document_generation" : "requirements_to_uml";
    const providerGate = await checkProviderUsageLimit({ usageTracker: deps.providerUsageTracker, providerConfigId, metadata, request, reply, taskType, policy: resolveProviderRateLimitPolicy() });
    if (providerGate !== true) return providerGate;
    const runId = randomUUID();
    let initial: StandardProjectState;
    let acceptedPrevious: StandardProjectState = current;
    try {
      initial = await updateStandardState(authStore, projectId, context.user.id, state => {
        // Compare-and-swap also protects simultaneous starts from different browser tabs.
        if (command.requestId && state.acceptedCommands?.includes(command.requestId)) throw new Error("command-already-accepted");
        if (active(state)) throw new Error("项目正在生成，请稍后重试");
        if (command.operation === "resume" && state.run?.id !== command.resumeRunId) throw new Error("原任务已变化，请刷新后继续");
        // Capture the CAS winner: provider gates may have outlived another completed command.
        acceptedPrevious = structuredClone(state);
        applyConversationRevision(state, command);
        if (!state.description) state.description = context.project.description ?? "";
        state.run = { id: runId, operation: command.operation === "resume" ? current.run!.operation : command.operation, status: "running", startedAt: new Date().toISOString(), requestId: command.requestId,
          documentStyle: command.operation === "resume" ? current.run!.documentStyle : command.documentStyle,
          ...(command.operation === "resume" ? { continuedFrom: current.run!.id, work: current.run!.work, resumeOperation: current.run!.resumeOperation } : {}) };
        if (command.requestId) state.acceptedCommands = [...(state.acceptedCommands ?? []), command.requestId].slice(-100);
        // Acknowledgement includes the durable turn; the background pipeline reuses it by id.
        if (["chat", "edit", "regenerate"].includes(command.operation)) prepareStandardAgentTurn(projectId, command, state);
      });
      await startStandardRunRecord({ runs, state: initial, previous: acceptedPrevious, projectId, userId: context.user.id,
        providerConfigId, model: resolution.providerSettings.model });
    } catch (error) {

      if (error instanceof Error && error.message === "command-already-accepted") return { state: publicState(readStandardState((await authStore.getProjectWorkspace(projectId)).state)) };
      // A failed history commit must not leave a project permanently marked as running.
      await updateStandardState(authStore, projectId, context.user.id, state => {
        if (state.run?.id === runId) state.run = { ...state.run, status: "failed", finishedAt: new Date().toISOString(), error: "任务记录保存失败，请重新发送消息" };
      });
      return reply.code(409).send(createHttpErrorResponse(reply));
    }
    const controller = new AbortController(); controllers.set(runId, controller);
    // Keep each worker's accepted transition and history projection ordered within this turn.
    let saveQueue: Promise<unknown> = Promise.resolve();
    const save = (update: (state: StandardProjectState) => void) => {
      const next = saveQueue.then(async () => {
        const saved = await updateStandardState(authStore, projectId, context.user.id, state => {
          if (state.run?.id !== runId || !active(state)) throw new Error("任务已结束或被替换");
          update(state);
        });
        await syncStandardRunRecord(runs, saved);
        return saved;
      });
      saveQueue = next.catch(() => undefined);
      return next;
    };
    const scheduled = createScheduledLlmTransport({ transport: deps.llmTransport, scheduler: deps.llmScheduler,
      context: { runId, projectId, userId: context.user.id, providerConfigId, model: resolution.providerSettings.model, taskType }, analyticsStore: deps.analyticsStore });
    let confirmed: Promise<unknown> | undefined;
    const beforeRequest = () => confirmed ??= (async () => {

      await recordGenerationUsage({ generationUsage: deps.generationUsage, runAccessGuard, request, taskType, providerConfigId });
      await recordProviderUsage({ usageTracker: deps.providerUsageTracker, providerConfigId, metadata, request, taskType });
    })();
    const transport: LlmTransport = { async *streamChatCompletion(input) {
      controller.signal.throwIfAborted();
      await beforeRequest();
      yield* scheduled.streamChatCompletion({ ...input, abortSignal: input.abortSignal ? AbortSignal.any([controller.signal, input.abortSignal]) : controller.signal });
    } };
    // Persist running before returning. Each completed diagram is saved independently; failures never erase its siblings.
    void (async () => {
      try {
        const pipeline = { settings: resolution.providerSettings, transport, render: (artifact: Parameters<RenderClient>[0]) => deps.renderClient(artifact, controller.signal), save,
          publishDocument: deps.documentLibrary ? (state: StandardProjectState, kind: "requirementsSpec" | "softwareDesignSpec") => publishStandardDocument({ state, kind, projectId, userId: context.user.id, library: deps.documentLibrary!, render: deps.pngRenderClient, signal: controller.signal }) : undefined };
        const effectiveCommand = command.operation !== "resume" ? command
          : current.run!.work ? { operation: "resume" as const, targetIds: current.run!.work.ids, instruction: current.run!.work.instruction }
          : ["tests", "requirementsSpec", "softwareDesignSpec", "prepare"].includes(current.run!.resumeOperation ?? current.run!.operation) ? { ...command, documentStyle: current.run!.documentStyle, operation: (current.run!.resumeOperation ?? current.run!.operation) as "tests" | "requirementsSpec" | "softwareDesignSpec" | "prepare" }
          : { operation: "chat" as const, message: "继续上次停止的任务。先读取已保存状态，只处理尚未完成的内容，不重新生成已完成图表。" };
        if (["chat", "edit", "regenerate"].includes(effectiveCommand.operation)) {
          const stream = createStandardPiStream({ settings: resolution.providerSettings, scheduler: deps.llmScheduler,
            context: { runId, projectId, userId: context.user.id, providerConfigId, model: resolution.providerSettings.model, taskType },
            signal: controller.signal, beforeRequest, analyticsStore: deps.analyticsStore });
          await runStandardAgent(projectId, effectiveCommand, initial, { ...pipeline, stream, signal: controller.signal, capacity });
        } else await runStandardProject(effectiveCommand, initial, pipeline);
        await save(state => { state.run = { ...state.run!, status: "completed", finishedAt: new Date().toISOString() }; });
      } catch (error) {
        const message = error instanceof Error ? error.message : "生成失败，请重试";
        try { await save(state => {
          state.contextStatus = "ready";
          state.run = { ...state.run!, status: "failed", error: message, finishedAt: new Date().toISOString() };
          for (const diagram of Object.values(state.diagrams)) if (["running", "pending"].includes(diagram.status)) { diagram.status = "failed"; diagram.error = message; delete diagram.phase; }
          interruptStandardRunMessages(state, `本轮生成失败：${message}`);
        }); } catch { /* Cancelled or superseded runs cannot write terminal state. */ }
        app.log.error({ err: error, projectId, runId }, "Ordinary generation failed");
      } finally {
        controllers.delete(runId);

      }
    })().catch(error => app.log.error({ err: error, runId }, "Ordinary run cleanup failed"));
    return reply.code(202).send({ state: publicState(initial) });
  });
  app.put(`${path}/diagrams/:diagramId`, async (request, reply) => {
    const { projectId, diagramId } = request.params as { projectId: string; diagramId: string };
    const context = await requireProjectPermission(request, reply, authStore, projectId, "update_project");
    if (isProjectPermissionError(context)) return context;
    if (context.project.projectMode !== "standard" || context.project.status !== "active") return reply.code(409).send(createHttpErrorResponse(reply));
    const current = readStandardState((await authStore.getProjectWorkspace(projectId)).state);
    if (active(current)) return reply.code(409).send(createHttpErrorResponse(reply));
    const diagram = current.diagrams[diagramId];
    if (!diagram) return reply.code(404).send(createHttpErrorResponse(reply));
    try {
      const rendered = await renderStandardDiagram({ ...diagram, model: standardModelSchema.parse(request.body) }, deps.renderClient);
      const state = await updateStandardState(authStore, projectId, context.user.id, state => {
        if (active(state) || JSON.stringify(state.diagrams[diagramId]) !== JSON.stringify(diagram)) throw new Error("当前图已变化，请刷新后再保存");
        state.diagrams[diagramId] = rendered;
      });
      return { state: publicState(state) };
    } catch (error) { return reply.code(400).send(createHttpErrorResponse(reply)); }
  });
  app.get(`${path}/documents/:kind/download`, async (request, reply) => {
    const { projectId, kind } = request.params as { projectId: string; kind: string };
    const context = await requireProjectPermission(request, reply, authStore, projectId, "view_project");
    if (isProjectPermissionError(context)) return context;
    if (context.project.projectMode !== "standard") return reply.code(409).send(createHttpErrorResponse(reply));
    if (kind !== "requirementsSpec" && kind !== "softwareDesignSpec") return reply.code(404).send(createHttpErrorResponse(reply));
    const state = readStandardState((await authStore.getProjectWorkspace(projectId)).state);
    if (!state.documents?.[kind]) return reply.code(404).send(createHttpErrorResponse(reply));
    const documentId = state.documents[kind]!.documentId;
    const buffer = documentId && deps.documentLibrary ? await deps.documentLibrary.getDocumentBuffer(`project-${projectId}`, documentId) : null;
    if (!buffer) return reply.code(404).send(createHttpErrorResponse(reply));
    return reply.type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .header("Content-Disposition", `attachment; filename="${kind}.docx"`).send(buffer);
  });
}
