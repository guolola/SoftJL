import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import {
  extractProtectedRequirementFacts,
  unsupportedRequirementFacts,
  type AtomicRequirement,
  type DiagramKind,
  type RunSnapshot,
} from "@uml-platform/contracts";

export interface EvalFixture {
  id: string;
  taskType: "requirements_to_uml";
  requirementText: string;
  selectedDiagrams: DiagramKind[];
  expectedFacts: string[];
}

export interface EvalCaseResult {
  fixtureId: string;
  taskType: "requirements_to_uml";
  attempt: number;
  status: RunSnapshot["status"] | "configuration_error";
  rulesCount: number;
  modelsCount: number;
  svgSuccessCount: number;
  diagramErrorCount: number;
  durationMs: number;
  errorMessage: string | null;
  semanticFactsTotal: number;
  semanticFactsPreserved: number;
  semanticAccuracyRate: number | null;
  harmfulRepairCount: number;
  unfoundedAdditionCount: number;
  effectiveTraceCovered: number;
  effectiveTraceTotal: number;
  effectiveTraceCoverageRate: number | null;
  terminalStateConsistent: boolean;
  prototypeBuildPassed: boolean | null;
  documentUsable: boolean | null;
  qualityScore: number;
  automaticVerdict: "pass" | "fail";
}

export interface EvalPassMetrics {
  fixtureCount: number;
  attemptCount: number;
  k: number;
  passAt1: number | null;
  passAtK: number | null;
  passPowerK: number | null;
  bestAtK: number | null;
}

export interface EvalReport {
  suiteVersion: string;
  evaluatorVersion: string;
  generatedAt: string;
  mode: "mock" | "api";
  model: string;
  strategyId: string;
  strategyVersion: string;
  attemptsPerFixture: number;
  budgetDimension: "wall_clock_ms" | "tokens" | "model_calls" | null;
  budgetValue: number | null;
  passMetrics: EvalPassMetrics;
  totals: {
    cases: number;
    completed: number;
    failed: number;
    svgSuccessCount: number;
    diagramErrorCount: number;
    durationMs: number;
    semanticFactsTotal: number;
    semanticFactsPreserved: number;
    semanticAccuracyRate: number | null;
    harmfulRepairCount: number;
    unfoundedAdditionCount: number;
    effectiveTraceCovered: number;
    effectiveTraceTotal: number;
    effectiveTraceCoverageRate: number | null;
    terminalInconsistencyCount: number;
  };
  results: EvalCaseResult[];
}

const DEFAULT_DIAGRAMS: DiagramKind[] = [
  "usecase",
  "class",
  "activity",
  "deployment",
];

const RETEST_EXPECTED_FACTS: Record<string, string[]> = {
  "04-retest-a-boundary-full-chain": [
    "参会人数50人以上或结束时间晚于21:00时必须进入部门审批。",
    "单次预约时长不得少于30分钟且不得超过240分钟。",
    "通知发送失败最多自动重试3次，仍失败时不得回滚业务结果。",
    "在300个并发用户下，95百分位响应时间不得超过2秒。",
  ],
  "05-retest-b-conflict-repair": [
    "报销总额达到5000元以上时必须审批。",
    "报销总额超过5000元时必须审批。",
    "所有费用在30个自然日内提交，差旅费用在60个自然日内提交。",
    "任何审批人不得审批自己提交的报销单。",
    "100元以内包含正好100元。",
  ],
  "06-retest-c-autocomplete-recovery": [
    "危险等级为3级的设备必须先由指导教师批准，再由安全员批准。",
    "指导教师不得审批自己提交的预约。",
    "通知失败时业务状态不回滚。",
    "在100个并发用户下，设备检索95百分位响应时间不超过2秒。",
  ],
};

function fixtureDir() {
  return fileURLToPath(new URL("../fixtures", import.meta.url));
}

export async function loadFixtures(): Promise<EvalFixture[]> {
  const dir = fixtureDir();
  const names = (await readdir(dir)).filter((name) => name.endsWith(".txt")).sort();
  return Promise.all(
    names.map(async (name) => ({
      id: basename(name, ".txt"),
      taskType: "requirements_to_uml" as const,
      requirementText: (await readFile(join(dir, name), "utf8")).trim(),
      selectedDiagrams: DEFAULT_DIAGRAMS,
      expectedFacts: RETEST_EXPECTED_FACTS[basename(name, ".txt")] ?? [],
    })),
  );
}

export function assertProviderConfig(env: NodeJS.ProcessEnv) {
  if (env.UML_EVAL_MOCK === "1") return;
  const missing = [
    ["UML_EVAL_PROVIDER_API_BASE_URL", env.UML_EVAL_PROVIDER_API_BASE_URL],
    ["UML_EVAL_API_KEY", env.UML_EVAL_API_KEY],
    ["UML_EVAL_MODEL", env.UML_EVAL_MODEL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`缺少评测配置：${missing.join(", ")}`);
  }
}

function createMockSnapshot(fixture: EvalFixture): RunSnapshot {
  const expectedRules = fixture.expectedFacts.map((fact, index) => ({
    id: `expected-${index + 1}`,
    category: "业务规则" as const,
    text: fact,
    relatedDiagrams: ["usecase" as const],
  }));
  return {
    runId: `mock-${fixture.id}`,
    requirementText: fixture.requirementText,
    selectedDiagrams: fixture.selectedDiagrams,
    rules: expectedRules.length > 0 ? expectedRules : [
      {
        id: "r1",
        category: "功能需求",
        text: "系统应支持核心业务流程。",
        relatedDiagrams: ["usecase", "activity"],
      },
      {
        id: "r2",
        category: "数据需求",
        text: "系统应维护关键领域数据。",
        relatedDiagrams: ["class"],
      },
    ],
    models: [],
    plantUml: [],
    svgArtifacts: fixture.selectedDiagrams.map((diagramKind) => ({
      diagramKind,
      svg: `<svg><text>${diagramKind}</text></svg>`,
      renderMeta: {
        engine: "mock",
        generatedAt: new Date().toISOString(),
        sourceLength: 24,
        durationMs: 1,
      },
    })),
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
  };
}

async function runViaApi(fixture: EvalFixture, env: NodeJS.ProcessEnv) {
  const apiBaseUrl = env.UML_EVAL_API_BASE_URL ?? "http://127.0.0.1:4101";
  const start = await fetch(`${apiBaseUrl}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requirementText: fixture.requirementText,
      selectedDiagrams: fixture.selectedDiagrams,
      providerSettings: {
        apiBaseUrl: env.UML_EVAL_PROVIDER_API_BASE_URL,
        apiKey: env.UML_EVAL_API_KEY,
        model: env.UML_EVAL_MODEL,
      },
    }),
  });
  if (!start.ok) {
    throw new Error(`启动评测运行失败：HTTP ${start.status} ${await start.text()}`);
  }
  const { runId } = (await start.json()) as { runId: string };
  const deadline = Date.now() + Number(env.UML_EVAL_TIMEOUT_MS ?? 180000);

  while (Date.now() < deadline) {
    const response = await fetch(`${apiBaseUrl}/api/runs/${runId}`);
    if (!response.ok) {
      throw new Error(`读取评测运行失败：HTTP ${response.status}`);
    }
    const snapshot = (await response.json()) as RunSnapshot;
    if (snapshot.status === "completed" || snapshot.status === "failed") {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`评测运行超时：${runId}`);
}

function semanticCarrier(text: string): Pick<
  AtomicRequirement,
  "actor" | "subject" | "action" | "object" | "condition" | "outcome"
> {
  return {
    actor: null,
    subject: null,
    action: text,
    object: null,
    condition: null,
    outcome: null,
  };
}

function summarizeQuality(fixture: EvalFixture, snapshot: RunSnapshot) {
  const actualText = snapshot.requirementBaseline
    ? snapshot.requirementBaseline.requirements
        .map((requirement) =>
          [
            requirement.actor,
            requirement.subject,
            requirement.action,
            requirement.object,
            requirement.condition,
            requirement.outcome,
          ]
            .filter(Boolean)
            .join("；"),
        )
        .join("；")
    : snapshot.rules.map((rule) => rule.text).join("；");
  const expectedFacts = fixture.expectedFacts.flatMap((text) =>
    extractProtectedRequirementFacts(semanticCarrier(text)),
  );
  const uniqueExpectedFacts = Array.from(
    new Map(expectedFacts.map((fact) => [fact.key, fact])).values(),
  );
  const actualFactKeys = new Set(
    extractProtectedRequirementFacts(semanticCarrier(actualText)).map(
      (fact) => fact.key,
    ),
  );
  const semanticFactsPreserved = uniqueExpectedFacts.filter((fact) =>
    actualFactKeys.has(fact.key),
  ).length;
  const coverageRows = snapshot.coverageMatrix?.rows ?? [];
  const effectiveTraceTotal = coverageRows.filter(
    (row) => row.status !== "not-modelable",
  ).length;
  const effectiveTraceCovered = coverageRows.filter(
    (row) => row.status === "covered",
  ).length;
  const harmfulRepairCount =
    snapshot.requirementBaseline?.qualityReport.issues.filter(
      (issue) => issue.code === "semantic-loss",
    ).length ?? 0;
  const unfoundedAdditionCount = unsupportedRequirementFacts(
    fixture.requirementText,
    semanticCarrier(actualText),
  ).filter((fact) => fact.kind !== "event").length;
  const terminalStateConsistent =
    snapshot.status === "completed"
      ? (snapshot.error ?? null) === null
      : snapshot.status === "failed"
        ? (snapshot.error ?? null) !== null
        : true;
  return {
    semanticFactsTotal: uniqueExpectedFacts.length,
    semanticFactsPreserved,
    semanticAccuracyRate:
      uniqueExpectedFacts.length > 0
        ? semanticFactsPreserved / uniqueExpectedFacts.length
        : null,
    harmfulRepairCount,
    unfoundedAdditionCount,
    effectiveTraceCovered,
    effectiveTraceTotal,
    effectiveTraceCoverageRate:
      effectiveTraceTotal > 0
        ? effectiveTraceCovered / effectiveTraceTotal
        : null,
    terminalStateConsistent,
    prototypeBuildPassed: null,
    documentUsable: null,
  };
}

function summarizeSnapshot(
  fixture: EvalFixture,
  snapshot: RunSnapshot,
  durationMs: number,
  attempt: number,
): EvalCaseResult {
  const quality = summarizeQuality(fixture, snapshot);
  const semanticRate = quality.semanticAccuracyRate ?? 1;
  const traceRate = quality.effectiveTraceCoverageRate ?? 1;
  const diagramCompleteness = fixture.selectedDiagrams.length > 0
    ? Math.min(1, snapshot.svgArtifacts.length / fixture.selectedDiagrams.length)
    : 1;
  const qualityScore = Math.max(0, Math.min(100, Math.round(
    semanticRate * 40 + traceRate * 25 + diagramCompleteness * 25 +
      (quality.terminalStateConsistent ? 10 : 0),
  )));
  const hardGatesPassed = snapshot.status === "completed" &&
    quality.terminalStateConsistent && Object.keys(snapshot.diagramErrors).length === 0 &&
    snapshot.svgArtifacts.length >= fixture.selectedDiagrams.length &&
    quality.harmfulRepairCount === 0 && quality.unfoundedAdditionCount === 0;
  return {
    fixtureId: fixture.id,
    taskType: fixture.taskType,
    attempt,
    status: snapshot.status,
    rulesCount: snapshot.rules.length,
    modelsCount: snapshot.models.length,
    svgSuccessCount: snapshot.svgArtifacts.length,
    diagramErrorCount: Object.keys(snapshot.diagramErrors).length,
    durationMs,
    errorMessage: snapshot.error?.message ?? null,
    ...quality,
    qualityScore,
    automaticVerdict: hardGatesPassed && qualityScore >= 80 ? "pass" : "fail",
  };
}

export function calculatePassMetrics(results: EvalCaseResult[], configuredK = 5): EvalPassMetrics {
  const byFixture = new Map<string, EvalCaseResult[]>();
  for (const result of results) {
    byFixture.set(result.fixtureId, [...(byFixture.get(result.fixtureId) ?? []), result]);
  }
  const groups = Array.from(byFixture.values()).map((rows) =>
    rows.slice().sort((left, right) => left.attempt - right.attempt),
  );
  const k = Math.max(1, Math.min(configuredK, 100));
  const selected = (rows: EvalCaseResult[]) => rows.slice(0, k);
  const ratio = (count: number) => groups.length ? count / groups.length : null;
  return {
    fixtureCount: groups.length,
    attemptCount: results.length,
    k,
    passAt1: ratio(groups.filter((rows) => selected(rows)[0]?.automaticVerdict === "pass").length),
    passAtK: ratio(groups.filter((rows) => selected(rows).some((row) => row.automaticVerdict === "pass")).length),
    passPowerK: ratio(groups.filter((rows) => selected(rows).length === k && selected(rows).every((row) => row.automaticVerdict === "pass")).length),
    bestAtK: groups.length
      ? groups.reduce((sum, rows) => sum + Math.max(...selected(rows).map((row) => row.qualityScore)), 0) / groups.length
      : null,
  };
}

export async function runEval(env: NodeJS.ProcessEnv = process.env): Promise<EvalReport> {
  assertProviderConfig(env);
  const fixtures = await loadFixtures();
  const mode = env.UML_EVAL_MOCK === "1" ? "mock" : "api";
  const results: EvalCaseResult[] = [];
  const attemptsPerFixture = Math.max(1, Math.min(100, Number.parseInt(env.UML_EVAL_ATTEMPTS ?? "5", 10) || 5));
  const startedAt = Date.now();

  for (const fixture of fixtures) {
    for (let attempt = 1; attempt <= attemptsPerFixture; attempt += 1) {
      const caseStartedAt = Date.now();
      try {
        const snapshot =
          mode === "mock" ? createMockSnapshot(fixture) : await runViaApi(fixture, env);
        results.push(
          summarizeSnapshot(fixture, snapshot, Date.now() - caseStartedAt, attempt),
        );
      } catch (error) {
        results.push({
        fixtureId: fixture.id,
        taskType: fixture.taskType,
        attempt,
        status: "configuration_error",
        rulesCount: 0,
        modelsCount: 0,
        svgSuccessCount: 0,
        diagramErrorCount: 0,
        durationMs: Date.now() - caseStartedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
        semanticFactsTotal: 0,
        semanticFactsPreserved: 0,
        semanticAccuracyRate: null,
        harmfulRepairCount: 0,
        unfoundedAdditionCount: 0,
        effectiveTraceCovered: 0,
        effectiveTraceTotal: 0,
        effectiveTraceCoverageRate: null,
        terminalStateConsistent: false,
        prototypeBuildPassed: null,
        documentUsable: null,
        qualityScore: 0,
        automaticVerdict: "fail",
        });
      }
    }
  }

  const semanticFactsTotal = results.reduce(
    (sum, item) => sum + item.semanticFactsTotal,
    0,
  );
  const semanticFactsPreserved = results.reduce(
    (sum, item) => sum + item.semanticFactsPreserved,
    0,
  );
  const effectiveTraceTotal = results.reduce(
    (sum, item) => sum + item.effectiveTraceTotal,
    0,
  );
  const effectiveTraceCovered = results.reduce(
    (sum, item) => sum + item.effectiveTraceCovered,
    0,
  );
  const generatedAt = new Date().toISOString();
  const budgetDimension = env.UML_EVAL_BUDGET_DIMENSION === "wall_clock_ms" ||
    env.UML_EVAL_BUDGET_DIMENSION === "tokens" || env.UML_EVAL_BUDGET_DIMENSION === "model_calls"
    ? env.UML_EVAL_BUDGET_DIMENSION : null;
  const budgetValue = budgetDimension ? Number.parseInt(env.UML_EVAL_BUDGET_VALUE ?? "", 10) : null;
  return {
    suiteVersion: env.UML_EVAL_SUITE_VERSION ?? "uml-eval-v1",
    evaluatorVersion: "uml-quality-v1",
    generatedAt,
    mode,
    model: env.UML_EVAL_MODEL ?? "mock",
    strategyId: env.UML_EVAL_STRATEGY_ID ?? "single-model",
    strategyVersion: env.UML_EVAL_STRATEGY_VERSION ?? "1",
    attemptsPerFixture,
    budgetDimension,
    budgetValue: budgetValue !== null && Number.isFinite(budgetValue) ? budgetValue : null,
    passMetrics: calculatePassMetrics(results, attemptsPerFixture),
    totals: {
      cases: results.length,
      completed: results.filter((item) => item.status === "completed").length,
      failed: results.filter((item) => item.status !== "completed").length,
      svgSuccessCount: results.reduce((sum, item) => sum + item.svgSuccessCount, 0),
      diagramErrorCount: results.reduce((sum, item) => sum + item.diagramErrorCount, 0),
      durationMs: Date.now() - startedAt,
      semanticFactsTotal,
      semanticFactsPreserved,
      semanticAccuracyRate:
        semanticFactsTotal > 0 ? semanticFactsPreserved / semanticFactsTotal : null,
      harmfulRepairCount: results.reduce(
        (sum, item) => sum + item.harmfulRepairCount,
        0,
      ),
      unfoundedAdditionCount: results.reduce(
        (sum, item) => sum + item.unfoundedAdditionCount,
        0,
      ),
      effectiveTraceCovered,
      effectiveTraceTotal,
      effectiveTraceCoverageRate:
        effectiveTraceTotal > 0
          ? effectiveTraceCovered / effectiveTraceTotal
          : null,
      terminalInconsistencyCount: results.filter(
        (item) => !item.terminalStateConsistent,
      ).length,
    },
    results,
  };
}

export function renderMarkdownReport(report: EvalReport) {
  const lines: string[] = [];
  lines.push("# UML 生成质量评测报告", "");
  lines.push(`- 生成时间: ${report.generatedAt}`);
  lines.push(`- 模式: ${report.mode}`);
  lines.push(`- 模型: ${report.model}`);
  lines.push(`- 策略: ${report.strategyId}@${report.strategyVersion}`);
  lines.push(`- 每个用例独立运行: ${report.attemptsPerFixture} 次`);
  lines.push(`- Pass@1: ${report.passMetrics.passAt1 === null ? "N/A" : `${(report.passMetrics.passAt1 * 100).toFixed(1)}%`}`);
  lines.push(`- Pass@${report.passMetrics.k}: ${report.passMetrics.passAtK === null ? "N/A" : `${(report.passMetrics.passAtK * 100).toFixed(1)}%`}`);
  lines.push(`- Pass^${report.passMetrics.k}: ${report.passMetrics.passPowerK === null ? "N/A" : `${(report.passMetrics.passPowerK * 100).toFixed(1)}%`}`);
  lines.push(`- Best@${report.passMetrics.k}: ${report.passMetrics.bestAtK?.toFixed(1) ?? "N/A"}`);
  lines.push(`- 用例数: ${report.totals.cases}`);
  lines.push(`- 成功: ${report.totals.completed}`);
  lines.push(`- 失败: ${report.totals.failed}`);
  lines.push(`- SVG 成功数: ${report.totals.svgSuccessCount}`);
  lines.push(`- 单图失败数: ${report.totals.diagramErrorCount}`);
  lines.push(
    `- 关键语义准确率: ${
      report.totals.semanticAccuracyRate === null
        ? "N/A"
        : `${(report.totals.semanticAccuracyRate * 100).toFixed(1)}%`
    }`,
  );
  lines.push(`- 有害修复数: ${report.totals.harmfulRepairCount}`);
  lines.push(`- 无依据新增数: ${report.totals.unfoundedAdditionCount}`);
  lines.push(
    `- 有效追踪覆盖率: ${
      report.totals.effectiveTraceCoverageRate === null
        ? "N/A"
        : `${(report.totals.effectiveTraceCoverageRate * 100).toFixed(1)}%`
    }`,
  );
  lines.push(`- 终态矛盾数: ${report.totals.terminalInconsistencyCount}`);
  lines.push("");
  lines.push("| Fixture | Attempt | Verdict | Quality | Status | Semantics | Harmful Repairs | Unfounded | Trace | Terminal | Duration | Error |");
  lines.push("| --- | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |");
  for (const result of report.results) {
    lines.push(
      [
        result.fixtureId,
        result.attempt,
        result.automaticVerdict,
        result.qualityScore,
        result.status,
        result.semanticAccuracyRate === null
          ? "N/A"
          : `${(result.semanticAccuracyRate * 100).toFixed(1)}%`,
        result.harmfulRepairCount,
        result.unfoundedAdditionCount,
        result.effectiveTraceCoverageRate === null
          ? "N/A"
          : `${(result.effectiveTraceCoverageRate * 100).toFixed(1)}%`,
        result.terminalStateConsistent ? "一致" : "矛盾",
        `${result.durationMs}ms`,
        result.errorMessage?.replace(/\|/g, "\\|") ?? "",
      ].join(" | "),
    );
  }
  return lines.join("\n");
}

export function createEvaluationImport(report: EvalReport, importId: string) {
  return {
    importId,
    suiteVersion: report.suiteVersion,
    evaluatorVersion: report.evaluatorVersion,
    generatedAt: report.generatedAt,
    attempts: report.results.map((result) => ({
      id: `${importId}:${result.fixtureId}:${result.attempt}`,
      fixtureId: result.fixtureId,
      taskType: result.taskType,
      provider: null,
      model: report.model,
      strategyId: report.strategyId,
      strategyVersion: report.strategyVersion,
      attempt: result.attempt,
      k: report.attemptsPerFixture,
      budgetDimension: report.budgetDimension,
      budgetValue: report.budgetValue,
      qualityScore: result.qualityScore,
      automaticVerdict: result.automaticVerdict,
      durationMs: result.durationMs,
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      modelCallCount: null,
      createdAt: report.generatedAt,
    })),
  };
}

async function importEvaluationReport(report: EvalReport, env: NodeJS.ProcessEnv) {
  if (!env.UML_EVAL_INGEST_URL || !env.UML_EVAL_INGEST_TOKEN) return;
  const importId = env.UML_EVAL_IMPORT_ID ?? `${report.suiteVersion}:${report.model}:${report.generatedAt}`;
  const response = await fetch(env.UML_EVAL_INGEST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UML_EVAL_INGEST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createEvaluationImport(report, importId)),
  });
  if (!response.ok) throw new Error(`导入评测报告失败：HTTP ${response.status}`);
}

async function writeReports(report: EvalReport, outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "eval-report.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(join(outputDir, "eval-report.md"), renderMarkdownReport(report), "utf8");
}

async function main() {
  const report = await runEval();
  await importEvaluationReport(report, process.env);
  const outputDir = process.env.UML_EVAL_OUTPUT_DIR;
  if (outputDir) {
    await writeReports(report, outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.totals.failed > 0) {
    process.exitCode = 1;
  }
}

const entrypoint = fileURLToPath(import.meta.url);
if (process.argv[1] && entrypoint === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
