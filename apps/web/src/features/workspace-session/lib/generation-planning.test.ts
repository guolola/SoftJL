// Verifies generation planning keeps design dependencies ordered before downstream models.
import { describe, expect, it } from "vitest";
import { resolveDesignGenerationDiagrams } from "./generation-planning";
import { runSnapshotSchema } from "@uml-platform/contracts";
import { librarySeatDemoFixture } from "../../../../../api/src/runs/demo/fixtures/library-seat-demo-fixture";
import { designGenerationSubtasks, requirementGenerationSubtasks, planDesignRequirementAutoUpstream } from "./generation-planning";

describe("resolveDesignGenerationDiagrams", () => {
  it("reuses custom requirement IDs and enumerates each use case for generation", () => {
    const snapshot = runSnapshotSchema.parse(librarySeatDemoFixture.requirementSnapshot);
    const models = Object.fromEntries(snapshot.models.map((model) => [
      `saved-${model.modelId ?? model.diagramKind}`, model,
    ]));
    const useCase = snapshot.models.find((model) => model.diagramKind === "usecase")!;
    if (!("useCases" in useCase)) throw new Error("Expected a use case fixture");
    const plan = planDesignRequirementAutoUpstream({
      requestedDesignDiagrams: ["architecture", "sequence", "class", "navigation", "deployment"],
      requirementModels: models,
      rules: snapshot.rules,
    });
    expect(plan.effectiveDiagrams).toEqual([]);
    expect(plan.needsRulesRun).toBe(false);
    expect(designGenerationSubtasks(["sequence"], models).filter((task) => task.id.startsWith("generate_design_sequence:"))
      .map((task) => task.id)).toEqual(useCase.useCases.map((item) => `generate_design_sequence:sequence:${item.id}`));
    expect(requirementGenerationSubtasks(["analysis"], models).filter((task) => task.id.startsWith("generate_models:"))
      .map((task) => task.id)).toEqual(useCase.useCases.map((item) => `generate_models:analysis:${item.id}`));
  });
  it("orders generated design dependencies before deployment", () => {
    const plan = resolveDesignGenerationDiagrams(["deployment"], []);

    expect(plan.effectiveDiagrams).toEqual([
      "sequence",
      "class",
      "component",
      "deployment",
    ]);
    expect(plan.dependencyDiagrams).toEqual(["sequence", "class", "component"]);
  });

  it("keeps all-selected design diagrams in dependency-safe order", () => {
    const plan = resolveDesignGenerationDiagrams(
      ["deployment", "component", "class", "sequence"],
      [],
    );

    expect(plan.effectiveDiagrams).toEqual([
      "sequence",
      "class",
      "component",
      "deployment",
    ]);
    expect(plan.dependencyDiagrams).toEqual([]);
  });
});
