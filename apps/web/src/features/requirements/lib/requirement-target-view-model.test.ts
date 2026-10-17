// Verifies action labels describe only selected work, including regeneration of current models.
import { expect, it } from "vitest";
import { requirementDiagramsButtonLabel } from "./requirement-target-view-model";

it("asks for selection instead of describing untouched models", () => {
  expect(requirementDiagramsButtonLabel({ generatedDiagrams: ["usecase"], selectedDiagrams: [], staleDiagrams: [] })).toBe("勾选要生成或更新的模型");
});
it("counts new models and all selected existing models", () => {
  expect(requirementDiagramsButtonLabel({ generatedDiagrams: ["usecase", "class"], selectedDiagrams: ["usecase", "activity"], staleDiagrams: [] })).toBe("生成 1 个，更新 1 个");
});
