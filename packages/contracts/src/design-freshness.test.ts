// Checks cascading staleness without automatically regenerating unrelated models.
import assert from "node:assert/strict";
import test from "node:test";
import { invalidateDesignDependents } from "./design-freshness.js";
const kinds = ["sequence", "class", "component", "table", "deployment", "architecture", "navigation"];
const state = { designModels: Object.fromEntries(kinds.map(kind => [kind, { diagramKind: kind, title: kind }])), designInputFingerprints: Object.fromEntries(kinds.map(kind => [kind, "fresh"])) };
test("class edit invalidates component, table and transitive deployment", () => {
  const next = invalidateDesignDependents(state, { ...state, designModels: { ...state.designModels, class: { diagramKind: "class", title: "edited" } } });
  const fingerprints = next.designInputFingerprints as Record<string, string>;
  for (const kind of ["component", "table", "deployment"]) assert.equal(fingerprints[kind], "stale:fresh");
  for (const kind of ["class", "sequence", "architecture", "navigation"]) assert.equal(fingerprints[kind], "fresh");
});
test("requirement constraint edit invalidates every old design even if requirement models are unchanged", () => {
  const next = invalidateDesignDependents({ ...state, rules: ["old"] }, { ...state, rules: ["new"] });
  assert.ok(Object.values(next.designInputFingerprints as object).every(value => value === "stale:fresh"));
});
test("same-batch regenerated dependents remain fresh while other descendants become stale", () => {
  const next = invalidateDesignDependents(state, { ...state, designModels: { ...state.designModels, class: { diagramKind: "class", title: "new" }, component: { diagramKind: "component", title: "new" } } }, ["class", "component"]);
  assert.equal((next.designInputFingerprints as Record<string, string>).component, "fresh");
  assert.equal((next.designInputFingerprints as Record<string, string>).deployment, "stale:fresh");
});
