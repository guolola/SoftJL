// Verifies the public PlantUML facade rejects invalid graphs; detailed fixtures live beside the renderer.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "../../../packages/contracts/src/testing/model-fixtures.js";
import { generatePlantUmlArtifacts, generateDesignPlantUmlArtifacts } from "./plantuml.js";
test("public facade deterministically preserves original model IDs", () => {
  const model = modelFixture("requirements", "analysis") as any; model.modelId = "analysis:submit";
  const [first] = generatePlantUmlArtifacts([model]), [second] = generatePlantUmlArtifacts([model]);
  assert.equal(first?.modelId, "analysis:submit"); assert.deepEqual(first, second);
});
test("public facade rejects invalid graphs instead of removing incoming start flows", () => {
  const model = modelFixture("requirements", "activity") as any;
  model.relationships.push({ id: "back", type: "control_flow", sourceId: "work", targetId: "start" });
  assert.throws(() => generatePlantUmlArtifacts([model]), /initial-incoming|invalid-endpoints/);
});
test("requirement concept operations fail while design operations are rendered", () => {
  const model = modelFixture("design", "class") as any;
  model.classes[0].operations.push({ name: "submit", visibility: "public", parameters: [] });
  assert.throws(() => generatePlantUmlArtifacts([model]), /operations/);
  assert.match(generateDesignPlantUmlArtifacts([model])[0]!.source, /submit\(\)/);
});
