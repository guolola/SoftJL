// Verifies lossless wire compaction, strict references and independent historical report versions.
import assert from "node:assert/strict";
import test from "node:test";
import {
  compactImplementationSnapshot, compactImplementationReport,
  mcpImplementationSnapshotSchema, mcpImplementationReportSchema,
  type McpImplementationSnapshot, type McpImplementationReport,
} from "./implementation.js";

function fixture() {
  const manifest = Array.from({ length: 37 }, (_, index) => ({
    artifactId: `design:source-${index.toString().padStart(3, "0")}-${"a".repeat(24)}`,
    contentHash: `sha256:${"a".repeat(64)}`, inputFingerprint: `sha256:${"b".repeat(64)}`, freshness: "current" as const,
  }));
  const snapshot: McpImplementationSnapshot = {
    version: 2, projectId: "p", scope: { requirementIds: [], artifactIds: [] }, contextVersion: "v2", manifest,
    tasks: Array.from({ length: 14 }, (_, index) => ({
      id: `implement:REQ-${index}`, title: `Requirement ${index}`, requirementIds: [`REQ-${index}`],
      sourceArtifactIds: manifest.map((item) => item.artifactId), designRefs: [], dependsOnTaskIds: [],
      acceptanceCriteria: [{ id: `criterion:${index}`, text: `Accept requirement ${index}`, sourceArtifactId: manifest[0].artifactId }],
      issues: Array.from({ length: 22 }, (_, i) => ({ code: `issue:${i}`, severity: "warning" as const, message: `Source ${i}: ${"Review the saved source and its unresolved constraints. ".repeat(3)}`.trim() })),
      guidance: Array.from({ length: 11 }, (_, i) => `Guidance ${i}: ${"Read source models and verify acceptance criteria. ".repeat(2)}`.trim()),
    })),
  };
  const report: McpImplementationReport = {
    version: 2, projectId: snapshot.projectId, scope: snapshot.scope, contextVersion: snapshot.contextVersion,
    entries: snapshot.tasks.map((task) => ({
      taskId: task.id, requirementIds: task.requirementIds, designRefs: [], sourceVersions: manifest,
      status: "planned", plannedTargets: [], actualRefs: [], inputRefs: [], testRefs: [], checks: [],
    })),
  };
  return { snapshot, report };
}

test("14 tasks retain all information while repeated snapshot and report data shrink by at least 75 percent", (t) => {
  const { snapshot, report } = fixture();
  const before = structuredClone({ snapshot, report });
  const compact = { snapshot: compactImplementationSnapshot(snapshot), report: compactImplementationReport(report) };
  assert.deepEqual(mcpImplementationSnapshotSchema.parse(compact.snapshot), snapshot);
  assert.deepEqual(mcpImplementationReportSchema.parse(compact.report), report);
  assert.deepEqual({ snapshot, report }, before);
  assert.equal(compact.snapshot.shared.issues.length, 22);
  assert.equal(compact.snapshot.shared.guidance.length, 11);
  assert.equal(compact.report.sourceVersions.length, 37);
  const beforeChars = JSON.stringify(before).length, afterChars = JSON.stringify(compact).length;
  t.diagnostic(`Repeated 14-task fixture: ${beforeChars} -> ${afterChars} characters (${(100 * (1 - afterChars / beforeChars)).toFixed(1)}% reduction)`);
  assert.ok(afterChars < beforeChars * 0.25);
});

test("dangling, duplicate, negative and fractional references are rejected instead of silently dropping evidence", () => {
  const { snapshot, report } = fixture();
  for (const refs of [[99999], [0, 0], [-1], [0.5]]) {
    for (const field of ["sourceRefs", "designRefs", "issueRefs", "guidanceRefs"] as const) {
      const wire = compactImplementationSnapshot(snapshot);
      wire.tasks[0][field] = refs;
      assert.equal(mcpImplementationSnapshotSchema.safeParse(wire).success, false, field);
    }
    const wire = compactImplementationReport(report);
    wire.entries[0].sourceVersionRefs = refs;
    assert.equal(mcpImplementationReportSchema.safeParse(wire).success, false);
  }
});

test("partial report refresh retains different historical versions of the same source for unchanged tasks", () => {
  const { report } = fixture();
  report.entries[1].sourceVersions = report.entries[1].sourceVersions.map((version) => ({ ...version, contentHash: `sha256:${"c".repeat(64)}` }));
  const wire = compactImplementationReport(report);
  assert.equal(wire.sourceVersions.length, 74);
  assert.deepEqual(mcpImplementationReportSchema.parse(wire), report);
  assert.notEqual(wire.entries[0].sourceVersionRefs[0], wire.entries[1].sourceVersionRefs[0]);
});

test("wire schemas reject old format, expanded payloads, extra fields and invalid expanded source relationships", () => {
  const { snapshot, report } = fixture();
  const wire = compactImplementationSnapshot(snapshot);
  assert.equal(mcpImplementationSnapshotSchema.safeParse({ ...wire, version: 1 }).success, false);
  assert.equal(mcpImplementationReportSchema.safeParse({ ...compactImplementationReport(report), version: 1 }).success, false);
  assert.equal(mcpImplementationSnapshotSchema.safeParse(snapshot).success, false);
  assert.equal(mcpImplementationReportSchema.safeParse(report).success, false);
  assert.equal(mcpImplementationSnapshotSchema.safeParse({ ...wire, shared: { ...wire.shared, token: "invalid" } }).success, false);
  wire.tasks[0].sourceRefs = [];
  assert.equal(mcpImplementationSnapshotSchema.safeParse(wire).success, false);
});
