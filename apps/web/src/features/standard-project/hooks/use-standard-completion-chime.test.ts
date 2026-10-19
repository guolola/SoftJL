// Covers quick-modeling completion sounds across tool loops, restored runs, cancellation and project changes.
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createStandardProjectState, type StandardProjectState } from "@uml-platform/contracts";
import { playCompletionChime } from "../../../shared/lib/completion-chime";
import { resetGenerationCompletionChimeForTests } from "../../../shared/lib/generation-completion-chime";
import { useStandardCompletionChime } from "./use-standard-completion-chime";

vi.mock("../../../shared/lib/completion-chime", () => ({ playCompletionChime: vi.fn() }));
type Run = NonNullable<StandardProjectState["run"]>;
function snapshot(status: Run["status"], tools = ["generate_diagrams"], overrides: Partial<Run> = {}): StandardProjectState {
  return { ...createStandardProjectState(), run: { id: "run-a", requestId: "request-a", operation: "chat", startedAt: "now", status, ...overrides },
    conversation: [
      { id: "user:request-a", role: "user", text: "生成图表", status: "completed", createdAt: "now" },
      { id: "assistant", role: "assistant", text: "", status: "completed", createdAt: "now", tools: tools.map(name => ({ id: name, name, status: status === "running" ? "running" : status === "failed" ? "failed" : "completed" })) },
    ] };
}
function mount(initial: StandardProjectState | null) {
  return renderHook(({ projectId, state }) => useStandardCompletionChime(projectId, state), { initialProps: { projectId: "p", state: initial } });
}
beforeEach(() => { vi.clearAllMocks(); resetGenerationCompletionChimeForTests(); });

it("waits for the entire agent run and chimes once across multiple generated outputs and repeated polling", () => {
  const hook = mount(snapshot("running", []));
  hook.rerender({ projectId: "p", state: snapshot("running", ["generate_diagrams", "generate_document"]) });
  const finishedTools = snapshot("completed", ["generate_diagrams", "generate_document"]);
  hook.rerender({ projectId: "p", state: { ...finishedTools, run: { ...finishedTools.run!, status: "running" } } });
  expect(playCompletionChime).not.toHaveBeenCalled();
  hook.rerender({ projectId: "p", state: finishedTools });
  hook.rerender({ projectId: "p", state: structuredClone(finishedTools) });
  expect(playCompletionChime).toHaveBeenCalledOnce();
});

it.each(["generate_diagrams", "generate_tests", "generate_document", "save_diagram"])("notifies when the %s tool's run ends with a failure", name => {
  const hook = mount(snapshot("running", [name]));
  hook.rerender({ projectId: "p", state: snapshot("failed", [name]) });
  expect(playCompletionChime).toHaveBeenCalledOnce();
});

it.each(["completed", "failed", "stopped"] as const)("does not chime for restored %s history", status => {
  const hook = mount(snapshot(status));
  hook.rerender({ projectId: "p", state: snapshot(status) });
  expect(playCompletionChime).not.toHaveBeenCalled();
});

it("keeps cancellations silent and does not replay a completed run after remounting", () => {
  const hook = mount(snapshot("running"));
  hook.rerender({ projectId: "p", state: snapshot("stopped") });
  expect(playCompletionChime).not.toHaveBeenCalled();
  hook.rerender({ projectId: "p", state: snapshot("running", ["generate_tests"], { id: "run-b" }) });
  hook.rerender({ projectId: "p", state: snapshot("completed", ["generate_tests"], { id: "run-b" }) });
  expect(playCompletionChime).toHaveBeenCalledOnce();
  hook.unmount();
  const recovered = mount(snapshot("running", ["generate_tests"], { id: "run-b" }));
  recovered.rerender({ projectId: "p", state: snapshot("completed", ["generate_tests"], { id: "run-b" }) });
  expect(playCompletionChime).toHaveBeenCalledOnce();
});

it.each([[], ["read_project", "read_diagram"], ["ask_questions"]])("keeps conversational-only tools silent: %j", (...tools) => {
  const hook = mount(snapshot("running", tools));
  hook.rerender({ projectId: "p", state: snapshot("completed", tools) });
  expect(playCompletionChime).not.toHaveBeenCalled();
});

it("ignores generation tools from earlier user turns", () => {
  const older = snapshot("completed").conversation!;
  const current = snapshot("running", ["read_project"]);
  current.conversation = [...older.map(message => ({ ...message, id: `older:${message.id}` })), ...current.conversation!];
  const hook = mount(current);
  hook.rerender({ projectId: "p", state: { ...current, run: { ...current.run!, status: "completed" } } });
  expect(playCompletionChime).not.toHaveBeenCalled();
});

it.each([
  { operation: "generate" }, { operation: "tests" }, { operation: "requirementsSpec" }, { operation: "softwareDesignSpec" },
  { work: { ids: ["class"] } }, { resumeOperation: "softwareDesignSpec" },
] satisfies Partial<Run>[])("supports persisted direct or resumed generation metadata: %j", metadata => {
  const hook = mount(snapshot("running", [], metadata));
  hook.rerender({ projectId: "p", state: snapshot("completed", [], metadata) });
  expect(playCompletionChime).toHaveBeenCalledOnce();
});

it("does not notify on a project switch but observes a run already in progress in the new project", () => {
  const hook = mount(snapshot("running"));
  hook.rerender({ projectId: "other", state: snapshot("completed") });
  expect(playCompletionChime).not.toHaveBeenCalled();
  hook.rerender({ projectId: "other", state: snapshot("running", ["generate_document"], { id: "run-other" }) });
  hook.rerender({ projectId: "other", state: snapshot("completed", ["generate_document"], { id: "run-other" }) });
  expect(playCompletionChime).toHaveBeenCalledOnce();
});
