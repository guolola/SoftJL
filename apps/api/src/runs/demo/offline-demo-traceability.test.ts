// Checks that frozen demo requirements retain the traceability needed by downstream design generation.
import assert from "node:assert/strict";
import test from "node:test";
import { diagramKindSchema, runSnapshotSchema, startRunRequestSchema } from "@uml-platform/contracts";
import { normalizeRequirementTraceabilityWithCoverage } from "../../normalizers/traceability/traceability-normalizer.js";
import { createEmptySnapshot } from "../records/snapshots.js";
import type { RunRecord } from "../records/run-record-store.js";
import { librarySeatDemoFixture } from "./fixtures/library-seat-demo-fixture.js";
import { completeOfflineDemoRequirementRun } from "./offline-demo-runs.js";

test("both demo stages retain the classified source baseline without obsolete fields", () => {
  const source = librarySeatDemoFixture.requirementSnapshot.requirementBaseline!;
  const downstream = librarySeatDemoFixture.designSnapshot.requirementBaseline!;
  assert.equal(source.rules.length, 11);
  assert.deepEqual(downstream.rules, source.rules);
  for (const rule of downstream.rules) {
    assert.ok(rule.type);
    assert.equal("category" in rule, false);
    assert.equal("relatedDiagrams" in rule, false);
  }
});

test("repeated offline model generation preserves the existing baseline identity", async (t) => {
  const previousDelay = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
  t.after(() => { if (previousDelay === undefined) delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS; else process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previousDelay; });
  const source = runSnapshotSchema.parse(librarySeatDemoFixture.requirementSnapshot);
  const record: RunRecord = { snapshot: createEmptySnapshot("demo-model-task", source.requirementText, ["usecase"], source.rules),
    events: [], listeners: new Set(), terminal: false };
  const baseline = source.requirementBaseline;
  await completeOfflineDemoRequirementRun(record, startRunRequestSchema.parse({
    requirementText: source.requirementText, rules: source.rules, selectedDiagrams: ["usecase"], requirementBaseline: baseline,
  }));
  assert.equal(record.snapshot.runId, "demo-model-task");
  assert.deepEqual(record.snapshot.requirementBaseline, baseline);
});

test("demo references respect type mappings and keep unsupported deployment coverage explicit", () => {
  const snapshot = runSnapshotSchema.parse(librarySeatDemoFixture.requirementSnapshot);
  // Analysis sequences are traced through their source use case, outside the rule-to-model gate.
  const coverage = normalizeRequirementTraceabilityWithCoverage(
    snapshot.requirementModelTraceability,
    snapshot.rules,
    snapshot.models.filter((model) => model.diagramKind !== "analysis"),
  );
  assert.ok(coverage.missingTargets.every(target => ["function", "deployment"].includes(target.diagramKind)));
  for (const [elementId, requirementId] of [["mobile-entry", "REQ-011"], ["mobile-login", "REQ-001"]]) {
    const artifactId = `proto-001:prototype:${elementId}`;
    for (const downstream of [snapshot, librarySeatDemoFixture.designSnapshot]) {
      const rule = downstream.requirementBaseline?.rules.find(rule => rule.requirementId === requirementId);
      assert.ok(rule);
      assert.ok(downstream.requirementModelTraceability.some(entry => entry.ruleId === rule.id &&
        entry.target.modelId === "proto-001" && entry.target.elementId === elementId));
      // A recorded element reference is retained without fabricating a verified semantic matrix link.
      assert.ok(downstream.coverageMatrix?.rows.some(row => row.requirementId === requirementId));
    }
  }
});

test("demo generation keeps prototype entry mappings in full and prototype-only runs", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
  t.after(() => {
    if (previous === undefined) delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
    else process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous;
  });
  for (const selectedDiagrams of [[...diagramKindSchema.options], ["prototype"]]) {
    const input = startRunRequestSchema.parse({ requirementText: "演示需求", selectedDiagrams });
    const record: RunRecord = {
      snapshot: createEmptySnapshot("demo-traceability", input.requirementText, input.selectedDiagrams),
      events: [], listeners: new Set(), terminal: false,
    };
    await completeOfflineDemoRequirementRun(record, input);
    const snapshot = runSnapshotSchema.parse(record.snapshot);
    assert.equal(snapshot.status, "completed");
    assert.ok(snapshot.requirementModelTraceability.every((entry) => selectedDiagrams.includes(entry.target.diagramKind)));
    const coverage = normalizeRequirementTraceabilityWithCoverage(
      snapshot.requirementModelTraceability,
      snapshot.rules,
      snapshot.models.filter((model) => model.diagramKind !== "analysis"),
    );
    assert.ok(coverage.missingTargets.every(target => target.diagramKind === "function"));
    if (selectedDiagrams.includes("deployment")) {
      assert.equal(snapshot.models.some(model => model.diagramKind === "deployment"), false);
      assert.match(snapshot.diagramErrors.deployment?.error.message ?? "", /没有对应类型/);
    }
    for (const elementId of ["mobile-entry", "mobile-login"]) {
      assert.ok(snapshot.requirementModelTraceability.some((entry) =>
        entry.target.modelId === "proto-001" && entry.target.elementId === elementId,
      ));
    }
  }
});
