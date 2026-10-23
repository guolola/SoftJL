// Verifies complete, distinct structural/image/repair prompts across all supported stage/model combinations.
import assert from "node:assert/strict";
import test from "node:test";
import { feasibilityInputsSchema, getModelReviewProfile, getStageModelSchemas, type ModelingStage } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";

import { buildGenerateFeasibilityContextPrompt } from "./feasibility-prompts.js";
import { buildGenerateFeasibilityBusinessFlowPrompt } from "./feasibility-business-flow-prompt.js";
test("feasibility generation uses its own context and control-flow profiles", () => {
  const source = { rules: [], requirementBaseline: null };
  const context = buildGenerateFeasibilityContextPrompt({ ...source, inputs: feasibilityInputsSchema.parse({}) });
  const flow = buildGenerateFeasibilityBusinessFlowPrompt(source);
  for (const rule of getModelReviewProfile("feasibility", "context").structure) assert.ok(context.includes(rule));
  for (const rule of getModelReviewProfile("feasibility", "activity").structure) assert.ok(flow.includes(rule));
});
