// Ensures repair feedback retains observed identities and scoped sources through error wrapping.
import assert from "node:assert/strict";
import test from "node:test";
import { repairDiagnostics } from "./repair-diagnostics.js";

test("mapping evidence survives cause wrapping and response-path qualification", () => {
  const actual = { reference: { modelId: "analysis:renew", diagramKind: "sequence", elementId: "reader" }, models: [{ modelId: "analysis:renew", diagramKind: "analysis", elementExists: true }] };
  const expected = { legalSources: [{ modelId: "analysis:renew", diagramKind: "analysis", elementIds: ["reader", "renew"] }] };
  const issue = { path: "targets.0.diagramKind", responsePath: "designModelTraceability.0.targets.0.diagramKind", code: "mapping-diagram-kind-mismatch", message: "实际类型为 analysis", actual, expected, relatedPaths: ["targets.0.modelId"] };
  const error = new Error("generation failed", { cause: { diagnostics: [issue] } });
  const before = structuredClone(issue);
  const [diagnostic] = repairDiagnostics(error);
  assert.equal(diagnostic!.path, issue.responsePath);
  assert.deepEqual(diagnostic!.actual, actual);
  assert.deepEqual(diagnostic!.expected, expected);
  assert.deepEqual(diagnostic!.relatedPaths, ["designModelTraceability.0.targets.0.modelId"]);
  assert.deepEqual(issue, before);
});
