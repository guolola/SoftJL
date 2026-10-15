// Verifies active generation and failures take precedence over retained model artifacts.
import { describe, expect, it } from "vitest";
import { createGenerationTask } from "../../workspace-session/lib/generation-tasks";
import type { GenerationSubtask } from "../../workspace-session/model/session-state";
import { generationCardStatus, modelCardTaskStatus } from "./model-card-status";

function task(status: GenerationSubtask["status"], id = "render_svg:sequence:uc-1") {
  return {
    ...createGenerationTask({ clientTaskId: "task", kind: "design", title: "设计", providerModel: null, startedAt: "2026-01-01", message: "" }),
    subtasks: [{ id, label: "模型", status, message: null, errorMessage: null }],
  };
}

describe("generationCardStatus", () => {
  it.each(["queued", "running"] as const)("shows %s while retrying a failed old artifact", active => {
    expect(generationCardStatus({ active, exists: true, failed: true, stale: true })).toBe(active);
  });
  it("keeps a failed regeneration red even when a usable older artifact remains", () => {
    expect(generationCardStatus({ exists: true, failed: true, stale: true })).toBe("failed");
  });
  it("distinguishes stale, completed and missing artifacts", () => {
    expect(generationCardStatus({ exists: true, stale: true })).toBe("stale");
    expect(generationCardStatus({ exists: true })).toBe("completed");
    expect(generationCardStatus({ exists: false })).toBe("missing");
  });
});

describe("modelCardTaskStatus", () => {
  it.each(["running", "rendering", "repairing"] as const)("recognizes scoped %s work", status => {
    expect(modelCardTaskStatus([task(status)], "design", "sequence")).toBe("running");
  });
  it("keeps queued and failed work distinct", () => {
    expect(modelCardTaskStatus([task("queued")], "design", "sequence")).toBe("queued");
    expect(modelCardTaskStatus([task("failed")], "design", "sequence")).toBe("failed");
  });
  it("ignores unrelated stages and historical terminal tasks", () => {
    expect(modelCardTaskStatus([task("running")], "requirements", "sequence")).toBeUndefined();
    expect(modelCardTaskStatus([task("running")], "design", "class")).toBeUndefined();
    expect(modelCardTaskStatus([{ ...task("failed"), status: "failed" }], "design", "sequence")).toBeUndefined();
  });
  it("waits for visual review after the SVG stage", () => {
    const current = task("completed", "generate_models:sequence:uc-1");
    expect(modelCardTaskStatus([current], "design", "sequence")).toBe("running");
    current.subtasks.push({ ...current.subtasks[0], id: "render_svg:sequence:uc-1" });
    expect(modelCardTaskStatus([current], "design", "sequence")).toBe("running");
    current.subtasks.push({ ...current.subtasks[0], id: "verify_diagram_visual:sequence:uc-1" });
    expect(modelCardTaskStatus([current], "design", "sequence")).toBeUndefined();
  });
});
