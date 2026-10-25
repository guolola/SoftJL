import assert from "node:assert/strict";
import test from "node:test";
import { runSnapshotSchema, type RunSnapshot } from "@uml-platform/contracts";
import { assertProviderConfig, calculatePassMetrics, createEvaluationImport, loadFixtures, renderMarkdownReport, runEval, type EvalCaseResult } from "./index.js";

test("harness reports missing provider configuration outside mock mode", () => {
  assert.throws(
    () => assertProviderConfig({}),
    /UML_EVAL_PROJECT_ID.*UML_EVAL_PROVIDER_CONFIG_ID.*UML_EVAL_MODEL.*UML_EVAL_SESSION_COOKIE/,
  );
});

test("harness loads baseline and A/B/C retest fixtures", async () => {
  const fixtures = await loadFixtures();
  assert.equal(fixtures.length, 6);
  assert.match(fixtures[0].requirementText, /订单管理系统/);
  assert.equal(
    fixtures.some(
      (fixture) =>
        fixture.id === "04-retest-a-boundary-full-chain" &&
        fixture.expectedFacts.length > 0,
    ),
    true,
  );
});

test("API evaluation extracts and publishes a baseline before modeling with managed credentials", async (t) => {
  const requests: Array<{ path: string; body: Record<string, unknown> | undefined }> = [];
  const runs = new Map<string, RunSnapshot>();
  const projectId = "evaluation-project";
  let extractedRunId = "";
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    assert.equal(new Headers(init?.headers).get("Cookie"), "uml_session=test-session");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    requests.push({ path, body });
    if (path === "/api/projects") {
      assert.equal(body?.projectMode, "professional");
      return Response.json({ project: { id: projectId } });
    }
    if (path === "/api/runs") {
      assert.equal(body?.projectId, projectId);
      assert.deepEqual(body?.providerSettings, { providerConfigId: "managed-provider", model: "current-model" });
      const selectedDiagrams = body?.selectedDiagrams as RunSnapshot["selectedDiagrams"];
      const extraction = selectedDiagrams.length === 0;
      if (!extraction) {
        assert.equal("requirementText" in body!, false);
        assert.equal(requests.at(-2)?.path, `/api/projects/${projectId}/workspace`);
      }
      const runId = `run-${requests.length}`;
      if (extraction) extractedRunId = runId;
      runs.set(runId, runSnapshotSchema.parse({
        runId, operationType: extraction ? "requirement_extraction" : "requirement_modeling", outputManifest: [],
        requirementText: extraction ? body?.requirementText : "当前已发布需求", selectedDiagrams,
        rules: [], models: [], requirementModelTraceability: [], plantUml: [], svgArtifacts: [],
        currentStage: null, status: "completed", error: null,
      }));
      return Response.json({ runId }, { status: 202 });
    }
    if (path.endsWith("/workspace")) return Response.json({ sourceRunId: extractedRunId });
    const snapshot = runs.get(path.split("/").at(-1)!);
    assert.ok(snapshot, `Unexpected request: ${path}`);
    return Response.json(snapshot);
  });
  const report = await runEval({ UML_EVAL_API_BASE_URL: "http://evaluation.test", UML_EVAL_PROVIDER_CONFIG_ID: "managed-provider", UML_EVAL_PROJECT_ID: projectId, UML_EVAL_SESSION_COOKIE: "uml_session=test-session", UML_EVAL_MODEL: "current-model", UML_EVAL_ATTEMPTS: "1" });
  assert.equal(report.totals.completed, 6);
  assert.equal(requests.some(({ path }) => path === "/api/projects"), false);
  assert.equal(requests.filter(({ path }) => path === "/api/runs").length, 12);
});

test("API evaluation treats cancelled extraction as terminal without starting modeling", async (t) => {
  let starts = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/projects") return Response.json({ project: { id: "project" } });
    if (path === "/api/runs") { starts++; return Response.json({ runId: "cancelled" }); }
    return Response.json(runSnapshotSchema.parse({
      runId: "cancelled", operationType: "requirement_extraction", outputManifest: [],
      requirementText: "输入需求", selectedDiagrams: [], rules: [], models: [],
      requirementModelTraceability: [], plantUml: [], svgArtifacts: [], currentStage: null,
      status: "cancelled", error: null,
    }));
  });
  const report = await runEval({ UML_EVAL_PROVIDER_CONFIG_ID: "managed", UML_EVAL_PROJECT_ID: "evaluation-project", UML_EVAL_SESSION_COOKIE: "uml_session=session", UML_EVAL_MODEL: "model", UML_EVAL_ATTEMPTS: "1" });
  assert.equal(starts, 6);
  assert.equal(report.results.every(result => result.status === "cancelled"), true);
});

test("harness mock mode produces json and markdown reports", async () => {
  const report = await runEval({ UML_EVAL_MOCK: "1", UML_EVAL_ATTEMPTS: "5" });
  assert.equal(report.mode, "mock");
  assert.equal(report.totals.cases, 30);
  assert.equal(report.totals.completed, 30);
  assert.equal(report.totals.svgSuccessCount, 120);
  assert.equal(report.passMetrics.passAt1, 1);
  assert.equal(report.passMetrics.passAtK, 1);
  assert.equal(report.passMetrics.passPowerK, 1);
  assert.equal(report.passMetrics.bestAtK, 100);
  assert.equal(report.totals.semanticAccuracyRate, 1);
  assert.equal("harmfulRepairCount" in report.totals, false);
  assert.equal(report.totals.terminalInconsistencyCount, 0);
  assert.match(renderMarkdownReport(report), /UML 生成质量评测报告/);
  assert.match(renderMarkdownReport(report), /关键语义准确率: 100\.0%/);
  const imported = createEvaluationImport(report, "ci-123");
  assert.equal(imported.attempts.length, 30);
  assert.equal(imported.attempts[0]?.id.startsWith("ci-123:"), true);
  assert.equal(JSON.stringify(imported).includes("requirementText"), false);
});

test("Pass metrics distinguish at-1, at-k, power-k, and best-k", () => {
  const base = {
    taskType: "requirements_to_uml", status: "completed", rulesCount: 1, modelsCount: 1,
    svgSuccessCount: 1, diagramErrorCount: 0, durationMs: 1, errorMessage: null,
    semanticFactsTotal: 1, semanticFactsPreserved: 1, semanticAccuracyRate: 1,
    unfoundedAdditionCount: 0, effectiveTraceCovered: 1,
    effectiveTraceTotal: 1, effectiveTraceCoverageRate: 1, terminalStateConsistent: true,

  } satisfies Omit<EvalCaseResult, "fixtureId" | "attempt" | "qualityScore" | "automaticVerdict">;
  const results: EvalCaseResult[] = [
    { ...base, fixtureId: "a", attempt: 1, qualityScore: 40, automaticVerdict: "fail" },
    { ...base, fixtureId: "a", attempt: 2, qualityScore: 90, automaticVerdict: "pass" },
    { ...base, fixtureId: "b", attempt: 1, qualityScore: 80, automaticVerdict: "pass" },
    { ...base, fixtureId: "b", attempt: 2, qualityScore: 85, automaticVerdict: "pass" },
  ];
  assert.deepEqual(calculatePassMetrics(results, 2), {
    fixtureCount: 2, attemptCount: 4, k: 2, passAt1: 0.5, passAtK: 1,
    passPowerK: 0.5, bestAtK: 87.5,
  });
});
