// Verifies source references, truthful report states, and safe local paths independently of filesystem execution.
import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpImplementationPathSchema,
  mcpExpandedImplementationReportSchema as mcpImplementationReportSchema,
  mcpExpandedImplementationSnapshotSchema as mcpImplementationSnapshotSchema,
  mcpImplementationTaskSchema,
} from "./implementation.js";

const hash = `sha256:${"a".repeat(64)}`;
const designRef = {
  artifactId: "design:loan", modelId: "loan", diagramKind: "class" as const,
  elementId: "loan-service", elementKind: "class", label: "LoanService",
};
function taskFixture() {
  return {
    id: "implement:borrow", title: "借阅限制", requirementIds: ["BORROW", "RETURN"],
    sourceArtifactIds: ["requirement:BORROW", "requirement:RETURN", "design:loan"],
    designRefs: [designRef],
    acceptanceCriteria: [{ id: "borrow:max-five", text: "不能借阅第六本", sourceArtifactId: "requirement:BORROW" }],
    dependsOnTaskIds: [] as string[], issues: [], guidance: ["按本地仓库组织服务。"],
  };
}
function snapshotFixture() {
  const task = taskFixture();
  return {
    version: 2 as const, projectId: "p", scope: { requirementIds: [], artifactIds: [] }, contextVersion: "context-v1",
    manifest: task.sourceArtifactIds.map((artifactId) => ({ artifactId, contentHash: hash, inputFingerprint: null, freshness: "current" as const })),
    tasks: [task],
  };
}
function reportFixture() {
  const snapshot = snapshotFixture();
  return {
    version: 2 as const, projectId: "p", scope: snapshot.scope, contextVersion: snapshot.contextVersion,
    entries: [{
      taskId: snapshot.tasks[0].id, requirementIds: snapshot.tasks[0].requirementIds,
      designRefs: snapshot.tasks[0].designRefs, sourceVersions: snapshot.manifest, status: "implemented" as const,
      plannedTargets: [{ path: "src/loan.ts", responsibility: "执行业务限制" }],
      actualRefs: [{ path: "src/loan.ts", symbol: "LoanService", contentHash: hash }],
      inputRefs: [{ path: "package-lock.json", contentHash: hash }],
      testRefs: [{ path: "tests/loan.test.ts", testName: "reject sixth loan", criterionIds: ["borrow:max-five"], contentHash: hash }],
      checks: [{ id: "behavior", kind: "behavior" as const, command: "node", args: ["--test", "tests/loan.test.ts"], criterionIds: ["borrow:max-five"] }],
    }],
  };
}

test("task snapshots preserve many-to-many source references and permit dependency cycles", () => {
  const snapshot = snapshotFixture();
  const second = { ...taskFixture(), id: "implement:return", acceptanceCriteria: [], dependsOnTaskIds: ["implement:borrow"] };
  snapshot.tasks[0].dependsOnTaskIds = [second.id];
  snapshot.tasks.push(second);
  assert.deepEqual(mcpImplementationSnapshotSchema.parse(snapshot), snapshot);
  assert.ok(mcpImplementationTaskSchema.safeParse({ ...taskFixture(), designRefs: [], acceptanceCriteria: [] }).success);
});

test("task references and criteria must have a declared source", () => {
  for (const task of [
    { ...taskFixture(), sourceArtifactIds: ["requirement:BORROW"] },
    { ...taskFixture(), acceptanceCriteria: [{ id: "x", text: "验收", sourceArtifactId: "missing" }] },
  ]) assert.equal(mcpImplementationTaskSchema.safeParse(task).success, false);
});

test("snapshot rejects orphan sources, dependencies and implementation artifacts as original sources", () => {
  const missingSource = snapshotFixture();
  missingSource.manifest.pop();
  assert.equal(mcpImplementationSnapshotSchema.safeParse(missingSource).success, false);
  const missingDependency = snapshotFixture();
  missingDependency.tasks[0].dependsOnTaskIds = ["missing"];
  assert.equal(mcpImplementationSnapshotSchema.safeParse(missingDependency).success, false);
  const generatedSource = snapshotFixture();
  generatedSource.manifest.push({ ...generatedSource.manifest[0], artifactId: "implementation:borrow" });
  assert.equal(mcpImplementationSnapshotSchema.safeParse(generatedSource).success, false);
});

test("snapshot rejects duplicate task IDs, global criterion IDs and source versions", () => {
  const duplicateTask = snapshotFixture();
  duplicateTask.tasks.push(taskFixture());
  assert.equal(mcpImplementationSnapshotSchema.safeParse(duplicateTask).success, false);
  const duplicateCriterion = snapshotFixture();
  duplicateCriterion.tasks.push({ ...taskFixture(), id: "different-task" });
  assert.equal(mcpImplementationSnapshotSchema.safeParse(duplicateCriterion).success, false);
  const duplicateSource = snapshotFixture();
  duplicateSource.manifest.push(duplicateSource.manifest[0]);
  assert.equal(mcpImplementationSnapshotSchema.safeParse(duplicateSource).success, false);
});

test("task rejects duplicate requirements, design elements and criteria", () => {
  const original = taskFixture();
  for (const task of [
    { ...original, requirementIds: ["BORROW", "BORROW"] },
    { ...original, designRefs: [designRef, { ...designRef, label: "Renamed" }] },
    { ...original, acceptanceCriteria: [...original.acceptanceCriteria, ...original.acceptanceCriteria] },
  ]) assert.equal(mcpImplementationTaskSchema.safeParse(task).success, false);
});

test("report records implementation claims but rejects claimed verification results", () => {
  const report = reportFixture();
  assert.deepEqual(mcpImplementationReportSchema.parse(report), report);
  for (const entry of [
    { ...report.entries[0], status: "verified" },
    { ...report.entries[0], verification: { state: "passed" } },
    { ...report.entries[0], checks: [{ ...report.entries[0].checks[0], exitCode: 0 }] },
  ]) assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [entry] }).success, false);
});

test("planned entries cannot claim evidence and implemented entries need actual code references", () => {
  const report = reportFixture();
  const entry = report.entries[0];
  const planned = { ...entry, status: "planned", actualRefs: [], inputRefs: [], testRefs: [], checks: [] };
  assert.ok(mcpImplementationReportSchema.safeParse({ ...report, entries: [planned] }).success);
  for (const field of ["actualRefs", "inputRefs", "testRefs", "checks"] as const) {
    assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [{ ...planned, [field]: entry[field] }] }).success, false);
  }
  assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [{ ...entry, actualRefs: [] }] }).success, false);
});

test("report allows incomplete source and acceptance coverage for the independent verifier to assess", () => {
  const report = reportFixture();
  const entry = { ...report.entries[0], sourceVersions: [], checks: [], testRefs: [] };
  const { inputRefs: _inputRefs, ...withoutInputs } = entry;
  const parsed = mcpImplementationReportSchema.parse({ ...report, entries: [withoutInputs] });
  assert.deepEqual(parsed.entries[0].inputRefs, []);
});

test("relative paths reject traversal, platform-specific absolute paths, ADS and control characters", () => {
  for (const path of ["/src/a.ts", "../a.ts", "src/../a.ts", "./a.ts", "src//a.ts", "src/", "C:/a.ts", "C:a.ts", "src\\a.ts", "src/a.ts:secret", "src/a\u0000.ts", "src/a\n.ts", "src/NUL.ts", "src/COM1", "src/trailing.", "src/trailing ", " src/a.ts"]) {
    assert.equal(mcpImplementationPathSchema.safeParse(path).success, false, path);
  }
  for (const path of ["src/loan.ts", ".config/settings.json", "src/借阅服务.ts", "src/a file.ts"])
    assert.ok(mcpImplementationPathSchema.safeParse(path).success, path);
});

test("all evidence paths and file hashes are validated while command arguments remain inert data", () => {
  const report = reportFixture();
  const entry = report.entries[0];
  for (const field of ["actualRefs", "inputRefs", "testRefs"] as const) {
    const invalidPath = { ...entry, [field]: [{ ...entry[field][0], path: "../outside" }] };
    const invalidHash = { ...entry, [field]: [{ ...entry[field][0], contentHash: "sha256:short" }] };
    assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [invalidPath] }).success, false);
    assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [invalidHash] }).success, false);
  }
  const args = ["", "$(not-executed)", "argument\nwith newline"];
  const parsed = mcpImplementationReportSchema.parse({ ...report, entries: [{ ...entry, checks: [{ ...entry.checks[0], args }] }] });
  assert.deepEqual(parsed.entries[0].checks[0].args, args);
});

test("report rejects duplicate entries, file references, checks, source versions and criterion references", () => {
  const report = reportFixture();
  const entry = report.entries[0];
  assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [entry, entry] }).success, false);
  for (const field of ["plannedTargets", "actualRefs", "inputRefs", "testRefs", "checks", "sourceVersions"] as const) {
    assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [{ ...entry, [field]: [...entry[field], entry[field][0]] }] }).success, false, field);
  }
  assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [{ ...entry, checks: [{ ...entry.checks[0], criterionIds: ["same", "same"] }] }] }).success, false);
});

test("strict nested schemas reject unexpected data rather than silently trusting it", () => {
  const snapshot = snapshotFixture();
  assert.equal(mcpImplementationSnapshotSchema.safeParse({ ...snapshot, token: "private" }).success, false);
  assert.equal(mcpImplementationTaskSchema.safeParse({ ...taskFixture(), designRefs: [{ ...designRef, file: "guessed.ts" }] }).success, false);
  const report = reportFixture();
  assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [{ ...report.entries[0], inputRefs: [{ path: "package.json", contentHash: hash, verified: true }] }] }).success, false);
});

test("check execution limits remain optional and accept bounded integer overrides", () => {
  const report = reportFixture();
  const parsed = mcpImplementationReportSchema.parse(report);
  assert.equal(Object.hasOwn(parsed.entries[0].checks[0], "timeoutMs"), false);
  assert.equal(Object.hasOwn(parsed.entries[0].checks[0], "maxOutputBytes"), false);
  for (const limits of [
    { timeoutMs: 1000, maxOutputBytes: 1024 },
    { timeoutMs: 600000, maxOutputBytes: 4194304 },
    { timeoutMs: 180000 },
    { maxOutputBytes: 1048576 },
  ]) {
    const entry = { ...report.entries[0], checks: [{ ...report.entries[0].checks[0], ...limits }] };
    const result = mcpImplementationReportSchema.parse({ ...report, entries: [entry] });
    for (const [key, value] of Object.entries(limits))
      assert.equal((result.entries[0].checks[0] as Record<string, unknown>)[key], value);
  }
});

test("check execution limits reject out-of-range and non-integer overrides", () => {
  const report = reportFixture();
  for (const limits of [
    { timeoutMs: 999 }, { timeoutMs: 600001 }, { timeoutMs: 1000.5 }, { timeoutMs: "30000" },
    { maxOutputBytes: 1023 }, { maxOutputBytes: 4194305 }, { maxOutputBytes: 1024.5 }, { maxOutputBytes: null },
  ]) {
    const entry = { ...report.entries[0], checks: [{ ...report.entries[0].checks[0], ...limits }] };
    assert.equal(mcpImplementationReportSchema.safeParse({ ...report, entries: [entry] }).success, false);
  }
});
