// Checks that frozen demo requirements retain the traceability needed by downstream design generation.
import assert from "node:assert/strict";
import test from "node:test";
import { diagramKindSchema, runSnapshotSchema, startRunRequestSchema } from "@uml-platform/contracts";
import { normalizeRequirementTraceabilityWithCoverage } from "../../normalizers/traceability/traceability-normalizer.js";
import { createEmptySnapshot } from "../records/snapshots.js";
import type { RunRecord } from "../records/run-record-store.js";
import { librarySeatDemoFixture } from "./fixtures/library-seat-demo-fixture.js";
import { completeOfflineDemoRequirementRun } from "./offline-demo-runs.js";

test("demo requirements cover every traceable element used by design prerequisites", () => {
  const snapshot = runSnapshotSchema.parse(librarySeatDemoFixture.requirementSnapshot);
  // Analysis sequences are traced through their source use case, outside the rule-to-model gate.
  const coverage = normalizeRequirementTraceabilityWithCoverage(
    snapshot.requirementModelTraceability,
    snapshot.rules,
    snapshot.models.filter((model) => model.diagramKind !== "analysis"),
  );
  assert.deepEqual(coverage.missingTargets, []);
  for (const [elementId, requirementId] of [["mobile-entry", "REQ-011"], ["mobile-login", "REQ-001"]]) {
    const artifactId = `proto-001:prototype:${elementId}`;
    for (const downstream of [snapshot, librarySeatDemoFixture.designSnapshot]) {
      assert.ok(downstream.coverageMatrix?.rows.find((row) => row.requirementId === requirementId)?.modelElements.includes(artifactId));
      assert.ok(downstream.traceabilityMatrix?.links.some((link) =>
        link.fromArtifactId === requirementId && link.toArtifactId === artifactId && link.linkType === "satisfies",
      ));
      assert.ok(downstream.traceabilityMatrix?.links.some((link) =>
        link.fromArtifactId === artifactId && link.toArtifactId === requirementId && link.linkType === "derives-from",
      ));
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
    assert.deepEqual(coverage.missingTargets, []);
    for (const elementId of ["mobile-entry", "mobile-login"]) {
      assert.ok(snapshot.requirementModelTraceability.some((entry) =>
        entry.target.modelId === "proto-001" && entry.target.elementId === elementId,
      ));
    }
  }
});
