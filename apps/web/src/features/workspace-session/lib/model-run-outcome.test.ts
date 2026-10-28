// Verifies partial results exclude inherited models and retain individual use-case failures.
import { describe, expect, it } from "vitest";
import { modelFixture } from "@uml-platform/contracts/testing";
import { diagramModelSpecSchema } from "@uml-platform/contracts";
import { createDesignRunSnapshot, createRunSnapshot } from "../../../../tests/fixtures/contract-fixtures";
import { modelRunOutcome } from "./model-run-outcome";

const failure = { stage: "render_svg" as const,
  error: { code: "RUN_RENDER_FAILED" as const, message: "render failed", category: "render" as const, retryable: true } };

describe("model run outcomes", () => {
  it("lists accepted results and failures without counting inherited models", () => {
    const usecase = modelFixture("requirements", "usecase");
    const domain = diagramModelSpecSchema.parse(modelFixture("requirements", "class"));
    if (usecase.diagramKind !== "usecase" || domain.diagramKind !== "class") throw new Error("Expected requirement fixtures");
    const snapshot = createRunSnapshot({ status: "failed", selectedDiagrams: ["usecase", "class"],
      models: [usecase, domain],
      outputManifest: [{ kind: "model", id: "usecase", diagramKind: "usecase" }], diagramErrors: { class: failure } });
    expect(modelRunOutcome(snapshot)).toEqual({ succeeded: ["用例模型"], failed: ["领域概念模型"] });
    expect(modelRunOutcome({ ...snapshot, outputManifest: [] }).succeeded).toEqual([]);
  });

  it("names sequence failures by use case while retaining a successful sibling", () => {
    const source = modelFixture("requirements", "usecase");
    if (source.diagramKind !== "usecase") throw new Error("Expected usecase fixture");
    const usecase = { ...source, useCases: [
      { ...source.useCases[0]!, id: "order", name: "提交订单" },
      { ...source.useCases[0]!, id: "cancel", name: "取消订单" },
    ] };
    const sequence = modelFixture("design", "sequence");
    if (sequence.diagramKind !== "sequence") throw new Error("Expected sequence fixture");
    const snapshot = createDesignRunSnapshot({ status: "failed", selectedDiagrams: ["sequence"],
      requirementModels: [usecase], sequenceTargetUseCaseIds: ["order", "cancel"],
      models: [{ ...sequence, modelId: "sequence:order", sourceUseCaseId: "order", sourceUseCaseName: "提交订单" }],
      outputManifest: [{ kind: "model", id: "sequence:order", diagramKind: "sequence" }],
      diagramErrors: { "sequence:cancel": failure } });
    const outcome = modelRunOutcome(snapshot);
    expect(outcome.succeeded).toHaveLength(1);
    expect(outcome.succeeded[0]).toContain("提交订单");
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]).toContain("取消订单");
    expect(modelRunOutcome({ ...snapshot, status: "running" })).toEqual({ succeeded: [], failed: [] });
  });

  it("does not include successful siblings outside a targeted analysis retry", () => {
    const analysis = modelFixture("requirements", "analysis");
    if (analysis.diagramKind !== "analysis") throw new Error("Expected analysis fixture");
    const snapshot = createRunSnapshot({ status: "failed", selectedDiagrams: ["analysis"], analysisTargetUseCaseIds: ["cancel"],
      models: [{ ...analysis, modelId: "analysis:order", sourceUseCaseId: "order", sourceUseCaseName: "提交订单" }],
      outputManifest: [{ kind: "model", id: "analysis:order", diagramKind: "analysis" }],
      diagramErrors: { "analysis:cancel": failure } });
    expect(modelRunOutcome(snapshot).succeeded).toEqual([]);
    expect(modelRunOutcome(snapshot).failed).toHaveLength(1);
  });
});
