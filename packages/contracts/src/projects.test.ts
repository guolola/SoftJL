// Protects execution-mode response defaults and keeps mode out of writable project inputs.
import assert from "node:assert/strict";
import test from "node:test";
import { projectCreateRequestSchema, projectUpdateRequestSchema, projectResponseSchema } from "./projects.js";

test("project generation execution mode defaults to provider for older responses", () => {
  assert.equal(projectResponseSchema.shape.generationExecutionMode.parse(undefined), "provider");
  assert.equal(projectResponseSchema.shape.generationExecutionMode.parse("offline-demo"), "offline-demo");
  assert.equal(projectResponseSchema.shape.generationExecutionMode.safeParse("mock").success, false);
});

test("clients cannot write project generation execution mode", () => {
  const create = projectCreateRequestSchema.parse({ name: "Project", generationExecutionMode: "offline-demo" });
  const update = projectUpdateRequestSchema.parse({ name: "Project", generationExecutionMode: "offline-demo" });
  assert.equal("generationExecutionMode" in create, false);
  assert.equal("generationExecutionMode" in update, false);
});
