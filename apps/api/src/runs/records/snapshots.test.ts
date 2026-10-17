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
  category: "业务规则" as const,
  text: "借阅者必须登录后才能借书。",
  relatedDiagrams: ["usecase" as const],
};

test("createEmptySnapshot produces a RequirementBaseline for requirements runs", () => {
  const snapshot = createEmptySnapshot("run-1", rule.text, ["usecase"], [rule]);

  assert.equal(snapshot.requirementBaseline?.runId, "run-1");
  assert.equal(snapshot.requirementBaseline?.rules?.[0]?.text, rule.text);
  assert.equal(snapshot.requirementBaseline?.qualityReport.status, "passed");
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
  assert.deepEqual(snapshot.rules, []);
});

test("legacy model commands rebuild a versioned snapshot from current rules", () => {
  const baseline = buildRequirementBaseline({ runId: "legacy-rules", requirementText: rule.text, rules: [rule] });
  delete baseline.sourceInputFingerprint;
  delete baseline.schemaVersion;
  delete baseline.rules;
  baseline.requirements = [{ id: "REQ-001", sourceRuleId: rule.id, sourceFragment: rule.text, type: "business-rule", actor: null, subject: null, action: null, object: null, condition: null, outcome: null, confidence: 0.8, status: "accepted", criticality: "high", acceptanceCriteria: [], fieldProvenance: {} }];
  baseline.qualityReport.summary = "历史质量检查记录";
  const snapshot = createEmptySnapshot("new-model", rule.text, ["usecase"], [rule], { requirementBaseline: baseline });
  assert.equal(snapshot.requirementBaseline?.schemaVersion, 2);
  assert.deepEqual(snapshot.requirementBaseline?.requirements, []);
  assert.equal(snapshot.requirementBaseline?.rules?.[0]?.text, rule.text);
  assert.equal(snapshot.requirementBaseline?.rules?.[0]?.requirementId, "REQ-001");
  assert.ok(snapshot.requirementBaseline?.sourceInputFingerprint);
  const changedRule = { ...rule, text: "管理员必须审批借阅申请。" };
  const changed = createEmptySnapshot("changed-model", changedRule.text, ["usecase"], [changedRule], { requirementBaseline: baseline });
  assert.equal(changed.requirementBaseline!.runId, "changed-model");
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

  assert.equal(snapshot.requirementBaseline?.requirements.length, 0);
  assert.equal(snapshot.requirementBaseline?.qualityReport.status, "passed");
});
