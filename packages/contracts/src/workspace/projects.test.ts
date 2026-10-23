// Requires explicit project modes in responses and keeps immutable policy out of updates.
import assert from "node:assert/strict";
import test from "node:test";
import { projectBackgroundKeySchema, projectCreateRequestSchema, projectUpdateRequestSchema, projectResponseSchema, projectDtoSchema, resolveProjectMode } from "./projects.js";

test("new projects default to standard and response modes must be explicit", () => {
  assert.equal(projectCreateRequestSchema.parse({ name: "毕业设计" }).projectMode, "standard");
  assert.equal(projectCreateRequestSchema.parse({ name: "工程", projectMode: "professional" }).projectMode, "professional");
  assert.equal(projectDtoSchema.shape.projectMode.safeParse(undefined).success, false);
  assert.throws(() => resolveProjectMode(undefined));
  assert.throws(() => resolveProjectMode("retired"));
  assert.equal(resolveProjectMode("professional"), "professional");
  assert.equal(projectUpdateRequestSchema.safeParse({ name: "改名", projectMode: "standard" }).success, false);
  assert.equal(projectCreateRequestSchema.safeParse({ name: "项目", defaultProviderConfigId: "retired" }).success, false);
});

test("project generation execution mode must be explicit in responses", () => {
  assert.equal(projectResponseSchema.shape.generationExecutionMode.safeParse(undefined).success, false);
  assert.equal(projectResponseSchema.shape.generationExecutionMode.parse("provider"), "provider");
  assert.equal(projectResponseSchema.shape.generationExecutionMode.parse("offline-demo"), "offline-demo");
  assert.equal(projectResponseSchema.shape.generationExecutionMode.safeParse("mock").success, false);
});

test("clients cannot write project generation execution mode", () => {
  assert.equal(projectCreateRequestSchema.safeParse({ name: "Project", generationExecutionMode: "offline-demo" }).success, false);
  assert.equal(projectUpdateRequestSchema.safeParse({ name: "Project", generationExecutionMode: "offline-demo" }).success, false);
});

test("project backgrounds accept only the current twenty-one gallery selections", () => {
  assert.equal(projectBackgroundKeySchema.options.length, 21);
  assert.equal(projectCreateRequestSchema.parse({ name: "Project", backgroundKey: "booking" }).backgroundKey, "booking");
  assert.equal(projectCreateRequestSchema.safeParse({ name: "Project", backgroundKey: "procurement" }).success, false);
  assert.equal(projectUpdateRequestSchema.safeParse({ backgroundKey: "procurement" }).success, false);
});

test("project contracts reject removed hierarchy and visibility fields", () => {
  for (const field of ["organizationId", "courseId", "classId", "teamId", "visibility"]) {
    assert.equal(projectCreateRequestSchema.safeParse({ name: "Project", [field]: "obsolete" }).success, false);
    assert.equal(projectUpdateRequestSchema.safeParse({ [field]: null }).success, false);
    assert.equal(field in projectDtoSchema.shape, false);
  }
  for (const visibility of ["private", "public", "team"]) {
    assert.equal(projectCreateRequestSchema.safeParse({ name: "Project", visibility }).success, false);
  }
  assert.equal(projectUpdateRequestSchema.safeParse({ visibility: "team" }).success, false);
});
