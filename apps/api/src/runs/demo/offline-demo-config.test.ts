// Verifies ordinary projects cannot enter recording mode without deployment-level selection.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { isOfflineDemoProject } from "./offline-demo-config.js";

const names = ["UML_DEMO_OFFLINE_PROJECT_IDS", "UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS"] as const;
let previous: Array<string | undefined>;
beforeEach(() => {
  previous = names.map(name => process.env[name]);
  for (const name of names) delete process.env[name];
});
afterEach(() => {
  names.forEach((name, index) => {
    const value = previous[index];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
});

test("default startup does not activate fixed results even for the demo project name", () => {
  assert.equal(isOfflineDemoProject("project-1", "图书馆座位预约系统"), false);
  process.env.UML_DEMO_OFFLINE_PROJECT_IDS = " , ";
  process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS = " , ";
  assert.equal(isOfflineDemoProject("project-1", "Any project"), false);
});
test("project IDs require an exact match", () => {
  process.env.UML_DEMO_OFFLINE_PROJECT_IDS = " project-1, project-2 ";
  assert.equal(isOfflineDemoProject("project-1"), true);
  assert.equal(isOfflineDemoProject("project-10"), false);
});
test("name matching is available only when explicitly configured", () => {
  process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS = " Library Demo ";
  assert.equal(isOfflineDemoProject(null, "My LIBRARY DEMO project"), true);
  assert.equal(isOfflineDemoProject(null, "Production project"), false);
});
