// Verifies explicit design generation selections and dependency blockers independently of task retries.
import { describe, expect, it } from "vitest";
import { diagramModelSpecSchema, runSnapshotSchema, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { librarySeatDemoFixture } from "../../../../../api/src/runs/demo/fixtures/library-seat-demo-fixture";
import { modelFixture } from "../../../../../../packages/contracts/dist/testing/model-fixtures";
import type { DesignDiagramType } from "../../../entities/diagram/model";
import { createEmptyWorkspace } from "../../../services/workspace-repository/workspace-state";
import { designInputFingerprint, snapshotInputFingerprint } from "../../../shared/lib/fingerprint";
import { analyzeDesignGenerationPreflight } from "./generation-preflight";
import { analyzeRequirementGenerationPreflight } from "./generation-preflight";
import { PROJECT_WORKSPACE_TARGET_REQUEST_EVENT } from "../../../shared/lib/app-navigation";
import { createRule } from "../../../test/workspace-test-utils";

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

    requirementText: "",
    rules: [createRule({  })],
    rulesBasedOnTextVersion: null,
    rulesVersion: workspace.rulesVersion,
    selectedDesignDiagrams: ["table", "component"] as DesignDiagramType[],
    textVersion: 0,
  };
}

describe("analyzeDesignGenerationPreflight", () => {
  it.each([["class", "table"], ["component", "class"], ["component", "deployment"], ["deployment", "class"]] as DesignDiagramType[][])("blocks conflicting design batch %s and %s before generation", (...only) => {
    const result = analyzeDesignGenerationPreflight({ ...basePreflightInput(), only });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") expect(result.block.message).toContain("上下游模型不能在同一批生成");
  });
  it("does not block architecture generation on an unrelated model's incomplete traceability", () => {
    const functions = modelFixture("requirements", "function");
    const data = diagramModelSpecSchema.parse(modelFixture("requirements", "class"));
    if (functions.diagramKind !== "function" || data.diagramKind !== "class") throw new Error("fixture");
    const targets = [...functions.nodes.map(node => ({ id: node.id, kind: "function", label: node.name })),
      ...functions.relationships.map(edge => ({ id: edge.id, kind: "relationship", label: edge.id }))];
    const input = basePreflightInput();
    const requirementText = "订单需求";
    const rules = [createRule({})];
    const result = analyzeDesignGenerationPreflight({ ...input, only: ["architecture"],
      requirementText, designModels: {}, models: { function: functions, class: data }, rules,
      diagramInputFingerprints: { function: snapshotInputFingerprint({ requirementText, rules }) },
      requirementModelTraceability: targets.map(target => ({ ruleId: "r1", target: {
        modelId: "function", diagramKind: "function", elementId: target.id, elementKind: target.kind, label: target.label,
      } })),
    });
    expect(result.status).toBe("ready");
  });

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
  it.each([true, false])("allows class generation regardless of saved sequence coverage: complete=%s", (complete) => {
    const snapshot = runSnapshotSchema.parse(librarySeatDemoFixture.requirementSnapshot);
    const useCase = snapshot.models.find((model) => model.diagramKind === "usecase")!;
    if (!("useCases" in useCase)) throw new Error("Expected a use case fixture");
    const targets = complete ? useCase.useCases : useCase.useCases.slice(1);
    const requirementFingerprint = snapshotInputFingerprint({ requirementText: snapshot.requirementText, rules: snapshot.rules });
    const preflight = analyzeDesignGenerationPreflight({
      ...basePreflightInput(),
      models: Object.fromEntries(snapshot.models.map((model) => [`saved-${model.modelId ?? model.diagramKind}`, model])),
      requirementText: snapshot.requirementText,
      requirementBaseline: snapshot.requirementBaseline,
      rules: snapshot.rules,
      requirementModelTraceability: snapshot.requirementModelTraceability,
      diagramInputFingerprints: Object.fromEntries(snapshot.models.map(model => [model.diagramKind, requirementFingerprint])),
      designDiagramErrors: {},
      designModels: Object.fromEntries(targets.map((item) => [item.id, {
        ...designModel("sequence"), sourceUseCaseId: item.id,
      }])),
      selectedDesignDiagrams: ["class"],
    });
    expect(preflight.status).toBe("ready");
    if (preflight.status === "ready") expect(preflight.requirementPlan.effectiveDiagrams).toEqual([]);
  });

  it.each([true, false])("keeps all selected design targets despite earlier failures, explicit scope=%s", (explicit) => {
    const input = basePreflightInput();
    const preflight = analyzeDesignGenerationPreflight({ ...input, ...(explicit ? { only: input.selectedDesignDiagrams } : {}) });

    expect(preflight.status).toBe("ready");
    if (preflight.status !== "ready") return;
    expect(preflight.requestedDiagrams).toEqual(["table", "component"]);
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
      rules: [],
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

describe("candidate requirement inputs", () => {
  it.each([false, true])("blocks missing usecase for analysis, including same-batch generation: %s", (sameBatch) => {
    const result = analyzeRequirementGenerationPreflight({ ...basePreflightInput(),
      models: {}, selectedDiagrams: sameBatch ? ["usecase", "analysis"] : ["analysis"],
      rules: [createRule({ type: "functional" })],
    });
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.block.message).toContain(sameBatch ? "上下游模型不能在同一批生成" : "缺少上游模型：用例模型");
    if (!sameBatch) expect(result.block.primaryAction?.label).toBe("前往需求模型");
  });

  it("allows analysis with a saved current usecase model", () => {
    const requirementText = "用户查看订单";
    const rules = [createRule({ type: "functional" })];
    const model = diagramModelSpecSchema.parse(modelFixture("requirements", "usecase"));
    const result = analyzeRequirementGenerationPreflight({ ...basePreflightInput(),
      requirementText, rules, models: { usecase: model }, selectedDiagrams: ["analysis"],
      diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText, rules }) },
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.plan.dependencyDiagrams).toEqual([]);
  });
  it.each(["", "已有需求描述"])("blocks model generation without rules even with source text: %s", (requirementText) => {
    const input = basePreflightInput();
    const result = analyzeRequirementGenerationPreflight({ ...input, selectedDiagrams: ["usecase"], rules: [], requirementText });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") expect(result.block.message).toContain("请先抽取或添加规则");
  });

  it("accepts each selected model only when its mapped types exist", () => {
    const rules = [createRule({ type: "functional" as const }), createRule({ id: "r2", type: "data" })];
    const original = structuredClone(rules);
    const result = analyzeRequirementGenerationPreflight({ ...basePreflightInput(), selectedDiagrams: ["usecase", "class"], rules });
    expect(result.status).toBe("ready");
    expect(rules).toEqual(original);
  });

  it("blocks design auto-generation when its upstream model has no mapped requirement types", () => {
    const result = analyzeDesignGenerationPreflight({ ...basePreflightInput(), selectedDesignDiagrams: ["architecture"], rules: [createRule({ type: "interaction" as const,  })] });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") expect(result.block.message).toContain("功能需求");
  });
});

it("guards direct generation actions with the same type matrix as model selection", () => {
  const input = { ...basePreflightInput(), selectedDiagrams: ["class" as const], rules: [createRule({ type: "functional" })] };
  const blocked = analyzeRequirementGenerationPreflight(input);
  expect(blocked.status).toBe("blocked");
  if (blocked.status === "blocked") expect(blocked.block.message).toContain("数据需求、业务规则");
  expect(analyzeRequirementGenerationPreflight({ ...input, rules: [createRule({ type: "data" })] }).status).toBe("ready");
});
