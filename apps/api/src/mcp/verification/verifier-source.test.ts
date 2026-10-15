// Runs the distributed verifier against real repositories and real borrower-limit acceptance tests.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test, { type TestContext } from "node:test";
import {
  mcpExpandedImplementationSnapshotSchema as mcpImplementationSnapshotSchema,
  mcpExpandedImplementationReportSchema as mcpImplementationReportSchema,
  compactImplementationSnapshot,
  compactImplementationReport,
  type McpImplementationSnapshot,
  type McpImplementationReport,
} from "@uml-platform/contracts";
import { implementationVerifierSource } from "./verifier-source.js";

type Assessment = {
  overall: string;
  verificationAuthority: string;
  issues: Array<{ code: string; severity: string }>;
  entries: Array<{ taskId: string; status: string; issues: Array<{ code: string; severity: string }>; checks: Array<{ status: string; error?: string; stdout: string; stderr: string; timeoutMs: number; maxOutputBytes: number }> }>;
  limitations: string[];
};
type Verify = (input: { root: string; snapshot: unknown; report: unknown; runChecks?: boolean }) => Promise<Assessment>;
const sha = (value: string | Buffer) => "sha256:" + createHash("sha256").update(value).digest("hex");
const loanCode = (limit: number) => "export function borrow(active) { if (active >= " + limit + ") throw new Error('limit'); return active + 1; }\n";
const loanTests = (limit: number) => [
  "import assert from 'node:assert/strict';",
  "import test from 'node:test';",
  "import { borrow } from '../src/loan.mjs';",
  "test('last loan is allowed', () => assert.equal(borrow(" + (limit - 1) + "), " + limit + "));",
  "test('next loan is rejected', () => assert.throws(() => borrow(" + limit + "), /limit/));",
  "test('return restores capacity and rejection preserves count', () => { let count = " + limit + "; assert.throws(() => { count = borrow(count); }); assert.equal(count, " + limit + "); count--; assert.equal(borrow(count), " + limit + "); });",
].join("\n");

async function fixture(t: TestContext, codeLimit = 5) {
  const base = await mkdtemp(path.join(tmpdir(), "uml-verifier-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, "repo");
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tests"));
  await writeFile(path.join(root, "src/loan.mjs"), loanCode(codeLimit));
  await writeFile(path.join(root, "tests/loan.test.mjs"), loanTests(5));
  await writeFile(path.join(root, "package.json"), '{"private":true,"type":"module"}');
  const verifierPath = path.join(root, "uml-verify.mjs");
  await writeFile(verifierPath, implementationVerifierSource);
  const { verifyImplementation: wireVerify } = await import(pathToFileURL(verifierPath).href) as { verifyImplementation: Verify };
  const verify: Verify = (input) => wireVerify({ ...input,
    snapshot: compactImplementationSnapshot(input.snapshot as McpImplementationSnapshot),
    report: compactImplementationReport(input.report as McpImplementationReport),
  });
  const versions = [
    { artifactId: "requirement:BORROW", contentHash: sha("最多5本"), inputFingerprint: null, freshness: "current" as const },
    { artifactId: "design:loan", contentHash: sha("loan-service"), inputFingerprint: "v1", freshness: "current" as const },
  ];
  const designRef = { artifactId: "design:loan", modelId: "loan", diagramKind: "class" as const, elementId: "loan-service", elementKind: "class", label: "LoanService" };
  const snapshot: McpImplementationSnapshot = {
    version: 2, projectId: "library", scope: { requirementIds: [], artifactIds: [] }, contextVersion: "v1", manifest: versions,
    tasks: [{
      id: "implement:borrow", title: "借阅限制", requirementIds: ["BORROW"], sourceArtifactIds: versions.map((item) => item.artifactId), designRefs: [designRef],
      acceptanceCriteria: [
        { id: "borrow:limit", text: "允许第5本，拒绝第6本", sourceArtifactId: "requirement:BORROW" },
        { id: "borrow:return", text: "归还后允许继续借阅；拒绝时借阅数保持不变", sourceArtifactId: "requirement:BORROW" },
      ],
      dependsOnTaskIds: [], issues: [], guidance: ["按需求验证"],
    }],
  };
  const report: McpImplementationReport = {
    version: 2, projectId: snapshot.projectId, scope: snapshot.scope, contextVersion: snapshot.contextVersion,
    entries: [{
      taskId: "implement:borrow", requirementIds: ["BORROW"], designRefs: [designRef], sourceVersions: structuredClone(versions),
      status: "implemented", plannedTargets: [{ path: "src/loan.mjs", responsibility: "借阅限制" }],
      actualRefs: [{ path: "src/loan.mjs", symbol: "borrow", contentHash: sha(loanCode(codeLimit)) }],
      inputRefs: [{ path: "package.json", contentHash: sha('{"private":true,"type":"module"}') }],
      testRefs: [{ path: "tests/loan.test.mjs", criterionIds: ["borrow:limit", "borrow:return"], contentHash: sha(loanTests(5)) }],
      checks: [
        { id: "syntax", kind: "engineering", command: process.execPath, args: ["--check", "src/loan.mjs"], criterionIds: [] },
        { id: "acceptance", kind: "behavior", command: process.execPath, args: ["--test", "tests/loan.test.mjs"], criterionIds: ["borrow:limit", "borrow:return"] },
      ],
    }],
  };
  // The executable fixture uses exactly the independently maintained wire contracts.
  mcpImplementationSnapshotSchema.parse(snapshot);
  mcpImplementationReportSchema.parse(report);
  return { base, root, verifierPath, verify, wireVerify, snapshot, report };
}
const codes = (assessment: Assessment) => [...assessment.issues, ...assessment.entries.flatMap((entry) => entry.issues)].map((item) => item.code);

test("wire v2 rejects old formats and malformed references before executing any commands", async (t) => {
  const f = await fixture(t);
  for (const field of ["sourceRefs", "designRefs", "issueRefs", "guidanceRefs"] as const) {
    for (const refs of [[99999], [-1], [0.5], [0, 0]]) {
      const snapshot = compactImplementationSnapshot(f.snapshot);
      snapshot.tasks[0][field] = refs;
      const result = await f.wireVerify({ root: f.root, snapshot, report: compactImplementationReport(f.report), runChecks: true });
      assert.ok(codes(result).includes("invalid_snapshot"), field);
      assert.equal(result.verificationAuthority, "not-executed");
    }
  }
  for (const refs of [[99999], [-1], [0.5], [0, 0]]) {
    const report = compactImplementationReport(f.report);
    report.entries[0].sourceVersionRefs = refs;
    const result = await f.wireVerify({ root: f.root, snapshot: compactImplementationSnapshot(f.snapshot), report, runChecks: true });
    assert.ok(codes(result).includes("invalid_report"));
    assert.equal(result.verificationAuthority, "not-executed");
  }
  const old = await f.wireVerify({ root: f.root, snapshot: { ...f.snapshot, version: 1 }, report: { ...f.report, version: 1 }, runChecks: true });
  assert.deepEqual(codes(old), ["invalid_snapshot", "invalid_report"]);
});

test("partial version-pool refresh cannot make another task's historical source evidence current", async (t) => {
  const f = await fixture(t);
  const second = structuredClone(f.snapshot.tasks[0]);
  second.id = "implement:second";
  second.acceptanceCriteria = second.acceptanceCriteria.map((criterion) => ({ ...criterion, id: `second:${criterion.id}` }));
  f.snapshot.tasks.push(second);
  const secondEntry = structuredClone(f.report.entries[0]);
  secondEntry.taskId = second.id;
  secondEntry.testRefs[0].criterionIds = second.acceptanceCriteria.map((criterion) => criterion.id);
  secondEntry.checks[1].criterionIds = secondEntry.testRefs[0].criterionIds;
  f.report.entries.push(secondEntry);
  f.snapshot.manifest[0].contentHash = sha("new source");
  f.report.entries[0].sourceVersions = structuredClone(f.snapshot.manifest);
  const wire = compactImplementationReport(f.report);
  assert.equal(wire.sourceVersions.length, 3);
  const result = await f.wireVerify({ root: f.root, snapshot: compactImplementationSnapshot(f.snapshot), report: wire, runChecks: true });
  assert.equal(result.entries[0].status, "verified");
  assert.equal(result.entries[1].status, "stale");
  assert.deepEqual(result.entries[1].checks, []);
});

test("distributed verifier is dependency-free and verifies actual loan boundaries only after explicit execution", async (t) => {
  const f = await fixture(t);
  const passive = await f.verify(f);
  assert.equal(passive.overall, "incomplete");
  assert.equal(passive.verificationAuthority, "not-executed");
  assert.ok(codes(passive).includes("checks_not_executed"));
  assert.deepEqual(passive.entries[0].checks, []);
  const active = await f.verify({ ...f, runChecks: true });
  assert.equal(active.overall, "verified");
  assert.equal(active.verificationAuthority, "local-execution");
  assert.equal(active.entries[0].checks.length, 2);
  assert.ok(active.entries[0].checks.every((check) => check.status === "passed"));
  assert.match(active.limitations.join(" "), /not platform verification/);
});

test("implemented code with matching file hashes still fails when borrowing behavior violates the requirement", async (t) => {
  const f = await fixture(t, 6);
  const assessment = await f.verify({ ...f, runChecks: true });
  assert.equal(assessment.overall, "failed", JSON.stringify(assessment));
  assert.deepEqual(assessment.entries[0].checks.map((check) => check.status), ["passed", "failed"]);
});

test("changing limit from five to eight invalidates source evidence then requires updated code and acceptance tests", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.verify({ ...f, runChecks: true })).overall, "verified");
  f.snapshot.contextVersion = "v2";
  f.snapshot.manifest[0].contentHash = sha("最多8本");
  f.snapshot.tasks[0].acceptanceCriteria[0].text = "允许第8本，拒绝第9本";
  const stale = await f.verify({ ...f, runChecks: true });
  assert.equal(stale.overall, "stale");
  assert.deepEqual(stale.entries[0].checks, []);
  f.report.contextVersion = f.snapshot.contextVersion;
  f.report.entries[0].sourceVersions = structuredClone(f.snapshot.manifest);
  await writeFile(path.join(f.root, "tests/loan.test.mjs"), loanTests(8));
  f.report.entries[0].testRefs[0].contentHash = sha(loanTests(8));
  assert.equal((await f.verify({ ...f, runChecks: true })).overall, "failed");
  await writeFile(path.join(f.root, "src/loan.mjs"), loanCode(8));
  f.report.entries[0].actualRefs[0].contentHash = sha(loanCode(8));
  assert.equal((await f.verify({ ...f, runChecks: true })).overall, "verified");
});

test("code, test and indirect build-input edits invalidate old evidence", async (t) => {
  for (const [relative, content] of [["src/loan.mjs", loanCode(6)], ["tests/loan.test.mjs", loanTests(8)], ["package.json", '{"private":false}']]) {
    await t.test(relative, async (child) => {
      const f = await fixture(child);
      await writeFile(path.join(f.root, relative), content);
      const assessment = await f.verify({ ...f, runChecks: true });
      assert.equal(assessment.overall, "stale");
      assert.ok(codes(assessment).includes("stale_file"));
      assert.deepEqual(assessment.entries[0].checks, []);
    });
  }
});

test("missing task, missing tests and uncovered acceptance conditions cannot verify", async (t) => {
  const cases: Array<[string, (f: Awaited<ReturnType<typeof fixture>>) => void, string]> = [
    ["task", (f) => { f.report.entries = []; }, "missing_task"],
    ["test", (f) => { f.report.entries[0].testRefs = []; }, "missing_tests"],
    ["criterion", (f) => { f.report.entries[0].checks[1].criterionIds = ["borrow:limit"]; }, "behavior_coverage"],
    ["unknown criterion", (f) => { f.report.entries[0].checks[1].criterionIds.push("invented"); }, "behavior_coverage"],
    ["engineering", (f) => { f.report.entries[0].checks.shift(); }, "missing_engineering"],
    ["design", (f) => { f.report.entries[0].designRefs = []; }, "design_coverage"],
    ["symbol", (f) => { f.report.entries[0].actualRefs[0].symbol = "missingMethod"; }, "missing_symbol"],
    ["source", (f) => { f.report.entries[0].sourceVersions.pop(); }, "stale_sources"],
  ];
  for (const [name, change, expected] of cases) await t.test(name, async (child) => {
    const f = await fixture(child); change(f);
    const assessment = await f.verify({ ...f, runChecks: true });
    assert.notEqual(assessment.overall, "verified");
    assert.ok(codes(assessment).includes(expected), JSON.stringify(assessment));
    assert.ok(assessment.entries.every((entry) => entry.checks.length === 0));
  });
});

test("source blockers, project mismatch and duplicate IDs are not trusted", async (t) => {
  const cases: Array<[string, (f: Awaited<ReturnType<typeof fixture>>) => void, string]> = [
    ["blocker", (f) => { f.snapshot.tasks[0].issues.push({ code: "conflict", severity: "blocking", message: "规则冲突" }); }, "conflict"],
    ["project", (f) => { f.report.projectId = "another"; }, "context_binding"],
    ["scope", (f) => { f.report.scope = { requirementIds: ["OTHER"], artifactIds: [] }; }, "context_binding"],
    ["duplicate report", (f) => { f.report.entries.push(structuredClone(f.report.entries[0])); }, "invalid_report"],
    ["duplicate snapshot", (f) => { f.snapshot.tasks.push(structuredClone(f.snapshot.tasks[0])); }, "invalid_snapshot"],
    ["unknown task", (f) => { f.report.entries[0].taskId = "unknown"; }, "unknown_task"],
    ["unknown design", (f) => { f.report.entries[0].designRefs = [{ ...f.report.entries[0].designRefs[0], elementId: "invented" }]; }, "design_coverage"],
  ];
  for (const [name, change, expected] of cases) await t.test(name, async (child) => {
    const f = await fixture(child); change(f);
    const assessment = await f.verify({ ...f, runChecks: true });
    assert.notEqual(assessment.overall, "verified");
    assert.ok(codes(assessment).includes(expected), JSON.stringify(assessment));
  });
});

test("absolute paths, traversal, Windows special paths and external junctions are rejected", async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.base, "external");
  await mkdir(outside);
  await writeFile(path.join(outside, "loan.mjs"), loanCode(5));
  await symlink(outside, path.join(f.root, "linked"), process.platform === "win32" ? "junction" : "dir");
  for (const relative of [path.join(outside, "loan.mjs"), "../external/loan.mjs", "linked/loan.mjs", "src/loan.mjs:stream", "C:loan.mjs", "src/../src/loan.mjs", "src/NUL", "src\\loan.mjs"]) {
    f.report.entries[0].actualRefs[0].path = relative;
    const assessment = await f.verify({ ...f, runChecks: true });
    assert.equal(assessment.overall, "incomplete", relative);
    assert.ok(codes(assessment).includes("invalid_file"), relative);
    assert.deepEqual(assessment.entries[0].checks, []);
  }
});

test("commands are never executed by default, and command failures or missing programs cannot pass", async (t) => {
  const f = await fixture(t);
  f.report.entries[0].checks[0].args = ["-e", "require('node:fs').writeFileSync('executed','yes'); process.exit(7)"];
  const before = await f.verify(f);
  assert.equal(before.verificationAuthority, "not-executed");
  await assert.rejects(readFile(path.join(f.root, "executed")));
  const failed = await f.verify({ ...f, runChecks: true });
  assert.equal(failed.overall, "failed");
  assert.equal(await readFile(path.join(f.root, "executed"), "utf8"), "yes");
  f.report.entries[0].checks[0].command = path.join(f.root, "missing-executable");
  const missing = await f.verify({ ...f, runChecks: true });
  assert.equal(missing.overall, "failed");
  assert.match(missing.entries[0].checks[0].error ?? "", /ENOENT/);
});

test("excess command output fails with bounded diagnostic output", async (t) => {
  const f = await fixture(t);
  f.report.entries[0].checks[0].args = ["-e", "process.stdout.write('x'.repeat(2000000))"];
  const assessment = await f.verify({ ...f, runChecks: true });
  assert.equal(assessment.overall, "failed");
  assert.ok(JSON.stringify(assessment).length < 70000);
});

test("changes to evidence and configuration during checks invalidate passing commands", async (t) => {
  for (const target of ["src/loan.mjs", "package.json"]) await t.test(target, async (child) => {
    const f = await fixture(child);
    f.report.entries[0].checks[0].args = ["-e", "require('node:fs').appendFileSync(" + JSON.stringify(target) + ", '\\n')"];
    const assessment = await f.verify({ ...f, runChecks: true });
    assert.equal(assessment.overall, "stale");
    assert.ok(codes(assessment).includes("stale_during_checks"));
  });
});

test("an unrelated context change allows current tasks to reverify while a changed task remains stale", async (t) => {
  const f = await fixture(t);
  const otherTask = structuredClone(f.snapshot.tasks[0]);
  otherTask.id = "implement:other";
  otherTask.requirementIds = ["OTHER"];
  otherTask.sourceArtifactIds = ["requirement:OTHER"];
  otherTask.designRefs = [];
  otherTask.acceptanceCriteria = [{ id: "other:limit", text: "原样验证", sourceArtifactId: "requirement:OTHER" }];
  f.snapshot.tasks.push(otherTask);
  const otherVersion = { artifactId: "requirement:OTHER", contentHash: sha("original"), inputFingerprint: null, freshness: "current" as const };
  f.snapshot.manifest.push(otherVersion);
  const otherEntry = structuredClone(f.report.entries[0]);
  otherEntry.taskId = otherTask.id; otherEntry.requirementIds = ["OTHER"]; otherEntry.designRefs = [];
  otherEntry.sourceVersions = [{ ...otherVersion, contentHash: sha("outdated") }];
  otherEntry.testRefs[0].criterionIds = ["other:limit"]; otherEntry.checks[1].criterionIds = ["other:limit"];
  f.report.entries.push(otherEntry);
  f.snapshot.contextVersion = "v2";
  const assessment = await f.verify({ ...f, runChecks: true });
  assert.equal(assessment.overall, "stale");
  assert.deepEqual(assessment.entries.map((entry) => entry.status), ["verified", "stale"]);
  assert.ok(codes(assessment).includes("context_refreshed"));
});

test("planned entries remain planned and cannot promote themselves to verified", async (t) => {
  const f = await fixture(t);
  const entry = f.report.entries[0];
  entry.status = "planned"; entry.actualRefs = []; entry.inputRefs = []; entry.testRefs = []; entry.checks = [];
  const assessment = await f.verify({ ...f, runChecks: true });
  assert.equal(assessment.overall, "planned");
  assert.equal(assessment.verificationAuthority, "not-executed");
});

test("CLI reads scoped local JSON, returns machine-readable assessment, and uses nonzero status until verified", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, ".uml-implementation-context.json"), JSON.stringify(compactImplementationSnapshot(f.snapshot)));
  await writeFile(path.join(f.root, ".uml-implementation.json"), JSON.stringify(compactImplementationReport(f.report)));
  const beforeBytes = await readFile(path.join(f.root, ".uml-implementation.json"));
  const run = (extra: string[]) => spawnSync(process.execPath, [f.verifierPath, "--root", f.root, ...extra], { encoding: "utf8", windowsHide: true });
  const passive = run([]);
  assert.equal(passive.status, 1, passive.stderr);
  assert.equal(JSON.parse(passive.stdout).overall, "incomplete");
  const active = run(["--run-checks"]);
  assert.equal(active.status, 0, active.stdout + active.stderr);
  assert.equal(JSON.parse(active.stdout).overall, "verified");
  assert.deepEqual(await readFile(path.join(f.root, ".uml-implementation.json")), beforeBytes);
  const malformed = run(["--unexpected"]);
  assert.equal(malformed.status, 1);
  assert.equal(JSON.parse(malformed.stdout).issues[0].code, "invalid_input");
});

test("unknown source provenance is explicit and does not prevent executing current acceptance checks", async (t) => {
  const f = await fixture(t);
  f.snapshot.manifest[0].freshness = "unknown";
  f.report.entries[0].sourceVersions[0].freshness = "unknown";
  const assessment = await f.verify({ ...f, runChecks: true });
  assert.equal(assessment.overall, "verified");
  assert.ok(assessment.entries[0].issues.some((item) => item.code === "unknown_freshness" && item.severity === "warning"));
});

test("cyclic task dependencies verify together and propagate actual failure", async (t) => {
  const f = await fixture(t);
  const secondTask = structuredClone(f.snapshot.tasks[0]);
  secondTask.id = "implement:return";
  secondTask.acceptanceCriteria = secondTask.acceptanceCriteria.map((criterion) => ({ ...criterion, id: "second:" + criterion.id }));
  secondTask.dependsOnTaskIds = [f.snapshot.tasks[0].id];
  f.snapshot.tasks[0].dependsOnTaskIds = [secondTask.id];
  f.snapshot.tasks.push(secondTask);
  const secondEntry = structuredClone(f.report.entries[0]);
  secondEntry.taskId = secondTask.id;
  secondEntry.testRefs[0].criterionIds = secondTask.acceptanceCriteria.map((criterion) => criterion.id);
  secondEntry.checks[1].criterionIds = secondEntry.testRefs[0].criterionIds;
  f.report.entries.push(secondEntry);
  assert.equal((await f.verify({ ...f, runChecks: true })).overall, "verified");
  secondEntry.checks[0].args = ["-e", "process.exit(1)"];
  const failed = await f.verify({ ...f, runChecks: true });
  assert.equal(failed.overall, "failed");
  assert.deepEqual(failed.entries.map((entry) => entry.status), ["incomplete", "failed"]);
});

test("CLI invalidates otherwise passing execution when its snapshot changes", async (t) => {
  const f = await fixture(t);
  f.report.entries[0].checks[0].args = ["-e", "require('node:fs').appendFileSync('.uml-implementation-context.json', ' ')"];
  await writeFile(path.join(f.root, ".uml-implementation-context.json"), JSON.stringify(compactImplementationSnapshot(f.snapshot)));
  await writeFile(path.join(f.root, ".uml-implementation.json"), JSON.stringify(compactImplementationReport(f.report)));
  const execution = spawnSync(process.execPath, [f.verifierPath, "--root", f.root, "--run-checks"], { encoding: "utf8", windowsHide: true });
  assert.equal(execution.status, 1);
  const assessment = JSON.parse(execution.stdout);
  assert.equal(assessment.overall, "stale");
  assert.ok(codes(assessment).includes("stale_inputs"));
});

test("recognizable TAP with no passing tests cannot claim behavior verification", async (t) => {
  const f = await fixture(t);
  f.report.entries[0].checks[1].args = ["--test", "--test-reporter=tap", "--test-name-pattern=never_matches_any_fixture", "tests/loan.test.mjs"];
  const assessment = await f.verify({ ...f, runChecks: true });
  assert.equal(assessment.overall, "failed", JSON.stringify(assessment));
  assert.match(assessment.entries[0].checks[1].error ?? "", /no passing tests/);
});

test("per-command limits support longer builds while diagnostic summaries remain byte-bounded", async (t) => {
  const f = await fixture(t);
  const check = f.report.entries[0].checks[0];
  check.timeoutMs = 600000;
  check.maxOutputBytes = 4194304;
  check.args = ["-e", "process.stdout.write('借'.repeat(30000)); process.stderr.write('阅'.repeat(30000));"];
  const assessment = await f.verify({ ...f, runChecks: true });
  assert.equal(assessment.overall, "verified");
  assert.equal(assessment.entries[0].checks[0].timeoutMs, 600000);
  assert.equal(assessment.entries[0].checks[0].maxOutputBytes, 4194304);
  assert.ok(Buffer.byteLength(assessment.entries[0].checks[0].stdout, "utf8") <= 65536);
  assert.ok(Buffer.byteLength(assessment.entries[0].checks[0].stderr, "utf8") <= 65536);
  assert.ok(assessment.entries[0].checks[0].stdout.length > 20000);
  assert.equal(assessment.entries[0].checks[1].timeoutMs, 30000);
  assert.equal(assessment.entries[0].checks[1].maxOutputBytes, 65536);
});

test("configured execution deadline and output limit are enforced", async (t) => {
  await t.test("timeout", async (child) => {
    const f = await fixture(child);
    f.report.entries[0].checks[0].timeoutMs = 1000;
    f.report.entries[0].checks[0].args = ["-e", "setTimeout(() => {}, 5000)"];
    const assessment = await f.verify({ ...f, runChecks: true });
    assert.equal(assessment.overall, "failed");
    assert.match(assessment.entries[0].checks[0].error ?? "", /ETIMEDOUT/);
  });
  await t.test("buffer", async (child) => {
    const f = await fixture(child);
    f.report.entries[0].checks[0].maxOutputBytes = 1024;
    f.report.entries[0].checks[0].args = ["-e", "process.stdout.write('x'.repeat(50000))"];
    const assessment = await f.verify({ ...f, runChecks: true });
    assert.equal(assessment.overall, "failed");
    assert.match(assessment.entries[0].checks[0].error ?? "", /ENOBUFS/);
  });
});

test("out-of-range or non-integer command limits are rejected before executing any commands", async (t) => {
  const f = await fixture(t);
  for (const [field, invalid] of [
    ["timeoutMs", 999], ["timeoutMs", 600001], ["timeoutMs", 1000.5], ["timeoutMs", "30000"], ["timeoutMs", null],
    ["maxOutputBytes", 1023], ["maxOutputBytes", 4194305], ["maxOutputBytes", 1024.5], ["maxOutputBytes", "65536"], ["maxOutputBytes", null],
  ] as const) {
    const report = structuredClone(f.report);
    Object.assign(report.entries[0].checks[0], { [field]: invalid });
    const assessment = await f.verify({ ...f, report, runChecks: true });
    assert.equal(assessment.overall, "incomplete", field + "=" + invalid);
    assert.equal(assessment.verificationAuthority, "not-executed");
    assert.ok(codes(assessment).includes("invalid_report"));
  }
});
