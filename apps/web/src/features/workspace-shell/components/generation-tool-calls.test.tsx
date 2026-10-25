// Regresses model-scoped tool visibility, validation retries, cancellation, and compact history replay.
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { RunActivityEvent, RunEventInput, RunStage, RunToolEvent } from "@uml-platform/contracts";
import { i18n } from "../../../shared/i18n/index";
import { progressTranscriptEvents } from "../../workspace-session/lib/run-transcript";
import { projectGenerationTranscript } from "../lib/generation-transcript";
import { GenerationTranscript } from "./generation-transcript";

afterEach(async () => { await act(async () => { await i18n.changeLanguage("zh-CN"); }); });

it("retains compiler failure, same-session model correction and final publication in live and replay drawers", () => {
  const metadata = { type: "run_activity" as const, runId: "run", stage: "generate_models" as const, modelId: "analysis:case",
    subtaskId: "analysis:case", subtaskLabel: "需求分析模型：反馈或申诉", format: "technical" as const,
    operation: "model_compile" as const, createdAt: "2026-10-25T00:00:00Z" };
  const events: RunEventInput[] = [
    ...attempt("query", "get_upstream_artifact", "completed", "generate_models", "analysis:case"),
    ...attempt("candidate", "validate_model", "completed", "generate_models", "analysis:case"),
    { ...metadata, callId: "compile-initial", eventId: "compile-initial:start", phase: "started" },
    { ...metadata, callId: "compile-initial", eventId: "compile-initial:failed", phase: "failed" },
    ...attempt("correction", "validate_model", "completed", "generate_models", "analysis:case").map(event =>
      event.type === "run_activity" ? { ...event, operation: "model_repair" as const, round: 1 } : event),
    { ...metadata, callId: "compile-corrected", eventId: "compile-corrected:start", phase: "started" },
    { ...metadata, callId: "compile-corrected", eventId: "compile-corrected:completed", phase: "completed" },
    { type: "artifact_ready", eventId: "published-svg", stage: "render_svg", artifactKind: "svg", modelId: "analysis:case", subtaskId: "analysis:case", subtaskStatus: "completed" },
  ];
  const compact = progressTranscriptEvents(events);
  const live = projectGenerationTranscript(compact, "completed", [], {}, { includeContent: false });
  const replay = projectGenerationTranscript([...compact, ...compact], "completed", [], {}, { includeContent: false });
  expect(replay.steps).toEqual(live.steps);
  const { container } = render(<GenerationTranscript taskKey="compiler-correction" kind="requirements" active={false} finalMessage="已完成" steps={live.steps} />);
  const timeline = Array.from(container.querySelectorAll('[data-slot="generation-call-title"], [data-slot="generation-tool-call"]')).map(row => row.textContent);
  const failed = timeline.findIndex(text => text?.includes("编译失败"));
  const corrected = timeline.findIndex(text => text?.includes(i18n.t("generation.tools.repairModel")));
  const passed = timeline.findIndex(text => text?.includes("编译通过"));
  const published = timeline.findIndex(text => text?.includes("绘制并保存"));
  expect(failed).toBeGreaterThan(-1);
  expect(corrected).toBeGreaterThan(failed);
  expect(passed).toBeGreaterThan(corrected);
  expect(published).toBeGreaterThan(passed);
  expect(container).not.toHaveTextContent("重建图形");
  expect(container).not.toHaveTextContent("PRIVATE_MODEL_JSON");
});

function attempt(id: string, toolName: RunToolEvent["toolName"], phase: "completed" | "failed", stage: RunStage, subtaskId: string): RunEventInput[] {
  const metadata = { runId: "run", callId: id, stage, subtaskId, modelId: subtaskId, subtaskLabel: "当前模型", createdAt: "2026-10-25T00:00:00Z" };
  const activity: RunActivityEvent = { ...metadata, type: "run_activity", eventId: `${id}:call`, phase: "completed", format: "technical", artifactKind: stage === "extract_rules" ? "requirement-rules" : "model" };
  const tool: RunToolEvent = { ...metadata, type: "run_tool", toolCallId: `tool-${id}`, toolName, phase: "started", eventId: `${id}:start` };
  return [activity, { ...activity, phase: "output", eventId: `${id}:json`, text: "PRIVATE_MODEL_JSON" }, tool,
    { ...tool, eventId: `${id}:end`, phase,
      ...(phase === "failed" ? { errorCount: 2 } : {}),
      ...(toolName === "get_upstream_artifact" ? { source: { sourceType: "requirement_rules", sourceId: "requirements:rules" } as const } : {}) }];
}

it.each([
  ["requirements", "generate_models", "usecase"],
  ["design", "generate_design_sequence", "sequence:case-a"],
  ["feasibility", "generate_implementation", "implementation"],
] as const)("%s shows all tools and retains failed validation before a successful correction", (kind, stage, target) => {
  const events = [
    ...attempt("query", "get_upstream_artifact", "completed", stage, target),
    ...attempt("invalid", "validate_model", "failed", stage, target),
    ...attempt("corrected", "validate_model", "completed", stage, target),
  ];
  const compact = progressTranscriptEvents(events);
  const live = projectGenerationTranscript(compact, "completed", [], {}, { includeContent: false });
  const replay = projectGenerationTranscript([...compact, ...compact], "completed", [], {}, { includeContent: false });
  expect(replay.steps).toEqual(live.steps);
  expect(live.steps[0]!.calls.flatMap(call => call.tools ?? []).map(tool => [tool.name, tool.status])).toEqual([
    ["get_upstream_artifact", "completed"], ["validate_model", "failed"], ["validate_model", "completed"],
  ]);
  const { container } = render(<GenerationTranscript taskKey={kind} kind={kind} active={false} finalMessage="已完成" steps={live.visibleSteps} />);
  expect(screen.getByText("查询上游资料：需求规则")).toBeVisible();
  expect(screen.queryByText("get_upstream_artifact")).not.toBeInTheDocument();
  expect(screen.queryByText("validate_model")).not.toBeInTheDocument();
  expect(screen.queryByText("调用详情")).not.toBeInTheDocument();
  expect(container.querySelector("details")).toBeNull();
  expect(container).not.toHaveTextContent("requirements:rules");
  expect(screen.queryByText("提交并复验模型")).toBeNull();
  const failed = screen.getByText("发现 2 处问题").closest("li")!;
  expect(within(failed).getByText("未通过")).toBeVisible();
  expect(container.querySelectorAll('[data-slot="generation-call-title"]')).toHaveLength(1);
  expect(container).not.toHaveTextContent("PRIVATE_MODEL_JSON");
  expect(container.querySelectorAll('[data-slot="generation-tool-call"]')).toHaveLength(3);
});

it("shows each upstream query from one batched LLM call in live and replayed history", () => {
  const sources: NonNullable<RunToolEvent["source"]>[] = [
    { sourceType: "requirement_rules", sourceId: "requirements:rules", label: "需求规则" },
    { sourceType: "requirement_baseline", sourceId: "requirements:baseline", label: "需求基线" },
    { sourceType: "feasibility_inputs", sourceId: "feasibility:inputs", label: "可行性分析输入" },
  ];
  const events = sources.flatMap((source, index) => attempt(`batch-query-${index}`, "get_upstream_artifact", "completed", "generate_business_flow", "activity")
    .filter(event => index === 0 || event.type === "run_tool")
    .map(event => event.type === "run_activity" || event.type === "run_tool"
      ? { ...event, callId: "batch", ...(event.type === "run_tool" && event.phase === "completed" ? { source } : {}) } : event));
  const compact = progressTranscriptEvents(events);
  const live = projectGenerationTranscript(compact, "running", [], {}, { includeContent: false });
  const replay = projectGenerationTranscript([...compact, ...compact], "running", [], {}, { includeContent: false });
  expect(replay.steps).toEqual(live.steps);
  expect(live.steps[0]!.calls).toHaveLength(1);
  expect(live.steps[0]!.calls[0]!.tools?.map(tool => [tool.id, tool.status])).toEqual([
    ["tool-batch-query-0", "completed"], ["tool-batch-query-1", "completed"], ["tool-batch-query-2", "completed"],
  ]);
  const { container } = render(<GenerationTranscript taskKey="batch" kind="feasibility" active finalMessage="" steps={live.steps} />);
  for (const source of sources) expect(screen.getByText(`查询上游资料：${source.label}`)).toBeVisible();
  expect(container.querySelectorAll('[data-slot="generation-tool-call"]')).toHaveLength(3);
  expect(container.querySelector('[data-slot="generation-call-title"]')).toBeNull();
});

it("keeps parallel use-case tools with their exact owning model", () => {
  const events = [...attempt("a", "validate_model", "failed", "generate_design_sequence", "sequence:a"),
    ...attempt("b", "validate_model", "completed", "generate_design_sequence", "sequence:b")];
  const calls = projectGenerationTranscript(events, "running", [], {}, { includeContent: false }).steps[0]!.calls;
  expect(calls).toHaveLength(2);
  expect(calls.find(call => call.subtaskId === "sequence:a")?.tools?.map(tool => tool.name)).toEqual(["validate_model"]);
  expect(calls.find(call => call.subtaskId === "sequence:b")?.tools?.map(tool => tool.name)).toEqual(["validate_model"]);
});

it("stops unfinished tools on cancellation and does not invent tool history for old runs", () => {
  const events = attempt("query", "get_upstream_artifact", "completed", "generate_models", "usecase").slice(0, -1);
  const result = projectGenerationTranscript([...events, { type: "cancelled", message: "停止" }]);
  expect(result.steps[0]!.calls[0]!.tools?.[0]!.status).toBe("cancelled");
  const old = projectGenerationTranscript(events.filter(event => event.type === "run_activity"), "completed");
  expect(old.steps[0]!.calls[0]!.tools).toBeUndefined();
});

it("localizes tool progress without exposing technical call details", async () => {
  await act(async () => { await i18n.changeLanguage("en"); });
  const events = attempt("submit", "validate_model", "completed", "generate_models", "usecase");
  const result = projectGenerationTranscript(events, "completed", [], {}, { includeContent: false });
  render(<GenerationTranscript taskKey="english" active={false} finalMessage="" steps={result.steps} />);
  expect(screen.getByText("Validate model and mappings")).toBeVisible();
  expect(screen.queryByText("validate_model")).not.toBeInTheDocument();
  expect(screen.queryByText("Call details")).not.toBeInTheDocument();
});

it.each([
  ["requirements", "generate_models", "usecase", "用例图"],
  ["design", "generate_design_models", "class", "设计类图"],
  ["feasibility", "generate_business_flow", "activity", "业务流程图"],
  ["feasibility", "generate_implementation", "implementation", "实现方案"],
  ["requirements", "extract_rules", "requirement-rules", "需求规则抽取"],
] as const)("%s/%s flattens tool steps and labels only generation and corrections", (kind, stage, target, label) => {
  const rules = stage === "extract_rules";
  const events = [
    ...attempt("query", "get_upstream_artifact", "completed", stage, target),
    ...attempt("invalid", rules ? "validate_requirement_rules" : "validate_model", "failed", stage, target),
    ...attempt("corrected", rules ? "validate_requirement_rules" : "validate_model", "completed", stage, target),
    ...(rules ? attempt("submitted", "submit_requirement_rules", "completed", stage, target) : []),
  ].map(event => event.type === "run_activity" || event.type === "run_tool" ? { ...event, subtaskLabel: label,
    ...(event.type === "run_activity" && event.callId === "corrected" ? { operation: "model_repair" as const, round: 1 } : {}) } : event);
  const transcript = projectGenerationTranscript(events, "completed", [], {}, { includeContent: false });
  const { container } = render(<GenerationTranscript taskKey={stage} kind={kind} active={false} finalMessage="" steps={transcript.steps} />);
  const titles = container.querySelectorAll('[data-slot="generation-call-title"]');
  expect(titles).toHaveLength(2);
  expect(titles[0]).toHaveTextContent("生成完成");
  expect(titles[1]).toHaveTextContent(`${rules ? "修正规则" : stage === "generate_implementation" ? "修正实现方案" : "修正模型"} · 第 1 次`);
  if (stage !== "generate_implementation") expect(titles[1]).not.toHaveTextContent(label);
  const timeline = Array.from(container.querySelectorAll('[data-slot="generation-call-title"], [data-slot="generation-tool-call"]'));
  expect(timeline[0]).toHaveTextContent("查询上游资料：需求规则");
  expect(timeline[1]).toBe(titles[0]);
  expect(timeline[2]).toHaveTextContent(rules ? "校验需求规则" : stage === "generate_implementation" ? "校验实现方案" : "校验模型与来源映射");
  if (rules) expect(screen.getByText("提交并复验需求规则")).toBeVisible();
  else expect(screen.queryByText("提交并复验模型")).toBeNull();
  expect(container.querySelectorAll('[data-slot="generation-tool-call"]')).toHaveLength(rules ? 4 : 3);
});

it("does not claim candidate generation before live tool arguments arrive and keeps query sources inline", () => {
  const events = attempt("live", "get_upstream_artifact", "completed", "generate_business_flow", "activity");
  const started = events[0] as RunActivityEvent;
  const initial = { ...started, phase: "started" as const, subtaskLabel: "业务流程图" };
  const { rerender } = render(<GenerationTranscript taskKey="live" kind="feasibility" active finalMessage="" steps={projectGenerationTranscript([initial]).steps} />);
  expect(document.querySelector('[data-slot="generation-call-title"]')).toBeNull();
  const updated = events.map(event => event.type === "run_tool" && event.phase === "completed"
    ? { ...event, source: { sourceType: "model" as const, sourceId: "usecase:student", label: "学生用例图" } } : event);
  rerender(<GenerationTranscript taskKey="live" kind="feasibility" active finalMessage="" steps={projectGenerationTranscript(updated).steps} />);
  expect(screen.getByText("查询上游资料：学生用例图")).toBeVisible();
  expect(document.querySelector('[data-slot="generation-call-title"]')).toBeNull();
});

it("shows candidate extraction only when validation receives rules, including history replay", () => {
  const query = attempt("query", "get_upstream_artifact", "completed", "extract_rules", "requirement-rules")
    .map(event => event.type === "run_tool" ? { ...event, source: { sourceType: "requirement_source" as const, sourceId: "requirements:source", label: "需求原文" } } : event);
  const validation = attempt("validation", "validate_requirement_rules", "failed", "extract_rules", "requirement-rules");
  const steps = (events: RunEventInput[]) => projectGenerationTranscript(progressTranscriptEvents(events), "running", [], {}, { includeContent: false }).steps;
  const { container, rerender } = render(<GenerationTranscript taskKey="rules" kind="requirements" active finalMessage="" steps={steps(query)} />);
  expect(screen.getByText("查询上游资料：需求原文")).toBeVisible();
  expect(container.querySelector('[data-slot="generation-call-title"]')).toBeNull();
  expect(container).not.toHaveTextContent("requirements:source");

  rerender(<GenerationTranscript taskKey="rules" kind="requirements" active finalMessage="" steps={steps([...query, ...validation])} />);
  const timelineText = () => Array.from(container.querySelectorAll('[data-slot="generation-call-title"], [data-slot="generation-tool-call"]')).map(row => row.textContent);
  const live = timelineText();
  expect(live).toHaveLength(3);
  expect(live[0]).toContain("查询上游资料：需求原文");
  expect(live[1]).toContain("生成完成");
  expect(live[2]).toContain("校验需求规则");
  expect(live[2]).toContain("未通过");
  rerender(<GenerationTranscript taskKey="rules" kind="requirements" active finalMessage="" steps={steps([...query, ...validation, ...query, ...validation])} />);
  expect(timelineText()).toEqual(live);
});

it("does not invent an upstream query when extraction uses source text already in the prompt", () => {
  const events = attempt("validation", "validate_requirement_rules", "completed", "extract_rules", "requirement-rules");
  const transcript = projectGenerationTranscript(events, "running", [], {}, { includeContent: false });
  render(<GenerationTranscript taskKey="rules-direct" kind="requirements" active finalMessage="" steps={transcript.steps} />);
  expect(screen.getByText("生成完成")).toBeVisible();
  expect(screen.getByText("校验需求规则")).toBeVisible();
  expect(screen.queryByText(/查询上游资料/)).not.toBeInTheDocument();
});

it("shows document corrections and export through the shared artifact timeline without invented tools", () => {
  const base: RunActivityEvent = { type: "run_activity", eventId: "chapter", callId: "chapter", runId: "doc", createdAt: "2026-10-25T00:00:00Z",
    stage: "generate_document_text", subtaskId: "document:chapter:0", modelId: "document:chapter:0", subtaskLabel: "系统概述", phase: "completed", format: "technical" };
  const events: RunEventInput[] = [base, { ...base, eventId: "correction", callId: "correction", operation: "model_repair", round: 1 },
    { type: "stage_started", stage: "render_document_file" }, { type: "stage_finished", stage: "render_document_file", status: "completed" }];
  const transcript = projectGenerationTranscript(events, "completed", [], {}, { includeContent: false });
  const { container } = render(<GenerationTranscript taskKey="doc" kind="document" active={false} finalMessage="" steps={transcript.steps} />);
  expect(screen.getByRole("heading", { name: "生成说明书正文" })).toBeVisible();
  const rows = Array.from(container.querySelectorAll('[data-slot="generation-call-title"]'));
  expect(rows.map(row => row.textContent)).toEqual([expect.stringContaining("生成完成"), expect.stringContaining("修正说明书 · 第 1 次"), expect.stringContaining("排版并生成文档")]);
  expect(container.querySelector('[data-slot="generation-tool-call"]')).toBeNull();
  expect(container).not.toHaveTextContent("模型结构检查");
});

it.each([
  ["requirements", "generate_models", "activity", "总体业务流程", "校验模型与来源映射", "修正模型"],
  ["feasibility", "generate_business_flow", "activity", "业务流程图", "校验模型与来源映射", "修正模型"],
  ["feasibility", "generate_implementation", "implementation", "实现方案", "校验实现方案", "修正实现方案"],
  ["requirements", "extract_rules", "requirement-rules", "需求规则", "校验需求规则", "修正规则"],
] as const)("%s/%s keeps each failed check before its correction and labels the following recheck", (kind, stage, target, label, validation, correction) => {
  const events = [
    ...attempt("query", "get_upstream_artifact", "completed", stage, target),
    ...attempt("candidate", stage === "extract_rules" ? "validate_requirement_rules" : "validate_model", "failed", stage, target),
    ...attempt("repair-1", stage === "extract_rules" ? "validate_requirement_rules" : "validate_model", "failed", stage, target),
    ...attempt("repair-2", stage === "extract_rules" ? "validate_requirement_rules" : "validate_model", "completed", stage, target),
  ].map(event => event.type === "run_activity" || event.type === "run_tool" ? { ...event, subtaskLabel: label,
    ...(event.type === "run_activity" && event.callId.startsWith("repair-") ? { operation: "model_repair" as const, round: Number(event.callId.at(-1)) } : {}) } : event);
  const project = (input: RunEventInput[]) => projectGenerationTranscript(progressTranscriptEvents(input), "running", [], {}, { includeContent: false }).steps;
  const { container, rerender } = render(<GenerationTranscript taskKey="validation-order" kind={kind} active finalMessage="" steps={project(events.slice(0, 8))} />);
  const timeline = () => Array.from(container.querySelectorAll('[data-slot="generation-call-title"], [data-slot="generation-tool-call"]')).map(row => row.textContent);
  expect(timeline()).toEqual([
    expect.stringContaining("查询上游资料：需求规则"), expect.stringContaining("生成完成"), expect.stringContaining(`${validation}未通过`),
  ]);
  rerender(<GenerationTranscript taskKey="validation-order" kind={kind} active finalMessage="" steps={project(events)} />);
  const live = timeline();
  expect(live).toEqual([
    expect.stringContaining("查询上游资料：需求规则"), expect.stringContaining("生成完成"), expect.stringContaining(`${validation}未通过`),
    expect.stringContaining(`${correction} · 第 1 次`), expect.stringContaining(`再次${validation}未通过`),
    expect.stringContaining(`${correction} · 第 2 次`), expect.stringContaining(`再次${validation}已通过`),
  ]);
  rerender(<GenerationTranscript taskKey="validation-order" kind={kind} active={false} finalMessage="" steps={project([...events, ...events])} />);
  expect(timeline()).toEqual(live);
});

it("shows an unsuccessful generation and retries without inventing an earlier model validation", () => {
  const rejected = attempt("rejected", "validate_model", "failed", "generate_models", "activity")
    .filter(event => event.type === "run_activity" && event.phase !== "output")
    .map(event => ({ ...event, phase: "failed" as const }));
  const events = [
    ...attempt("query", "get_upstream_artifact", "completed", "generate_models", "activity"), ...rejected,
    ...attempt("retry", "validate_model", "failed", "generate_models", "activity"),
    ...attempt("correction", "validate_model", "completed", "generate_models", "activity"),
  ].map(event => event.type === "run_activity" || event.type === "run_tool" ? { ...event, subtaskLabel: "总体业务流程",
    ...(event.type === "run_activity" && ["retry", "correction"].includes(event.callId)
      ? { operation: "model_repair" as const, round: event.callId === "retry" ? 1 : 2 } : {}) } : event);
  const { container } = render(<GenerationTranscript taskKey="protocol-retry" kind="requirements" active={false} finalMessage="" steps={projectGenerationTranscript(events, "completed").steps} />);
  const timeline = Array.from(container.querySelectorAll('[data-slot="generation-call-title"], [data-slot="generation-tool-call"]')).map(row => row.textContent);
  expect(timeline).toEqual([
    expect.stringContaining("查询上游资料：需求规则"), expect.stringContaining("生成未完成"),
    expect.stringContaining("重试生成模型 · 第 1 次"), expect.stringContaining("校验模型与来源映射未通过"),
    expect.stringContaining("修正模型 · 第 2 次"), expect.stringContaining("再次校验模型与来源映射已通过"),
  ]);
  expect(container.querySelectorAll('[data-slot="generation-tool-call"]')).toHaveLength(3);
});

it("does not reuse another parallel model's failed validation to label a first check", async () => {
  await act(async () => { await i18n.changeLanguage("en"); });
  const events = [
    ...attempt("failed-a", "validate_model", "failed", "generate_design_sequence", "sequence:a"),
    ...attempt("retry-b", "validate_model", "completed", "generate_design_sequence", "sequence:b")
      .map(event => event.type === "run_activity" ? { ...event, operation: "model_repair" as const, round: 1 } : event),
  ].map(event => event.type === "run_activity" || event.type === "run_tool"
    ? { ...event, subtaskLabel: event.subtaskId === "sequence:a" ? "处理报警" : "配置系统" } : event);
  const { container } = render(<GenerationTranscript taskKey="parallel-retry" kind="design" active={false} finalMessage="" steps={projectGenerationTranscript(events, "completed").steps} />);
  expect(screen.getByText("Retry model generation · Attempt 1")).toBeVisible();
  expect(screen.getAllByText("Validate model and mappings")).toHaveLength(2);
  expect(container).not.toHaveTextContent("Revalidate model and mappings");
  expect(container).not.toHaveTextContent("Correct model");
});
