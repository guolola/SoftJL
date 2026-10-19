// Keeps demo backends stable while preserving file watching for ordinary development.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scripts = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8")).scripts;
const root = scripts("../../package.json");
const api = scripts("../../apps/api/package.json");
const render = scripts("../../apps/render-service/package.json");

test("PostgreSQL demo selects non-watching API and render commands", () => {
  assert.match(root["dev:postgres:demo"], /npm run dev:demo$/);
  assert.match(root["dev:demo"], /"npm run demo:api:safe"/);
  assert.match(root["dev:demo"], /"npm run demo:render"/);
  assert.doesNotMatch(root["dev:demo"], /npm run dev:(?:api|render)/);
  assert.equal(root["demo:api"], "npm run demo --workspace @uml-platform/api");
  assert.equal(root["demo:render"], "npm run demo --workspace @uml-platform/render-service");
  assert.doesNotMatch(api.demo, /--watch|\bwatch\b/);
  assert.doesNotMatch(render.demo, /--watch|\bwatch\b/);
  assert.equal(render.predemo, render.predev);
});

test("demo preserves local API environment settings and TypeScript execution", () => {
  // Compare without printing environment values if the scripts diverge.
  assert.ok(root["demo:api:safe"].replace(/npm run demo:api$/, "npm run dev:api") === root["dev:api:safe"]);
  assert.match(api.demo, /--env-file-if-exists=\.\.\/\.\.\/\.env.local/);
  assert.match(api.demo, /--import tsx src\/index.ts$/);
  assert.equal(render.demo, "tsx src/index.ts");
});

test("ordinary development retains API and render file watchers", () => {
  assert.match(api.dev, /--watch\b/);
  assert.match(render.dev, /tsx watch\b/);
  assert.match(root.dev, /scripts\/dev\/start-development\.mjs/);
});
