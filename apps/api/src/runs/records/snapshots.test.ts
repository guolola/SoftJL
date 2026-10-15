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
  assert.equal(snapshot.requirementBaseline?.requirements[0]?.sourceFragment, rule.text);
  assert.equal(snapshot.requirementBaseline?.qualityReport.status, "passed");
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

  assert.equal(snapshot.requirementBaseline?.requirements[0]?.id, "REQ-001");
  assert.equal(snapshot.requirementText, "");
  assert.deepEqual(snapshot.rules, []);
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
  assert.equal(snapshot.requirementBaseline?.qualityReport.status, "pending-review");
});
