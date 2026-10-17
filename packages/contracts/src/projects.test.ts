// Protects execution-mode response defaults and keeps mode out of writable project inputs.
import assert from "node:assert/strict";
import test from "node:test";
import { projectCreateRequestSchema, projectUpdateRequestSchema, projectResponseSchema, projectDtoSchema } from "./projects.js";

test("new projects default to ordinary; legacy responses remain professional and updates cannot switch mode", () => {
  assert.equal(projectCreateRequestSchema.parse({ name: "毕业设计" }).projectMode, "standard");
  assert.equal(projectCreateRequestSchema.parse({ name: "工程", projectMode: "professional" }).projectMode, "professional");
  assert.equal(projectDtoSchema.shape.projectMode.parse(undefined), "professional");
  assert.equal("projectMode" in projectUpdateRequestSchema.parse({ name: "改名", projectMode: "standard" }), false);
});

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
