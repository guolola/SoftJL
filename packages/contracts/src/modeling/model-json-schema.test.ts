// Guards contract projections used as strict tool parameters while keeping semantic refinements server-side.
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { contractResponseSchema, generationResponseSchema } from "./model-json-schema.js";
import { completeFeasibilityImplementationPlanSchema } from "../feasibility.js";
import { getStageModelSchema } from "./model-semantics.js";
import { modelFixture } from "../testing/model-fixtures.js";

test("refined feasibility plans project their exact structure and fixed verdict cardinality", () => {
  const schema = contractResponseSchema(completeFeasibilityImplementationPlanSchema);
  const implementation = schema.properties.candidates.items.properties.implementation.anyOf.find((option: any) => option.type === "object");
  assert.equal(implementation.properties.verdicts.minItems, 5);
  assert.equal(implementation.properties.verdicts.maxItems, 5);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.reducedCandidateReason, { type: "string" });
});

test("structural projections still reject transforms that cannot be represented by a JSON schema", () => {
  assert.throws(() => contractResponseSchema(z.string().transform(value => ({ value }))), /Unsupported model schema/);
});

test("analysis generation requires real source arrays on every nested element without changing persisted contracts", () => {
  const contract = getStageModelSchema("requirements", "analysis")!;
  const schema = generationResponseSchema(contract);
  const elementSchemas = [schema.properties.participants.items, schema.properties.messages.items,
    schema.properties.fragments.items, schema.properties.fragments.items.properties.branches.items, schema.properties.activations.items];
  for (const element of elementSchemas) {
    assert.ok(element.required.includes("sourceElementIds"));
    assert.equal(element.properties.sourceElementIds.type, "array");
    assert.equal(element.properties.sourceElementIds.minItems, 1);
  }
  assert.ok(!contractResponseSchema(contract).properties.participants.items.required.includes("sourceElementIds"));
});

test("context generation requires rule sources on its central system as well as external elements", () => {
  const schema = generationResponseSchema(getStageModelSchema("feasibility", "context")!);
  assert.ok(schema.properties.system.required.includes("sourceRequirementIds"));
  assert.equal(schema.properties.system.properties.sourceRequirementIds.minItems, 1);
});

test("requirements and feasibility publish identical swimlane tool schemas", () => {
  const requirement = getStageModelSchema("requirements", "activity")!;
  assert.equal(requirement, getStageModelSchema("feasibility", "activity"));
  const schema = contractResponseSchema(requirement);
  const nodes = schema.properties.nodes.items.anyOf;
  assert.deepEqual(nodes.map((node: any) => node.properties.type.enum[0]), ["start", "end", "activity", "decision", "merge", "fork", "join"]);
  assert.deepEqual(schema.properties.relationships.items.properties.type.enum, ["control_flow"]);
  assert.ok(nodes.every((node: any) => !node.properties.inputPins && !node.properties.outputPins));
  const obsolete = modelFixture("requirements", "activity") as any;
  obsolete.nodes[1].inputPins = [];
  assert.equal(requirement.safeParse(obsolete).success, false, "Persisted input must reject retired fields rather than strip them");
});
