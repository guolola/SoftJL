// Verifies model completion receipts override coarse batch status without hiding regeneration.
import { describe, expect, it } from "vitest";
import type { RunEventInput } from "@uml-platform/contracts";
import { createGenerationTask, updateTaskFromEvent } from "../../workspace-session/lib/generation-tasks";
import { designGenerationSubtasks, requirementGenerationSubtasks } from "../../workspace-session/lib/generation-planning";
import { createRenderMeta } from "../../../test/contract-fixtures";
import { deriveSidebarDiagramState } from "./sidebar-menu-model";

describe("sidebar model generation status", () => {
  it.each(["requirements", "design"] as const)("checks off a completed %s branch while another branch is still running", (kind) => {
    let task = createGenerationTask({ clientTaskId: "batch", kind, title: "生成模型", providerModel: null,
      startedAt: "now", message: "生成中", subtasks: kind === "requirements"
        ? requirementGenerationSubtasks(["class", "usecase"], {}) : designGenerationSubtasks(["class", "component"], {}) });
    const labels = { queued: "排队中", completed: "完成" };
    const state = () => deriveSidebarDiagramState({
      models: {}, designModels: {}, svgArtifacts: {}, designSvgArtifacts: {}, diagramErrors: {}, designDiagramErrors: {},
      generatedDiagrams: [], generatedDesignDiagrams: [], staleDiagrams: [], staleDesignDiagrams: [], staleDesignModelIds: [],
      generationTasks: [task], projectRuns: [{ operationType: (kind === "design" ? "design_modeling" as const : "requirement_modeling" as const), runId: "batch", runKind: kind, status: "running", selectedDiagrams: ["class"] }],
    });
    const status = () => kind === "requirements" ? state().requirementStatusFor("class") : state().designStatusFor("class");
    expect(status()).toBe("queued");
    task = updateTaskFromEvent(task, { type: "stage_progress", stage: "render_svg", progress: 90,
      diagramKind: "class", subtaskId: "domain-custom", subtaskStatus: "running" }, labels);
    expect(status()).toBe("running");
    task = updateTaskFromEvent(task, { type: "artifact_ready", stage: "render_svg", artifactKind: "svg",
      diagramKind: "class", modelId: "domain-custom", subtaskId: "domain-custom", subtaskStatus: "completed" } satisfies RunEventInput, labels);
    expect(task.status).toBe("running");
    expect(status()).toBe("completed");
  });

  it("keeps an existing image spinning during regeneration until the new render succeeds", () => {
    const task = createGenerationTask({ clientTaskId: "rerun", kind: "requirements", title: "重新生成",
      providerModel: null, startedAt: "now", message: "生成中", subtasks: requirementGenerationSubtasks(["class"], {}) });
    const input = {
      models: {}, designModels: {}, svgArtifacts: { class: { diagramKind: "class" as const, svg: "<svg/>", renderMeta: createRenderMeta() } },
      designSvgArtifacts: {}, diagramErrors: {}, designDiagramErrors: {},
      generatedDiagrams: [], generatedDesignDiagrams: [], staleDiagrams: [], staleDesignDiagrams: [], staleDesignModelIds: [],
      generationTasks: [task],
    };
    const active = updateTaskFromEvent(task, { type: "stage_progress", stage: "generate_models", progress: 65,
      diagramKind: "class", subtaskId: "class", subtaskStatus: "running" }, { queued: "排队中", completed: "完成" });
    expect(deriveSidebarDiagramState({ ...input, generationTasks: [active] }).requirementStatusFor("class")).toBe("running");
  });
});
