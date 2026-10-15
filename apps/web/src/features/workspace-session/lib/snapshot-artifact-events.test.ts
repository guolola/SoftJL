// Verifies partial recovery marks only successfully rendered models in the current run scope.
import { describe, expect, it } from "vitest";
import { createRunSnapshot } from "../../../test/workspace-test-utils";
import { createGenerationTask } from "./generation-tasks";
import { snapshotArtifactEvents, updateTaskFromSnapshotArtifacts } from "./snapshot-artifact-events";

const renderMeta = { engine: "plantuml" as const, generatedAt: "2026-10-10T00:00:00.000Z", sourceLength: 1, durationMs: 1 };
const snapshot = createRunSnapshot({ selectedDiagrams: ["usecase"], status: "running", svgArtifacts: [
  { diagramKind: "usecase", modelId: "uc-restored", svg: "<svg/>", renderMeta },
  { diagramKind: "class", modelId: "old-context", svg: "<svg/>", renderMeta },
] });
const task = () => createGenerationTask({ clientTaskId: "recovered:r", kind: "requirements", title: "需求生成",
  providerModel: null, startedAt: "2026-10-10T00:00:00.000Z", message: "恢复进度" });

describe("snapshot artifact events", () => {
  it("marks a rendered model complete without completing the whole batch or unrelated context", () => {
    const restored = updateTaskFromSnapshotArtifacts(task(), snapshot);
    expect(restored.status).toBe("running");
    expect(restored.subtasks).toEqual([expect.objectContaining({ id: "render_svg:uc-restored", status: "completed" })]);
    expect(updateTaskFromSnapshotArtifacts(restored, snapshot)).toBe(restored);
  });

  it("does not mark an errored model complete", () => {
    expect(snapshotArtifactEvents({ ...snapshot, diagramErrors: { usecase: {
      stage: "render_svg", error: { code: "RUN_INTERNAL_ERROR", message: "render failed", category: "internal", retryable: true },
    } } })).toEqual([]);
  });

  it("preserves terminal task state when a snapshot adds previously missed render progress", () => {
    const completed = { ...task(), status: "completed" as const, progress: 100, finishedAt: "2026-10-10T01:00:00.000Z" };
    const restored = updateTaskFromSnapshotArtifacts(completed, snapshot);
    expect(restored).toMatchObject({ status: "completed", progress: 100, finishedAt: completed.finishedAt });
    expect(restored.subtasks[0].status).toBe("completed");
  });
});
