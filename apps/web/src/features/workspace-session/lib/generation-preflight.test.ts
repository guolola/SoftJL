// Verifies design generation preflight resumes failed batches without rerunning successful diagrams.
import { describe, expect, it } from "vitest";
import { runSnapshotSchema, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { librarySeatDemoFixture } from "../../../../../api/src/runs/demo/fixtures/library-seat-demo-fixture";
import { modelFixture } from "../../../../../../packages/contracts/dist/testing/model-fixtures";
import type { DesignDiagramType } from "../../../entities/diagram/model";
import { createEmptyWorkspace } from "../../../services/workspace-repository/workspace-state";
import { designInputFingerprint } from "../../../shared/lib/fingerprint";
import { analyzeDesignGenerationPreflight } from "./generation-preflight";
import { analyzeRequirementGenerationPreflight } from "./generation-preflight";
import { PROJECT_WORKSPACE_TARGET_REQUEST_EVENT } from "../../../shared/lib/app-navigation";

function designModel(diagramKind: DesignDiagramModelSpec["diagramKind"]) {
  return {
    ...modelFixture("design", diagramKind),
    modelId: `${diagramKind}:model`,
    title: diagramKind,
    summary: diagramKind,
    notes: [],
  } as DesignDiagramModelSpec;
}

function basePreflightInput() {
  const workspace = createEmptyWorkspace();
  const currentFingerprint = designInputFingerprint([], []);
  const classModel = designModel("class");
  const tableModel = designModel("table");
  const componentModel = designModel("component");

  return {
    designDiagramErrors: {
      component: {
        stage: "render_svg" as const,
        error: {
          code: "RUN_RENDER_FAILED" as const,
          message: "组件图渲染失败",
          category: "render" as const,
          retryable: true,
        },
      },
    },
    designInputFingerprints: {
      [classModel.modelId!]: currentFingerprint,
      [tableModel.modelId!]: currentFingerprint,
      [componentModel.modelId!]: currentFingerprint,
    },
    designModels: {
      [classModel.modelId!]: classModel,
      [tableModel.modelId!]: tableModel,
      [componentModel.modelId!]: componentModel,
    },
    designSvgArtifacts: {
      [tableModel.modelId!]: {
        diagramKind: "table" as const,
        modelId: tableModel.modelId,
        svg: "<svg data-kind=\"table\" />",
        renderMeta: {
          engine: "plantuml" as const,
          generatedAt: "2026-06-19T00:00:00.000Z",
          sourceLength: 18,
          durationMs: 1,
        },
      },
    },
    diagramInputFingerprints: workspace.diagramInputFingerprints,
    diagramVersions: workspace.diagramVersions,
    generatedDiagrams: workspace.generatedDiagramTypes,
    manualModelEditStatus: workspace.manualModelEditStatus,
    models: workspace.models,
    requirementBaseline: null,
    requirementInputFingerprint: null,
    requirementModelTraceability: workspace.requirementModelTraceability,
    requirementReviewCandidates: workspace.requirementReviewCandidates,
    requirementText: "",
    rules: [],
    rulesBasedOnTextVersion: null,
    rulesVersion: workspace.rulesVersion,
    selectedDesignDiagrams: ["table", "component"] as DesignDiagramType[],
    textVersion: 0,
  };
}

describe("analyzeDesignGenerationPreflight", () => {
  it("blocks an invalid upstream model even when its content was manually confirmed", () => {
    const model = modelFixture("requirements", "usecase");
    if (model.diagramKind !== "usecase") throw new Error("fixture");
    model.useCases[0]!.primaryActorId = "actor";
    model.relationships = [];
    const preflight = analyzeDesignGenerationPreflight({ ...basePreflightInput(), models: { usecase: model } });
    expect(preflight.status).toBe("blocked");
    if (preflight.status === "blocked") expect(preflight.block.message).toContain("结构错误");
  });

  it("allows replacing an invalid design model but rejects it as saved context", () => {
    const input = basePreflightInput();
    const classModel = input.designModels["class:model"]!;
    if (classModel.diagramKind !== "class") throw new Error("fixture");
    classModel.relationships[0]!.targetId = "unknown";
    expect(analyzeDesignGenerationPreflight({ ...input, only: ["class"] }).status).toBe("ready");
    expect(analyzeDesignGenerationPreflight({ ...input, only: ["table"] }).status).toBe("blocked");
  });
  it.each([true, false])("checks sequence coverage against custom saved use case keys: complete=%s", (complete) => {
    const snapshot = runSnapshotSchema.parse(librarySeatDemoFixture.requirementSnapshot);
    const useCase = snapshot.models.find((model) => model.diagramKind === "usecase")!;
    if (!("useCases" in useCase)) throw new Error("Expected a use case fixture");
    const targets = complete ? useCase.useCases : useCase.useCases.slice(1);
    const preflight = analyzeDesignGenerationPreflight({
      ...basePreflightInput(),
      models: Object.fromEntries(snapshot.models.map((model) => [`saved-${model.modelId ?? model.diagramKind}`, model])),
      requirementText: snapshot.requirementText,
      requirementBaseline: snapshot.requirementBaseline,
      rules: snapshot.rules,
      requirementModelTraceability: snapshot.requirementModelTraceability,
      designDiagramErrors: {},
      designModels: Object.fromEntries(targets.map((item) => [item.id, {
        ...designModel("sequence"), sourceUseCaseId: item.id,
      }])),
      selectedDesignDiagrams: ["class"],
    });
    expect(preflight.status).toBe(complete ? "ready" : "blocked");
    if (preflight.status === "ready") expect(preflight.requirementPlan.effectiveDiagrams).toEqual([]);
    if (preflight.status === "blocked") expect(preflight.block.message).toBe("已有用例实现设计覆盖不足，请先手动更新用例实现设计");
  });

  it("resumes failed batch design generation without rerunning successful artifacts", () => {
    const preflight = analyzeDesignGenerationPreflight(basePreflightInput());

    expect(preflight.status).toBe("ready");
    if (preflight.status !== "ready") return;
    expect(preflight.requestedDiagrams).toEqual(["component"]);
  });

  it("keeps a single successful diagram request as an explicit regenerate action", () => {
    const preflight = analyzeDesignGenerationPreflight({
      ...basePreflightInput(),
      only: ["table"],
      selectedDesignDiagrams: ["table"],
    });

    expect(preflight.status).toBe("ready");
    if (preflight.status !== "ready") return;
    expect(preflight.requestedDiagrams).toEqual(["table"]);
  });
});

describe("preflight blocker navigation", () => {
  it("opens system requirements for a missing requirement source", () => {
    const { selectedDesignDiagrams: _selectedDesignDiagrams, designDiagramErrors: _designDiagramErrors,
      designInputFingerprints: _designInputFingerprints, designModels: _designModels,
      designSvgArtifacts: _designSvgArtifacts, ...shared } = basePreflightInput();
    const preflight = analyzeRequirementGenerationPreflight({
      ...shared,
      selectedDiagrams: ["usecase"],
    });
    expect(preflight.status).toBe("blocked");
    if (preflight.status !== "blocked") return;
    expect(preflight.block.primaryAction?.label).toBe("前往系统需求");
    const targets: string[] = [];
    const listener = (event: Event) => targets.push((event as CustomEvent<string>).detail);
    window.addEventListener(PROJECT_WORKSPACE_TARGET_REQUEST_EVENT, listener);
    try {
      preflight.block.primaryAction?.onSelect?.();
      expect(targets).toEqual(["system-requirements"]);
    } finally {
      window.removeEventListener(PROJECT_WORKSPACE_TARGET_REQUEST_EVENT, listener);
    }
  });
});
