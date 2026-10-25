// Verifies initial run snapshots carry the right upstream artifacts for each stage.
import assert from "node:assert/strict";
import test from "node:test";
import {

  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptySnapshot,
} from "./snapshots.js";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";

const rule = {
  id: "r1",
  type: "business-rule" as const,
  text: "借阅者必须登录后才能借书。",

};

test("createEmptySnapshot produces a RequirementBaseline for requirements runs", () => {
  const snapshot = createEmptySnapshot("run-1", rule.text, ["usecase"], [rule]);

  assert.equal(snapshot.requirementBaseline?.runId, "run-1");
  assert.equal(snapshot.requirementBaseline?.rules?.[0]?.text, rule.text);
  assert.equal("qualityReport" in snapshot.requirementBaseline!, false);
});

test("requirement modeling snapshots reuse the source baseline without sharing mutable data", () => {
  const baseline = buildRequirementBaseline({ runId: "rules-run", requirementText: rule.text, rules: [rule] });
  const snapshot = createEmptySnapshot("models-run", rule.text, ["usecase"], [rule], { requirementBaseline: baseline });
  assert.equal(snapshot.runId, "models-run");
  assert.deepEqual(snapshot.requirementBaseline, baseline);
  assert.notEqual(snapshot.requirementBaseline, baseline);
  snapshot.requirementBaseline!.rules![0]!.text = "不应回写的修改";
  assert.notEqual(baseline.rules![0]!.text, "不应回写的修改");
});

test("createEmptyDesignSnapshot carries a RequirementBaseline into design runs", () => {
  const requirementBaseline = buildRequirementBaseline({
    runId: "design-1",
    requirementText: rule.text,
    rules: [rule],
  });
  const snapshot = createEmptyDesignSnapshot("design-1", {
    selectedDiagrams: ["sequence"],
    requirementBaseline,
    requirementModels: [],
    requirementModelTraceability: [],
  });

  assert.equal(snapshot.requirementBaseline?.rules?.[0]?.requirementId, "REQ-001");
  assert.equal(snapshot.requirementText, "");
  assert.deepEqual(snapshot.rules, [rule]);
});

test("model commands reject old baseline storage without migrating it", () => {
  const baseline = buildRequirementBaseline({ runId: "legacy-rules", requirementText: rule.text, rules: [rule] });
  delete baseline.sourceInputFingerprint;
  delete baseline.schemaVersion;
  delete baseline.rules;
  baseline.requirements = [{ id: "REQ-001", sourceRuleId: rule.id, sourceFragment: rule.text, type: "business-rule" as const, actor: null, subject: null, action: null, object: null, condition: null, outcome: null, confidence: 0.8, status: "accepted", criticality: "high", acceptanceCriteria: [], fieldProvenance: {} }];
  assert.throws(() => createEmptySnapshot("new-model", rule.text, ["usecase"], [rule], { requirementBaseline: baseline }));
});

test("createEmptyDesignSnapshot preserves the requested design selection", () => {
  const requirementBaseline = buildRequirementBaseline({
    runId: "design-append",
    requirementText: rule.text,
    rules: [rule],
  });
  const snapshot = createEmptyDesignSnapshot("design-append", {
    selectedDiagrams: ["class"],
    requestedDiagrams: ["class"],
    requirementBaseline,
    requirementModels: [],
    requirementModelTraceability: [],
  });

  assert.deepEqual(snapshot.selectedDiagrams, ["class"]);
  assert.deepEqual(snapshot.requestedDiagrams, ["class"]);
});


test("createEmptyDocumentSnapshot preserves an empty baseline placeholder", () => {
  const snapshot = createEmptyDocumentSnapshot("doc-1", {
    documentKind: "requirementsSpec",
    requirementText: rule.text,
  });

  assert.equal(snapshot.requirementBaseline?.rules.length, 0);
  assert.equal("qualityReport" in snapshot.requirementBaseline!, false);
});
