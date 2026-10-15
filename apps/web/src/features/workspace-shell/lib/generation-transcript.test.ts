// Exercises user-visible ordering, replay and parallel output independently of presentation.
import { describe, expect, it } from "vitest";
import type { RunActivityEvent, RunEvent } from "@uml-platform/contracts";
import { createRunSnapshot } from "../../../test/workspace-test-utils";
import { mergeTranscriptEvents } from "../../workspace-session/lib/run-transcript";
import { projectGenerationTranscript, readableTaskText, readableOutput } from "./generation-transcript";

const activity = (id: string, callId: string, phase: RunActivityEvent["phase"], text?: string): RunActivityEvent => ({
  type: "run_activity", eventId: id, callId, phase, text, format: "technical", runId: "run-a", stage: "generate_models", subtaskId: callId,
  createdAt: "2026-09-21T08:00:00.000Z",
});

describe("generation transcript", () => {
  it("preserves the real preview count from a progress-only completion snapshot", () => {
    const result = projectGenerationTranscript([{ type: "completed", previewCount: 17, snapshot: createRunSnapshot({ status: "completed", svgArtifacts: [] }) }], "completed", [], {}, { includeContent: false });
    expect(result.finalMessage).toBe("已生成 17 个图形预览。");
  });
  it("keeps visual diagnostics out of progress-only projection during streaming and replay", () => {
    const detail = "追踪关系错配、字段归属待核对。".repeat(10_000);
    const check = { ...activity("visual-start", "visual", "started"), stage: "verify_diagram_visual" as const, subtaskId: "usecase", operation: "visual_check" as const };
    const events: RunEvent[] = [
      check,
      { ...check, eventId: "visual-output", phase: "output", text: detail },
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "usecase", subtaskStatus: "pending_review", message: detail },
    ];
    const live = projectGenerationTranscript(events, "running", [], {}, { includeContent: false });
    expect(live.steps[0].calls[0]).toMatchObject({ status: "pending_review", message: "视觉检查已结束", output: "" });
    expect(JSON.stringify(live.steps)).not.toContain(detail);
    const review = { status: "pending_review" as const, issues: [detail], reason: detail, stopReason: detail, attempts: 1, checkedAt: "check-1" };
    events.push({ type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: { usecase: review } }) });
    const before = JSON.stringify(events);
    const restored = projectGenerationTranscript(events, "completed", [{ id: "verify_diagram_visual:usecase", label: "用例图", status: "pending_review", message: detail, errorMessage: null }], {}, { includeContent: false });
    expect(restored.steps[0].calls[0]).toMatchObject({ status: "pending_review", message: "视觉检查已结束" });
    expect(restored.steps[0].calls[0].review).toBeUndefined();
    expect(JSON.stringify(restored.steps)).not.toContain(detail);
    expect(restored.finalMessage).not.toContain("待确认");
    expect(JSON.stringify(events)).toBe(before);
    expect(projectGenerationTranscript(events).steps[0].calls[0].review).toEqual(review);
  });

  it("keeps visual failures and skips concise in progress-only projection", () => {
    const detail = "结构核对未完成：" + "超时诊断".repeat(10_000);
    const failed = projectGenerationTranscript([{ type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "class", subtaskStatus: "failed", message: detail }], "running", [], {}, { includeContent: false });
    expect(failed.steps[0].calls[0]).toMatchObject({ status: "failed", message: "视觉检查未完成，可重试。" });
    const skipped = projectGenerationTranscript([{ type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "class", subtaskStatus: "completed", message: "已跳过视觉检查：" + detail }], "running", [], {}, { includeContent: false });
    expect(skipped.steps[0].calls[0]).toMatchObject({ status: "completed", message: "视觉检查已跳过" });
  });

  it("projects progress without accumulating content while preserving attempts, legacy calls and failures", () => {
    const body = "批量正文".repeat(10_000);
    const events: RunEvent[] = [
      activity("start", "a", "started"), activity("reasoning", "a", "reasoning", body),
      activity("summary", "a", "summary", body), activity("output", "a", "output", body),
      activity("failed", "a", "failed"),
      { type: "stage_started", stage: "generate_document_text" },
      { type: "llm_chunk", stage: "generate_document_text", chunk: body },
      { type: "stage_finished", stage: "generate_document_text", status: "completed" },
      { type: "failed", error: { code: "RUN_INTERNAL_ERROR", category: "internal", retryable: false, message: "模型服务暂不可用" } },
    ];
    const before = JSON.stringify(events);
    const result = projectGenerationTranscript(events, "running", [], {}, { includeContent: false });
    expect(result.steps[0].calls[0]).toMatchObject({ status: "failed", output: "", reasoning: "", summary: "", thinking: false });
    expect(result.steps[1].calls[0]).toMatchObject({ status: "completed", output: "" });
    expect(result.status).toBe("failed");
    expect(result.finalMessage).toBe(projectGenerationTranscript(events).finalMessage);
    expect(result.finalMessage).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(body);
    expect(JSON.stringify(events)).toBe(before);
  });
  it("retains manual confirmation only for the same fingerprint in new review replay", () => {
    const check = { ...activity("check", "image", "completed"), stage: "verify_diagram_visual" as const, subtaskId: "usecase", operation: "visual_check" as const, round: 1 };
    const review = { status: "pending_review" as const, issues: ["待确认标签"], reason: "待确认", attempts: 1, checkedAt: "check-1", checkOutcome: "differences" as const, inputFingerprint: "new" };
    const events: RunEvent[] = [check, { type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: { usecase: review } }) }];
    const accepted = projectGenerationTranscript(events, "completed", [], { usecase: { ...review, confirmedAt: "confirmed" } });
    expect(accepted.steps[0].calls[0]).toMatchObject({ status: "completed", message: "已人工确认当前图", review });
    const changed = projectGenerationTranscript(events, "completed", [], { usecase: { ...review, inputFingerprint: "old", confirmedAt: "confirmed" } });
    expect(changed.steps[0].calls[0].status).toBe("pending_review");
  });
  it("restores model operation, repair round and structured findings under the latest image call", () => {
    const started = { ...activity("check", "structure", "started"), stage: "verify_diagram_visual" as const, modelId: "usecase", subtaskId: "usecase", operation: "structure_check" as const, round: 0 };
    const repair = { ...started, eventId: "repair", callId: "repair", operation: "model_repair" as const, round: 1 };
    const image = { ...started, eventId: "image", callId: "image", operation: "visual_check" as const, round: 1, inputImages: [{ url: "data:image/png;base64,YQ==" }] };
    const review = { status: "passed" as const, issues: [], reason: "通过", attempts: 1, repairAttempts: 1, structureAttempts: 2, checkedAt: "check-1", checkOutcome: "verified" as const, inputFingerprint: "new", repairHistory: [{ round: 1, target: "model" as const, issueIds: ["comparator"], beforeFingerprint: "old", afterFingerprint: "new", callId: "repair", status: "accepted" as const, changes: ["比较符 > 改为 >="], reason: "已确认条件" }] };
    const events: RunEvent[] = [started, repair, image, { type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: { usecase: review } }) }];
    const calls = projectGenerationTranscript(JSON.parse(JSON.stringify(events))).steps[0].calls;
    expect(calls.map((call) => call.operation)).toEqual(["structure_check", "model_repair", "visual_check"]);
    expect(calls[0].title).toContain("结构核对"); expect(calls[1].title).toContain("第 1 轮");
    expect(calls[0].review).toBeUndefined(); expect(calls[2].review).toEqual(review);
    expect(calls[2].inputImages).toEqual(image.inputImages);
  });
  it("keeps a handled image-input skip from becoming a task failure, including persisted replay", () => {
    const started = { ...activity("start", "visual", "started"), stage: "verify_diagram_visual" as const, subtaskId: "usecase", inputImages: [{ url: "data:image/png;base64,YQ==" }] };
    const events: RunEvent[] = [started, { ...started, eventId: "failed", phase: "failed" },
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "usecase", subtaskStatus: "completed", message: "已跳过视觉检查：不支持图片输入" }];
    const live = projectGenerationTranscript(events).steps[0].calls[0];
    expect(live).toMatchObject({ id: "visual", status: "completed", message: "已跳过视觉检查：不支持图片输入", inputImages: started.inputImages });
    const restored = projectGenerationTranscript([events[0], events[1], { type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: {
      usecase: { status: "skipped", issues: [], reason: "不支持图片输入", attempts: 1, checkedAt: "2026-09-30T08:00:00.000Z" },
    } }) }]);
    expect(restored.steps[0].calls[0]).toMatchObject({ status: "completed", message: "已跳过视觉检查：不支持图片输入" });
  });
  it("replays input images under their own parallel calls without mixing stages", () => {
    const first = { url: "data:image/png;base64,YQ==", caption: "环境图" };
    const second = { url: "data:image/png;base64,Yg==", caption: "流程图" };
    const a = { ...activity("image-a", "context", "started"), stage: "verify_diagram_visual" as const, inputImages: [first] };
    const b = { ...activity("image-b", "flow", "started"), stage: "verify_diagram_visual" as const, inputImages: [second] };
    const transcript = projectGenerationTranscript([a, b, a, { ...a, eventId: "duplicate-image" }]);
    expect(transcript.steps[0].calls.map((call) => call.inputImages)).toEqual([[first], [second]]);
    expect(projectGenerationTranscript([activity("legacy", "a", "started")]).steps[0].calls[0].inputImages).toBeUndefined();
  });
  it("shows client rule repair after extraction without exposing the empty model phase", () => {
    const events: RunEvent[] = [
      { type: "stage_started", stage: "extract_rules", tracksCompletion: true },
      { type: "stage_finished", stage: "extract_rules", status: "completed" },
      { type: "stage_started", stage: "generate_models" },
      { type: "stage_finished", stage: "generate_models", status: "completed" },
      { type: "completed", snapshot: createRunSnapshot({ selectedDiagrams: [], status: "completed" }) },
    ];
    const extraction = { id: "extract_rules", label: "抽取需求规则", status: "completed" as const, message: null, errorMessage: null };
    const repair = { id: "repair_rules", label: "修复需求规则", status: "repairing" as const, message: "正在修复 r2", errorMessage: null };
    const active = projectGenerationTranscript(events, "completed", [extraction, repair]);
    expect(active.visibleSteps.map((step) => step.title)).toEqual(["抽取需求规则", "修复需求规则"]);
    expect(active.status).toBe("running");
    const done = projectGenerationTranscript(events, "completed", [extraction, { ...repair, status: "pending_review", pendingReviewCount: 1 }]);
    expect(done.status).toBe("completed");
    expect(done.visibleSteps[1].calls[0].message).toContain("1 条需求规则修复结果待确认");
  });

  it("reveals each sequential feasibility stage as soon as its successor starts", () => {
    const stages = ["generate_context", "render_context", "generate_business_flow", "render_business_flow", "generate_implementation"] as const;
    const events: RunEvent[] = [];
    for (const stage of stages) {
      events.push({ type: "stage_started", stage });
      const result = projectGenerationTranscript(events);
      expect(result.visibleSteps.map((step) => step.stage)).toEqual(stages.slice(0, events.length));
      expect(result.visibleSteps.slice(0, -1).every((step) => step.finished)).toBe(true);
    }
  });
  it("keeps the two feasibility image reviews in separate chronological steps", () => {
    const events: RunEvent[] = [
      { type: "stage_started", stage: "render_context" },
      { type: "stage_started", stage: "verify_diagram_visual" },
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "context", subtaskStatus: "completed", message: "系统环境图已通过" },
      { type: "stage_started", stage: "generate_business_flow" },
      { type: "stage_started", stage: "render_business_flow" },
      { type: "stage_started", stage: "verify_diagram_visual" },
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "business-flow", subtaskStatus: "pending_review", message: "流程图待确认" },
    ];
    const result = projectGenerationTranscript(events);
    expect(result.steps.map((step) => step.stage)).toEqual([
      "render_context", "verify_diagram_visual", "generate_business_flow", "render_business_flow", "verify_diagram_visual",
    ]);
    expect(result.steps[1].calls.map((call) => call.subtaskId)).toEqual(["context"]);
    expect(result.steps[4].calls.map((call) => call.subtaskId)).toEqual(["business-flow"]);
  });
  it("switches from analysis to output while retaining the received thinking summary", () => {
    const events = [activity("start", "a", "started"), activity("think", "a", "thinking"), activity("reasoning", "a", "reasoning", "先检查需求。"), activity("summary", "a", "summary", "正在核对需求。")];
    expect(projectGenerationTranscript(events).steps[0].calls[0].thinking).toBe(true);
    const call = projectGenerationTranscript([...events, activity("out", "a", "output", "正文片段")]).steps[0].calls[0];
    expect(call.thinking).toBe(false);
    expect(call.reasoning).toBe("先检查需求。");
    expect(call.summary).toBe("正在核对需求。");
    expect(call.status).toBe("running");
  });
  it("does not treat a bare thinking marker as model reasoning", () => {
    const markerOnly = projectGenerationTranscript([activity("start", "a", "started"), activity("think", "a", "thinking")]).steps[0].calls[0];
    expect(markerOnly.reasoning).toBe("");
    expect(markerOnly.summary).toBe("");
    expect(markerOnly.thinking).toBe(false);
    const summaryOnly = projectGenerationTranscript([activity("summary", "a", "summary", "模型返回的摘要")]).steps[0].calls[0];
    expect(summaryOnly.summary).toBe("模型返回的摘要");
    expect(summaryOnly.thinking).toBe(true);
  });
  it("hides platform-authored summaries when restoring older offline demo events", () => {
    const events = [
      { ...activity("start", "demo", "started"), format: "text" as const },
      { ...activity("summary-a", "demo", "summary", "演示思考摘要：固定演示产物"), format: "text" as const },
      { ...activity("summary-b", "demo", "summary", "继续整理模型"), format: "text" as const },
      { ...activity("output", "demo", "output", "已读取演示模型"), format: "text" as const },
    ];
    const call = projectGenerationTranscript(events).steps[0].calls[0];
    expect(call.summary).toBe("");
    expect(call.reasoning).toBe("");
    expect(call.output).toBe("已读取演示模型");
  });
  it("uses saved visual findings over a generic local subtask message", () => {
    const result = projectGenerationTranscript([
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "usecase", subtaskStatus: "pending_review", message: "视觉检查仍有问题，请人工确认" },
      { type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: {
        usecase: { status: "pending_review", issues: ["标签不可读", "连线交叉"], reason: "视觉检查仍有问题，请人工确认", attempts: 3, checkedAt: "2026-09-23T00:00:00.000Z" },
      } }) },
    ], "completed", [{ id: "verify_diagram_visual:usecase", label: "用例模型", status: "pending_review", message: "视觉检查仍有问题，请人工确认", errorMessage: null }]);
    expect(result.visibleSteps[0].calls[0].message).toBe("标签不可读");
    expect(result.visibleSteps[0].calls[0].review?.issues).toEqual(["标签不可读", "连线交叉"]);
  });
  it("shows human acceptance for the matching historical visual check", () => {
    const review = { status: "pending_review" as const, issues: ["业务条件是否合适需要确认"], reason: "请人工确认", attempts: 3, checkedAt: "check-1" };
    const events: RunEvent[] = [
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "usecase", subtaskStatus: "pending_review", message: review.reason },
      { type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: { usecase: review } }) },
    ];
    const accepted = projectGenerationTranscript(events, "completed", [], { usecase: { ...review, confirmedAt: "confirmed" } });
    expect(accepted.visibleSteps[0].calls[0]).toEqual(expect.objectContaining({ status: "completed", message: "已人工确认当前图" }));
    expect(accepted.finalMessage).not.toContain("待确认");
    const regenerated = projectGenerationTranscript(events, "completed", [], { usecase: { ...review, checkedAt: "check-2", confirmedAt: "confirmed" } });
    expect(regenerated.visibleSteps[0].calls[0].status).toBe("pending_review");
  });
  it.each(["failed", "not_completed"] as const)("replay keeps a %s review actionable after stage completion", (status) => {
    const review = { status, issues: ["结构错误或检查未完成"], reason: "需要处理", attempts: 1, checkedAt: "check-1" };
    const events: RunEvent[] = [
      { ...activity("check", "image", "completed"), stage: "verify_diagram_visual", subtaskId: "usecase", operation: "visual_check" },
      { type: "stage_finished", stage: "verify_diagram_visual", status: "completed" },
      { type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: { usecase: review } }) },
    ];
    const result = projectGenerationTranscript(events, "completed", [], { usecase: { ...review, confirmedAt: "confirmed" } });
    expect(result.steps[0].calls[0].status).toBe(status === "failed" ? "failed" : "pending_review");
    expect(result.steps[0].status).toBe(result.steps[0].calls[0].status);
  });
  it("streams document paragraphs without leaking JSON keys or inventing prose", () => {
    const item = { ...activity("doc", "doc", "output", '{"sections":[{"title":"概述","body":["第一段。","正在生成'), stage: "generate_document_text" as const };
    const call = projectGenerationTranscript([item]).steps[0].calls[0];
    expect(readableOutput(call)).toBe("第一段。\n\n正在生成");
    expect(readableOutput({ ...call, output: '{"sections":[' })).toBe("");
  });
  it("separates interleaved parallel calls and deduplicates replayed fragments", () => {
    const events = [activity("a1", "usecase", "started"), activity("b1", "activity", "started"), activity("a2", "usecase", "output", "用例"), activity("b2", "activity", "output", "流程")];
    const merged = mergeTranscriptEvents(events, [...events, activity("a3", "usecase", "output", "图")]);
    const result = projectGenerationTranscript(merged);
    expect(result.steps[0].calls.map((call) => call.output)).toEqual(["用例图", "流程"]);
  });

  it("restores raw reasoning per call without mixing it with answers or provider summaries", () => {
    const events = [
      activity("a1", "usecase", "reasoning", "先列出"), activity("b1", "activity", "reasoning", "分析流程"),
      activity("a2", "usecase", "reasoning", "角色"), activity("a3", "usecase", "summary", "正在分析角色"),
      activity("a4", "usecase", "output", "用例答案"), activity("b2", "activity", "output", "活动答案"),
    ];
    const result = projectGenerationTranscript(mergeTranscriptEvents(events, events));
    expect(result.steps[0].calls.map((call) => [call.reasoning, call.summary, call.output])).toEqual([
      ["先列出角色", "正在分析角色", "用例答案"], ["分析流程", "", "活动答案"],
    ]);
  });

  it("keeps failed attempts and actual summaries separate from retries", () => {
    const result = projectGenerationTranscript([
      activity("a", "first", "started"), activity("b", "first", "thinking"), activity("c", "first", "failed"),
      activity("d", "retry", "started"), activity("e", "retry", "summary", "核对输入"), activity("f", "retry", "completed"),
    ]);
    expect(result.steps[0].calls.map((call) => [call.status, call.summary])).toEqual([["failed", ""], ["completed", "核对输入"]]);
  });

  it("keeps a repair explanation between the original call and its retry", () => {
    const result = projectGenerationTranscript([
      activity("start", "first", "started"), activity("fail", "first", "failed"),
      { type: "stage_progress", stage: "generate_models", progress: 50, message: "发现关系缺失，正在补全。" },
      activity("retry", "second", "started"),
    ]);
    expect(result.steps[0].entries?.map((entry) => entry.kind)).toEqual(["call", "message", "call"]);
  });

  it("only shows executed steps and groups parallel rendering under workflow order", () => {
    const result = projectGenerationTranscript([
      { type: "stage_progress", stage: "render_svg", progress: 90, subtaskId: "usecase", subtaskStatus: "running" },
      activity("a", "activity", "started"),
    ]);
    expect(result.steps.map((step) => step.stage)).toEqual(["generate_models", "render_svg"]);
    expect(result.steps).toHaveLength(2);
  });

  it("flushes to a stable terminal transcript and never adds later updates", () => {
    const original: RunEvent[] = [activity("a", "usecase", "started"), { type: "cancelled", eventId: "end", message: "停止" }];
    const events = mergeTranscriptEvents(original, [activity("late", "usecase", "output", "不可追加")]);
    expect(events).toBe(original);
    expect(projectGenerationTranscript(events).steps[0].calls[0].status).toBe("cancelled");
  });

  it("summarizes actual artifacts and leaves missing historical output absent", () => {
    const result = projectGenerationTranscript([{ type: "completed", snapshot: createRunSnapshot({ svgArtifacts: [], status: "completed" }) }]);
    expect(result.finalMessage).toBe("已生成 0 个图形预览。");
    expect(result.steps).toHaveLength(0);
    expect(readableTaskText("generate_models https://service.example/private")).not.toMatch(/generate_models|https:/);
  });
});

describe("business stage presentation queue", () => {
  const started = (stage: "generate_models" | "generate_plantuml" | "render_svg"): RunEvent => ({ type: "stage_started", stage, tracksCompletion: true });
  const finished = (stage: "generate_models" | "generate_plantuml" | "render_svg"): RunEvent => ({ type: "stage_finished", stage, status: "completed" });

  it("shows downstream output while parallel models and repairs are still running", () => {
    const events: RunEvent[] = [started("generate_models"), activity("a", "usecase", "started"), activity("b", "activity", "started"),
      { ...activity("early", "render", "output", "提前返回的预览"), stage: "render_svg" },
      activity("c", "usecase", "completed"),
      { type: "artifact_ready", stage: "generate_models", artifactKind: "model" },
    ];
    expect(projectGenerationTranscript(events).visibleSteps.map((step) => step.stage)).toEqual(["generate_models", "render_svg"]);
    events.push(activity("d", "activity", "failed"), activity("e", "retry", "started"), activity("f", "retry", "completed"));
    expect(projectGenerationTranscript(events).visibleSteps).toHaveLength(2);
    events.push(finished("generate_models"));
    const result = projectGenerationTranscript(events);
    expect(result.visibleSteps.map((step) => step.stage)).toEqual(["generate_models", "render_svg"]);
    expect(result.visibleSteps[1].calls[0].output).toBe("提前返回的预览");
    expect(result.steps[0].status).toBe("completed");
  });

  it("shows each started diagram stage without adding unstarted placeholders", () => {
    const events: RunEvent[] = [started("generate_models")];
    expect(projectGenerationTranscript(events).visibleSteps.map((step) => step.stage)).toEqual(["generate_models"]);
    for (const stage of ["generate_plantuml", "render_svg", "verify_diagram_visual"] as const) {
      events.push({ type: "stage_progress", stage, progress: 75, subtaskId: "usecase", subtaskStatus: "running" });
      expect(projectGenerationTranscript(events).visibleSteps.at(-1)?.stage).toBe(stage);
    }
    expect(projectGenerationTranscript(events).visibleSteps).toHaveLength(4);
    expect(projectGenerationTranscript(events).visibleSteps.every((step) => !step.finished)).toBe(true);
  });

  it("does not let stale failure mirrors mark a new retry failed and deduplicates successful artifacts", () => {
    const first = { ...activity("a", "first", "failed"), subtaskId: "usecase" };
    const events: RunEvent[] = [first, { type: "stage_progress", stage: "generate_models", progress: 50, subtaskId: "usecase", subtaskStatus: "failed" },
      { ...activity("retry", "retry", "started"), subtaskId: "usecase" }];
    expect(projectGenerationTranscript(events).steps[0].calls.map((call) => call.status)).toEqual(["failed", "running"]);
    const finishedRetry: RunEvent[] = [...events, { ...activity("finish-retry", "retry", "completed"), subtaskId: "usecase" }, finished("generate_models")];
    expect(projectGenerationTranscript(finishedRetry, "completed").steps[0].calls.map((call) => call.status)).toEqual(["failed", "completed"]);
    events.push({ ...activity("done", "retry", "completed"), subtaskId: "usecase" }, { type: "artifact_ready", stage: "generate_models", artifactKind: "model", subtaskId: "usecase" });
    expect(projectGenerationTranscript(events).steps[0].calls).toHaveLength(2);
  });

  it("retains modeling, source generation and rendering as three stable steps", () => {
    const events: RunEvent[] = [];
    for (const stage of ["generate_models", "generate_plantuml", "render_svg"] as const) {
      events.push({ type: "stage_started", stage, tracksCompletion: true }, { type: "stage_finished", stage, status: "completed" });
    }
    const steps = projectGenerationTranscript(events).visibleSteps;
    expect(steps.map((step) => step.stage)).toEqual(["generate_models", "generate_plantuml", "render_svg"]);
    expect(new Set(steps.map((step) => step.id)).size).toBe(3);
  });

  it("reveals buffered content immediately on cancellation or failure", () => {
    const events: RunEvent[] = [started("generate_models"), { ...activity("later", "render", "output", "已收到"), stage: "render_svg" }];
    for (const terminal of [{ type: "cancelled", message: "停止" }, { type: "failed", error: { code: "RUN_LEGACY_FAILURE", message: "失败", retryable: false } }] as RunEvent[]) {
      const result = projectGenerationTranscript([...events, terminal]);
      expect(result.visibleSteps).toHaveLength(2);
      expect(result.visibleSteps[1].calls[0].output).toBe("已收到");
      expect(result.visibleSteps.every((step) => step.finished)).toBe(true);
    }
  });

  it("restores old history and shows only stages with received events", () => {
    const events: RunEvent[] = [{ type: "stage_started", stage: "generate_models" }, { type: "stage_started", stage: "render_svg" }];
    expect(projectGenerationTranscript(events, "completed").visibleSteps).toHaveLength(2);
    expect(projectGenerationTranscript(events).visibleSteps).toHaveLength(2);
    events.push({ type: "artifact_ready", stage: "generate_models", artifactKind: "model", subtaskId: "usecase" });
    expect(projectGenerationTranscript(events).visibleSteps).toHaveLength(2);
    events.push({ type: "artifact_ready", stage: "generate_models", artifactKind: "model" });
    expect(projectGenerationTranscript(events).visibleSteps).toHaveLength(2);
  });
});
