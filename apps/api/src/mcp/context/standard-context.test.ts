// Ensures coding-agent projections reject obsolete saved models rather than treating them as empty projects.
import assert from "node:assert/strict";
import test from "node:test";
import { createStandardProjectState, standardDiagramKinds } from "@uml-platform/contracts";
import { standardModelFixture } from "@uml-platform/contracts/testing";
import { buildStandardContext } from "./standard-context.js";

const scope = { artifactIds: [], requirementIds: [] };
test("an absent quick project has no artifacts, while invalid saved data is rejected", () => {
  assert.deepEqual(buildStandardContext({}, scope).artifacts, []);
  for (const standardProject of [undefined, null, {}, { ...createStandardProjectState(), diagrams: [] }]) {
    assert.throws(() => buildStandardContext({ standardProject }, scope));
  }
});

for (const kind of standardDiagramKinds) test(`MCP ${kind}: only the current model contract is exposed`, () => {
  const model = standardModelFixture(kind);
  const diagram = { id: kind, kind, title: model.title, status: "completed", model };
  const state = { standardProject: { ...createStandardProjectState(), diagrams: { [kind]: diagram } } };
  const context = buildStandardContext(state, scope);
  assert.deepEqual(context.artifacts.find(artifact => artifact.id === `standard:diagram:${kind}`)?.payload.model, model);
  assert.throws(() => buildStandardContext({ standardProject: { ...state.standardProject, diagrams: { [kind]: { ...diagram, model: { nodes: [], edges: [] } } } } }, scope));
});
