// Verifies generation planning keeps design dependencies ordered before downstream models.
import { describe, expect, it } from "vitest";
import { planRequirementAutoUpstream, resolveDesignGenerationDiagrams } from "./generation-planning";
import { runSnapshotSchema } from "@uml-platform/contracts";
import { librarySeatDemoFixture } from "../../../../../api/src/runs/demo/fixtures/library-seat-demo-fixture";
import { designGenerationSubtasks, requirementGenerationSubtasks, planDesignRequirementAutoUpstream } from "./generation-planning";

describe("candidate input planning", () => {
  const rule = { id: "r1", type: "functional" as const, text: "用户查看信息",  };

  it("accepts functional candidates without stored model associations", () => {
    const plan = planRequirementAutoUpstream({ requestedDiagrams: ["function"], existingModels: {}, rules: [rule] });
    expect(plan.needsRulesRun).toBe(false);
  });

});

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
      "class",
      "component",
      "deployment",
    ]);
    expect(plan.dependencyDiagrams).toEqual(["class", "component"]);
  });

  it.each(["class", "navigation", "table"] as const)("does not add sequence generation for %s", (kind) => {
    const plan = resolveDesignGenerationDiagrams([kind], []);
    expect(plan.effectiveDiagrams).toEqual(kind === "table" ? ["class", "table"] : [kind]);
    expect(plan.effectiveDiagrams).not.toContain("sequence");
    const requirements = planDesignRequirementAutoUpstream({ requestedDesignDiagrams: plan.effectiveDiagrams, requirementModels: {}, rules: [] });
    expect(requirements.effectiveDiagrams).toEqual(kind === "navigation" ? ["prototype"] : ["usecase", "class"]);
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
