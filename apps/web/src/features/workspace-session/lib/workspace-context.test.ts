// Verifies scoped generation coverage uses recorded use-case provenance only.
import { describe, expect, it } from "vitest";
import type { DiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { analysisTargetUseCaseIdsForRun } from "./workspace-context";

describe("analysis generation coverage", () => {
  it("does not treat a model identifier as recorded use-case provenance", () => {
    const usecase = modelFixture("requirements", "usecase");
    if (usecase.diagramKind !== "usecase") throw new Error("Expected a use-case fixture");
    const sourceUseCaseId = usecase.useCases[0]!.id;
    const analysis = { ...modelFixture("requirements", "analysis"), modelId: `analysis:${sourceUseCaseId}`, sourceUseCaseId: undefined } as unknown as DiagramModelSpec;
    expect(analysisTargetUseCaseIdsForRun(["analysis"], { usecase, [analysis.modelId!]: analysis })).toEqual([sourceUseCaseId]);
    expect(analysisTargetUseCaseIdsForRun(["analysis"], { usecase, analysis: { ...analysis, modelId: "custom-analysis", sourceUseCaseId } as DiagramModelSpec })).toEqual([]);
  });
});
