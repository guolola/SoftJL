// Replays labeled review fixtures through the same durable events used by the generation task drawer.
import { CURRENT_DIAGRAM_REVIEW_VERSION, getModelGraphElements, diagramVisualReviewSchema, type DiagramReviewFinding } from "@uml-platform/contracts";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { reviewFingerprint } from "../../normalizers/diagrams/diagram-review.js";
import { emitOfflineDemoCall } from "./offline-demo-activity.js";

export async function emitOfflineDemoDiagramReviews(record: RunRecord) {
  const snapshot = record.snapshot;
  if (!("models" in snapshot) || !("visualReviews" in snapshot)) return;
  // Clear frozen/previous conclusions: this run owns its calls, timestamps and confirmation state.
  snapshot.visualReviews = {};
  await Promise.all(snapshot.models.map(async (model) => {
    const modelId = model.modelId ?? model.diagramKind;
    const elements = getModelGraphElements(model);
    const node = elements.find((item) => item.name);
    const foreignColumn = model.diagramKind === "table" ? model.tables.flatMap((table) => table.columns).find((column) => column.isForeignKey) : undefined;
    const repairModel = Boolean(foreignColumn);
    // Keep one representative pending case per stage so the demo also shows successful checks.
    const needsConfirmation = model.diagramKind === "usecase" || modelId === "sequence:uc-submit-reservation";
    const history: NonNullable<ReturnType<typeof diagramVisualReviewSchema.parse>["repairHistory"]> = [];
    const pending: DiagramReviewFinding[] = !needsConfirmation ? [] : model.diagramKind === "usecase" ? [
      { id: `${modelId}:demo-reference`, layer: "model", category: "model_structure", code: "invalid-reference", modelId,
        observation: "演示：一个用例的需求来源引用尚未核实。", evidence: [{ source: "demo-fixture", reference: node?.id ?? modelId, detail: "分类展示案例，缺少权威引用依据，不自动增删用例。" }], verification: "unverified", repairable: false },
      { id: `${modelId}:demo-boundary`, layer: "model", category: "business_constraint", code: "confirmed-comparator", modelId,
        observation: "演示：预约数量条件的边界比较符需要恢复。", expected: "数量 ≥ 1", actual: "数量 > 1",
        evidence: [{ source: "demo-fixture", reference: "reservation-quantity", detail: "固定演示业务条件；修复候选越界，已保留原模型。" }], verification: "verified", repairable: true },
    ] : [
      { id: `${modelId}:demo-other`, layer: "model", category: "other", code: "review-suggestion", modelId,
        observation: "演示：模型说明与需求描述需要人工确认。", evidence: [], verification: "unverified", repairable: false },
    ];
    const progress = (message: string, status: "running" | "repairing" | "completed" | "pending_review") => emitEvent(record, {
      type: "stage_progress", stage: "verify_diagram_visual", progress: 95, modelId,
      subtaskId: modelId, subtaskLabel: model.title, subtaskStatus: status, message,
    });
    const call = (operation: "model_repair", round: number, text: string, reasoning: string) => {
      return emitOfflineDemoCall(record, "verify_diagram_visual", {
        title: `${model.title}（演示）`, modelId, subtaskId: modelId, operation, round, text: `演示结果：${text}`,
        reasoning: `演示推理片段：${reasoning}`, summary: `演示摘要：${text}`,
      });
    };
    progress("演示：正在执行程序结构校验与绘制", "running");
    if (repairModel) {
      const before = structuredClone(model);
      if (before.diagramKind === "table") before.tables.flatMap((table) => table.columns).find((column) => column.id === foreignColumn!.id)!.isForeignKey = false;
      progress("演示：正在进行第 1 轮结构纠错", "repairing");
      const callId = await call("model_repair", 1, `恢复 ${foreignColumn!.name} 的 FK 标记；约束、字段 ID 与其他业务内容保持一致。`,
        `显式外键约束唯一确定 ${foreignColumn!.id} 的 FK 标记；候选只改动这个字段，通过契约、引用、追踪及绘图校验。`);
      history.push({ round: 1, target: "model", method: "hard_rule", issueIds: [`${modelId}:demo-fk-marker`], callId,
        beforeFingerprint: reviewFingerprint(before), afterFingerprint: reviewFingerprint(model), status: "accepted",
        changes: [`${foreignColumn!.name} · 外键标记：缺失 → FK`], reason: "演示：受限候选通过校验，已接受并重新渲染" });
    }
    if (model.diagramKind === "usecase") {
      progress("演示：正在验证业务条件修复候选", "repairing");
      const callId = await call("model_repair", 1, "候选修改了授权范围之外的用例名称，已拒绝，保留原模型。", "依据只允许恢复比较符；额外修改名称不通过改动范围校验。");
      history.push({ round: 1, target: "model", issueIds: [`${modelId}:demo-boundary`], callId, beforeFingerprint: reviewFingerprint(model),
        status: "rejected", changes: ["候选同时修改了用例名称"], reason: "演示：候选越过授权字段，已拒绝" });
    }
    throwIfRunCancelled(record);
    const review = diagramVisualReviewSchema.parse({
      status: needsConfirmation ? "pending_review" : "passed",
      issues: pending.map((item) => item.observation), findings: pending, repairHistory: history,
      reason: needsConfirmation ? "演示：结构检查存在待确认问题，请按分类查看" : "演示：程序结构校验与绘制通过，未另行调用 LLM 复核",
      checkOutcome: needsConfirmation ? "differences" : "verified",
      structureStatus: "passed", renderStatus: "passed", imageStatus: "skipped", reviewVersion: CURRENT_DIAGRAM_REVIEW_VERSION,
      attempts: 0, structureAttempts: 0, repairAttempts: history.length, checkedAt: new Date().toISOString(),
      inputFingerprint: reviewFingerprint(model, snapshot.plantUml.find((item) => (item.modelId ?? item.diagramKind) === modelId)?.source),
      stopReason: needsConfirmation ? model.diagramKind === "usecase" ? "修复候选越界，保留有效模型；其余问题证据不足" : "业务内容疑问保留供人工确认" : undefined,
    });
    snapshot.visualReviews[modelId] = review;
    progress(review.reason, needsConfirmation ? "pending_review" : "completed");
  }));
}
