// Regresses one event-driven artifact timeline across rules, models, plans and documents.
import { describe, expect, it } from "vitest";
import type { RunActivityEvent, RunEventInput, RunStage, RunToolEvent } from "@uml-platform/contracts";
import { i18n } from "../../../shared/i18n/index";
import { createRunSnapshot } from "../../../../tests/helpers/workspace-test-utils";
import { requirementGenerationSubtasks } from "../../workspace-session/lib/generation-planning";
import { projectGenerationTranscript } from "./generation-transcript";
import { groupGenerationArtifactTasks } from "./generation-artifact-tasks";

function activity(id: string, stage: RunStage, target: string, options: Partial<RunActivityEvent> = {}): RunActivityEvent {
  return { type: "run_activity", eventId: id, runId: "r", callId: id, createdAt: "2026-10-25T00:00:00Z",
    stage, modelId: target, subtaskId: target, subtaskLabel: target, phase: "completed", format: "technical", ...options };
}
function tool(id: string, stage: RunStage, target: string, name: RunToolEvent["toolName"], phase: RunToolEvent["phase"] = "completed"): RunToolEvent {
  return { type: "run_tool", eventId: `${id}:tool`, runId: "r", callId: id, toolCallId: `${id}:tool`,
    createdAt: "2026-10-25T00:00:00Z", stage, modelId: target, subtaskId: target, toolName: name, phase };
}
function project(events: RunEventInput[], status = "running", subtasks = requirementGenerationSubtasks([], {})) {
  return groupGenerationArtifactTasks(projectGenerationTranscript(events, status, subtasks, {}, { includeContent: false }).steps, i18n.t);
}

describe("shared generation artifact timeline", () => {
  it.each([
    ["extract_rules", "requirement-rules"], ["generate_models", "model"], ["generate_design_models", "model"],
    ["generate_context", "model"], ["generate_business_flow", "model"],
    ["generate_implementation", "implementation"], ["generate_document_text", "document"],
  ] as const)("uses the same attempt and repair projection for %s", (stage, artifactType) => {
    const events: RunEventInput[] = [activity("initial", stage, "target"),
      activity("repair", stage, "target", { operation: "model_repair", round: 1 })];
    const [task] = project(events, "completed");
    expect(task.artifactType).toBe(artifactType);
    expect(task.calls.map(call => [call.id, call.operation, call.round])).toEqual([["initial", undefined, undefined], ["repair", "model_repair", 1]]);
    expect(project([...events, ...events], "completed")).toEqual([task]);
  });

  it("keeps a completed upstream query running until the artifact receives its terminal receipt", () => {
    const [task] = project([activity("query", "generate_models", "usecase"), tool("query", "generate_models", "usecase", "get_upstream_artifact")]);
    expect(task).toMatchObject({ status: "running", finished: false });
    expect(task.calls[0].tools).toMatchObject([{ name: "get_upstream_artifact", status: "completed" }]);
  });

  it("never creates publication work for a failed sibling from planned downstream statuses", () => {
    const subtasks = requirementGenerationSubtasks(["usecase", "class"], {}).map(task => task.id.endsWith(":class") ? { ...task, status: "failed" as const } : task);
    const events: RunEventInput[] = [activity("uc", "generate_models", "usecase"), activity("class", "generate_models", "class", { phase: "failed" }),
      { type: "stage_started", stage: "generate_plantuml" }, { type: "stage_started", stage: "verify_diagram_visual" },
      { type: "artifact_ready", stage: "render_svg", artifactKind: "svg", subtaskId: "usecase", diagramKind: "usecase" }];
    const tasks = project(events, "failed", subtasks);
    expect(tasks).toHaveLength(2);
    const failed = tasks.find(task => task.diagramKind === "class")!;
    expect(failed.calls.map(call => call.id)).toEqual(["class"]);
    expect(tasks.find(task => task.diagramKind === "usecase")!.calls.at(-1)).toMatchObject({ title: "绘制并保存", status: "completed" });
    expect(tasks.map(task => task.title).join()).not.toMatch(/生成图形描述|生成图形预览|模型结构检查/);
  });

  it("retains failed validation, successful correction and one actual publication in event order", () => {
    const events: RunEventInput[] = [activity("query", "generate_models", "function"), tool("query", "generate_models", "function", "get_upstream_artifact"),
      activity("initial", "generate_models", "function"), tool("initial", "generate_models", "function", "validate_model", "failed"),
      activity("repair", "generate_models", "function", { operation: "model_repair", round: 1 }), tool("repair", "generate_models", "function", "validate_model"),
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "function", subtaskStatus: "completed" },
      { type: "artifact_ready", stage: "generate_plantuml", artifactKind: "plantuml", subtaskId: "function" },
      { type: "artifact_ready", stage: "render_svg", artifactKind: "svg", subtaskId: "function" }];
    const saved = events.map((event, index) => ({ ...event, eventId: event.eventId ?? `receipt:${index}` }));
    const [task] = project(saved, "completed");
    expect(task.status).toBe("completed");
    expect(task.calls.map(call => call.operation ?? call.id)).toEqual(["query", "initial", "model_repair", "publish"]);
    expect(task.calls.flatMap(call => call.tools ?? []).map(tool => tool.status)).toEqual(["completed", "failed", "completed"]);
    expect(project([...saved, ...saved], "completed")).toEqual([task]);
  });

  it("does not attach publication to an arbitrary sibling with the same diagram kind", () => {
    const tasks = project([activity("a", "generate_models", "analysis:a"), activity("b", "generate_models", "analysis:b"),
      { type: "stage_progress", stage: "render_svg", progress: 90, diagramKind: "analysis", subtaskId: "analysis:b", subtaskStatus: "completed" }], "completed");
    const children = tasks[0].children!;
    expect(children[0].calls).toHaveLength(1);
    expect(children[1].calls.at(-1)?.operation).toBe("publish");
  });

  it("uses the latest publication failure even when that operation started before a successful receipt", () => {
    const [task] = project([activity("model", "generate_models", "function"),
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "function", subtaskStatus: "running" },
      { type: "artifact_ready", stage: "render_svg", artifactKind: "svg", subtaskId: "function" },
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "function", subtaskStatus: "failed" }], "failed");
    expect(task.status).toBe("failed");
    expect(task.calls.at(-1)).toMatchObject({ operation: "publish", status: "failed" });
  });

  it("retains a standalone file export without inventing a text generation task", () => {
    const tasks = project([{ type: "stage_started", stage: "render_document_file" }]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: "排版并生成文档", status: "running" });
  });

  it("preserves a real standalone model correction instead of relabeling it as drawing", () => {
    const [task] = project([activity("repair", "verify_diagram_visual", "function", { operation: "model_repair", round: 1 })], "completed");
    expect(task.calls[0]).toMatchObject({ operation: "model_repair", round: 1 });
    expect(task.artifactType).toBe("model");
  });

  it("keeps a saved pending verdict authoritative over earlier successful preview receipts", () => {
    const [task] = project([activity("model", "generate_models", "function"),
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, subtaskId: "function", subtaskStatus: "pending_review" },
      { type: "artifact_ready", stage: "render_svg", artifactKind: "svg", subtaskId: "function" },
      { type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: {
        function: { findings: [], status: "pending_review", issues: ["需要确认"], reason: "需要确认", attempts: 1, checkedAt: "2026-10-25T00:00:00Z" },
      } }) }], "completed");
    expect(task.status).toBe("pending_review");
    expect(task.calls.at(-1)).toMatchObject({ operation: "publish", status: "pending_review" });
  });

  it("groups document chapters, corrections and file export as one document artifact", () => {
    const [task] = project([activity("chapter-1", "generate_document_text", "document:chapter:0", { subtaskLabel: "概述" }),
      activity("chapter-2", "generate_document_text", "document:chapter:1", { subtaskLabel: "系统设计" }),
      activity("repair", "generate_document_text", "document:chapter:0", { operation: "model_repair", round: 1 }),
      { type: "stage_started", stage: "render_document_file" }, { type: "stage_finished", stage: "render_document_file", status: "completed" }], "completed");
    expect(task.artifactType).toBe("document");
    expect(task.calls.map(call => call.operation ?? call.id)).toEqual(["chapter-1", "chapter-2", "model_repair", "publish"]);
    expect(task.calls.at(-1)?.title).toBe("排版并生成文档");
  });

  it("cancellation stops unfinished tools in the same task projection", () => {
    const [task] = project([activity("query", "generate_implementation", "implementation", { phase: "started" }),
      tool("query", "generate_implementation", "implementation", "get_upstream_artifact", "started"), { type: "cancelled", message: "已停止" }]);
    expect(task).toMatchObject({ status: "cancelled", finished: true });
    expect(task.calls[0].tools?.[0].status).toBe("cancelled");
  });

  it("keeps a cancelled named-model category stopped along with its children", () => {
    const [task] = project([activity("query", "generate_design_sequence", "sequence:case-a", { phase: "started" }),
      tool("query", "generate_design_sequence", "sequence:case-a", "get_upstream_artifact", "started"), { type: "cancelled", message: "已停止" }]);
    expect(task).toMatchObject({ status: "cancelled", finished: true });
    expect(task.children?.[0]).toMatchObject({ status: "cancelled", finished: true });
  });
});
