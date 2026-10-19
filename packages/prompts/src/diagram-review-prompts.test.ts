// Verifies complete, distinct structural/image/repair prompts across all supported stage/model combinations.
import assert from "node:assert/strict";
import test from "node:test";
import { feasibilityInputsSchema, getModelReviewProfile, getStageModelSchemas, type ModelingStage } from "@uml-platform/contracts";
import { modelFixture } from "../../contracts/src/testing/model-fixtures.js";
import { buildDiagramStructureReviewPrompt, buildDiagramImageReviewPrompt, buildDiagramStructuralRepairPrompt } from "./diagram-review-prompts.js";
import { buildGenerateFeasibilityContextPrompt } from "./feasibility-prompts.js";
import { buildGenerateFeasibilityBusinessFlowPrompt } from "./feasibility-business-flow-prompt.js";

for (const stage of ["feasibility", "requirements", "design"] as ModelingStage[]) for (const schema of getStageModelSchemas(stage)) {
  const kind = schema.shape.diagramKind.value;
  test(`${stage}/${kind} routes all three prompt purposes to the matching profile`, () => {
    const model = modelFixture(stage, kind);
    const structure = buildDiagramStructureReviewPrompt({ stage, model, basis: { accepted: true } });
    const image = buildDiagramImageReviewPrompt({ stage, model, source: "CURRENT_SOURCE" });
    const repair = buildDiagramStructuralRepairPrompt({ stage, model, diagnostics: [{ code: "verified-rule" }] });
    for (const text of [structure, image, repair]) { assert.ok(text.includes(`${stage}.${kind}`)); assert.ok(text.includes(JSON.stringify(model))); }
    assert.match(structure, /business_content/); assert.match(image, /先独立观察图片/); assert.match(repair, /禁止自由增删业务内容/);
    assert.ok(image.includes("CURRENT_SOURCE")); assert.ok(repair.includes("verified-rule"));
    assert.match(repair, /只返回 \{"changes"/);
    assert.doesNotMatch(repair, /兼容模式|"model":完整模型/);
  });
}
test("large authoritative current models are never string-truncated by review builders", () => {
  const model = modelFixture("requirements", "usecase"); model.notes = ["X".repeat(70000), "FINAL_MODEL_MARKER"];
  assert.ok(buildDiagramStructureReviewPrompt({ stage: "requirements", model }).endsWith(JSON.stringify(model)));
});
test("feasibility generation uses its own context and control-flow profiles", () => {
  const source = { rules: [], requirementBaseline: null };
  const context = buildGenerateFeasibilityContextPrompt({ ...source, inputs: feasibilityInputsSchema.parse({}) });
  const flow = buildGenerateFeasibilityBusinessFlowPrompt(source);
  for (const rule of getModelReviewProfile("feasibility", "context").structure) assert.ok(context.includes(rule));
  for (const rule of getModelReviewProfile("feasibility", "activity").structure) assert.ok(flow.includes(rule));
});
