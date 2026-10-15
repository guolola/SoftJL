// Builds admin-facing run summaries and generation metrics from stored run records.
import type { RunRecord } from "./run-record-store.js";

export type AdminRunTaskType =
  | "requirements_to_uml"
  | "design_modeling"
  | "document_generation"
  | "feasibility_analysis"
  | "unknown";

export type GenerationTaskType = Exclude<AdminRunTaskType, "unknown">;

export type GenerationBreakdownRow = {
  taskType: GenerationTaskType;
  label: string;
  generatedCount: number;
  successRate: string;
  failureRate: string;
  averageDuration: string;
  averageDurationMs: number | null;
  modelCallCount: number;
  artifactSummary: string;
  artifactCounts: Array<{ label: string; value: number }>;
  sampleCount: number;
  successfulCount: number;
  failedCount: number;
  recentRuns: Array<{
    id: string;
    status: RunRecord["snapshot"]["status"];
    createdAt: string | null;
    durationMs: number | null;
    artifactSummary: string;
  }>;
};

export const GENERATION_TASKS: Array<{ taskType: GenerationTaskType; label: string }> = [
  { taskType: "requirements_to_uml", label: "需求建模" },
  { taskType: "design_modeling", label: "设计建模" },
  { taskType: "document_generation", label: "说明书生成" },
  { taskType: "feasibility_analysis", label: "可行性分析" },
];

const GENERATION_TASK_TYPE_SET = new Set<AdminRunTaskType>(
  GENERATION_TASKS.map((item) => item.taskType),
);

export type AdminRunArtifactSummary = {
  title: string;
  description: string;
  metrics: Array<{ label: string; value: string | number }>;
  artifacts: Array<{ label: string; count: number; detail?: string }>;
  notes: string[];
};

export type AdminRunArtifactItem = {
  id: string;
  type: string;
  title: string;
  diagramKind?: string;
  modelId?: string;
  sourceLength?: number;
  renderMeta?: unknown;
  previewAvailable: boolean;
  previewState?: "ready" | "renderable" | "unavailable" | "failed";
  previewError?: string;
  preview?: {
    kind: "svg";
    svg: string;
    renderMeta?: unknown;
  };
  meta?: Record<string, string | number | boolean | null>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function objectKeyCount(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

export function snapshotErrorMessage(snapshot: RunRecord["snapshot"]) {
  const source = asRecord(snapshot);
  const error = asRecord(source.error);
  return typeof error.message === "string"
    ? error.message
    : typeof source.errorMessage === "string"
      ? source.errorMessage
      : null;
}

function artifactIdPart(value: unknown) {
  return String(value ?? "item")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "item";
}

function diagramKindLabel(kind: unknown) {
  if (kind === "usecase") return "用例模型";
  if (kind === "class") return "领域概念模型";
  if (kind === "activity") return "总体业务流程";
  if (kind === "deployment") return "部署需求模型";
  if (kind === "prototype") return "原型界面关系";
  if (kind === "analysis") return "需求分析模型";
  if (kind === "sequence") return "用例实现设计";
  if (kind === "table") return "数据库设计";
  return typeof kind === "string" && kind.trim() ? kind : "模型图";
}

function stringOrNumber(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

export function readProviderModel(snapshot: RunRecord["snapshot"]) {
  const settings = asRecord(asRecord(snapshot).providerSettings);
  return typeof settings.model === "string" && settings.model.trim()
    ? settings.model
    : null;
}

export function readProviderConfigId(snapshot: RunRecord["snapshot"]) {
  const settings = asRecord(asRecord(snapshot).providerSettings);
  return typeof settings.providerConfigId === "string" && settings.providerConfigId.trim()
    ? settings.providerConfigId
    : null;
}

export function taskTypeForSnapshot(snapshot: RunRecord["snapshot"]): AdminRunTaskType {
  if ("selectedArtifacts" in snapshot) return "feasibility_analysis";
  if ("documentKind" in snapshot) return "document_generation";
  
  if ("designModelTraceability" in snapshot) return "design_modeling";
  if ("models" in snapshot || "plantUml" in snapshot || "svgArtifacts" in snapshot) {
    return "requirements_to_uml";
  }
  return "unknown";
}

function documentKindLabel(kind: unknown) {
  if (kind === "requirementsSpec") return "需求规格说明书";
  if (kind === "softwareDesignSpec") return "软件设计说明书";
  return "文档";
}

function formatBytes(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "未记录";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function buildRunArtifactSummary(snapshot: RunRecord["snapshot"]): AdminRunArtifactSummary {
  const source = asRecord(snapshot);
  const taskType = taskTypeForSnapshot(snapshot);
  if (taskType === "document_generation") {
    return {
      title: "文档生成结果",
      description: `${documentKindLabel(source.documentKind)}${typeof source.fileName === "string" ? `：${source.fileName}` : ""}`,
      metrics: [
        { label: "文档类型", value: documentKindLabel(source.documentKind) },
        { label: "文件大小", value: formatBytes(source.byteLength) },
        { label: "章节数", value: arrayLength(source.sections) },
        { label: "缺失产物", value: arrayLength(source.missingArtifacts) },
      ],
      artifacts: [
        { label: "DOCX 文档", count: source.documentId ? 1 : 0, detail: typeof source.fileName === "string" ? source.fileName : undefined },
      ],
      notes: [
        source.documentId ? `文档 ID：${source.documentId}` : "后台未返回文档 ID",
        arrayLength(source.missingArtifacts) > 0
          ? `缺失产物：${(source.missingArtifacts as string[]).join("、")}`
          : "未发现缺失产物",
      ],
    };
  }

  

  if (taskType === "design_modeling") {
    return {
      title: "设计建模生成结果",
      description: "从需求模型生成设计模型、设计 PlantUML 和设计 SVG。",
      metrics: [
        { label: "设计模型", value: arrayLength(source.models) },
        { label: "设计 PlantUML", value: arrayLength(source.plantUml) },
        { label: "设计 SVG", value: arrayLength(source.svgArtifacts) },
        { label: "关联需求模型", value: arrayLength(source.requirementModels) },
      ],
      artifacts: [
        { label: "设计模型", count: arrayLength(source.models) },
        { label: "PlantUML", count: arrayLength(source.plantUml) },
        { label: "SVG/PNG", count: arrayLength(source.svgArtifacts) },
      ],
      notes: [
        arrayLength(source.requestedDiagrams) > 0
          ? `请求图类型：${(source.requestedDiagrams as string[]).join("、")}`
          : "后台未返回请求图类型",
        objectKeyCount(source.diagramErrors) > 0 ? "存在图生成错误" : "未发现图生成错误",
      ],
    };
  }

  return {
    title: "需求建模生成结果",
    description: "从需求文本生成 UML 模型、PlantUML 和 SVG/PNG。",
    metrics: [
      { label: "需求长度", value: typeof source.requirementText === "string" ? source.requirementText.length : typeof source.summaryRequirementTextLength === "number" ? source.summaryRequirementTextLength : "未记录" },
      { label: "模型", value: arrayLength(source.models) },
      { label: "PlantUML", value: arrayLength(source.plantUml) },
      { label: "SVG/PNG", value: arrayLength(source.svgArtifacts) },
    ],
    artifacts: [
      { label: "UML 模型", count: arrayLength(source.models) },
      { label: "PlantUML", count: arrayLength(source.plantUml) },
      { label: "SVG/PNG", count: arrayLength(source.svgArtifacts) },
    ],
    notes: [
      source.coverageMatrix ? "已生成覆盖矩阵" : "未返回覆盖矩阵",
      source.traceabilityMatrix ? "已生成追踪矩阵" : "未返回追踪矩阵",
      objectKeyCount(source.diagramErrors) > 0 ? "存在图生成错误" : "未发现图生成错误",
    ],
  };
}

export function buildRunArtifactItems(
  snapshot: RunRecord["snapshot"],
  options: { includePreviews?: boolean } = {},
): AdminRunArtifactItem[] {
  const runId = snapshot.runId;
  const source = asRecord(snapshot);
  const taskType = taskTypeForSnapshot(snapshot);
  const items: AdminRunArtifactItem[] = [];
  const add = (item: Omit<AdminRunArtifactItem, "id"> & { key: string | number }) => {
    const { key, ...rest } = item;
    items.push({ id: `${runId}:${artifactIdPart(rest.type)}:${artifactIdPart(key)}`, ...rest });
  };

  for (const [index, rule] of (Array.isArray(source.rules) ? source.rules : []).entries()) {
    const record = asRecord(rule);
    add({
      key: stringOrNumber(record.id) ?? index,
      type: "需求规则",
      title: typeof record.text === "string" ? record.text : `需求规则 ${index + 1}`,
      previewAvailable: false,
    });
  }

  type DiagramArtifact = Omit<AdminRunArtifactItem, "id" | "previewAvailable"> & {
    key: string;
    previewAvailable?: boolean;
  };
  const diagrams = new Map<string, DiagramArtifact>();
  const diagramKey = (record: Record<string, unknown>, index: number) => {
    const diagramKind = typeof record.diagramKind === "string" ? record.diagramKind : "diagram";
    return String(stringOrNumber(record.modelId) ?? stringOrNumber(record.id) ?? `${diagramKind}:${index}`);
  };
  const mergeDiagram = (key: string, value: Partial<DiagramArtifact>) => {
    const existing = diagrams.get(key);
    diagrams.set(key, {
      key,
      type: existing?.type ?? (taskType === "design_modeling" ? "设计模型" : "UML 模型"),
      title: existing?.title ?? "模型图",
      ...existing,
      ...value,
    });
  };

  for (const [index, model] of (Array.isArray(source.models) ? source.models : []).entries()) {
    const record = asRecord(model);
    const diagramKind = typeof record.diagramKind === "string" ? record.diagramKind : undefined;
    const type = taskType === "design_modeling" ? "设计模型" : "UML 模型";
    const modelId = typeof record.modelId === "string"
      ? record.modelId
      : typeof record.id === "string"
        ? record.id
        : undefined;
    mergeDiagram(diagramKey(record, index), {
      type,
      title: typeof record.title === "string" ? record.title : `${diagramKindLabel(diagramKind)}模型`,
      diagramKind,
      modelId,
    });
  }

  for (const [index, artifact] of (Array.isArray(source.plantUml) ? source.plantUml : []).entries()) {
    const record = asRecord(artifact);
    const diagramKind = typeof record.diagramKind === "string" ? record.diagramKind : undefined;
    const modelId = typeof record.modelId === "string" ? record.modelId : undefined;
    const plantUmlSource = typeof record.source === "string" ? record.source : "";
    mergeDiagram(diagramKey(record, index), {
      title: diagrams.get(diagramKey(record, index))?.title ?? `${diagramKindLabel(diagramKind)}模型图`,
      diagramKind,
      modelId,
      sourceLength: plantUmlSource.length || (typeof record.summarySourceLength === "number" ? record.summarySourceLength : undefined),
    });
  }

  for (const [index, artifact] of (Array.isArray(source.svgArtifacts) ? source.svgArtifacts : []).entries()) {
    const record = asRecord(artifact);
    const diagramKind = typeof record.diagramKind === "string" ? record.diagramKind : undefined;
    const modelId = typeof record.modelId === "string" ? record.modelId : undefined;
    const svg = typeof record.svg === "string" ? record.svg : "";
    const renderMeta = record.renderMeta;
    mergeDiagram(diagramKey(record, index), {
      title: diagrams.get(diagramKey(record, index))?.title ?? `${diagramKindLabel(diagramKind)}模型图`,
      diagramKind,
      modelId,
      renderMeta,
      previewAvailable: Boolean(svg) || record.summaryPreviewAvailable === true,
      preview: options.includePreviews && svg
        ? { kind: "svg", svg, renderMeta }
        : undefined,
    });
  }

  for (const diagram of diagrams.values()) {
    const { key, ...item } = diagram;
    add({
      key,
      ...item,
      previewAvailable: Boolean(item.previewAvailable),
      previewState: item.previewAvailable
        ? "ready"
        : item.sourceLength
          ? "renderable"
          : "unavailable",
    });
  }

  if (source.coverageMatrix) {
    add({
      key: "coverage",
      type: "覆盖矩阵",
      title: "覆盖矩阵",
      previewAvailable: false,
    });
  }
  if (source.traceabilityMatrix) {
    const matrix = asRecord(source.traceabilityMatrix);
    add({
      key: "traceability",
      type: "追踪矩阵",
      title: "追踪矩阵",
      previewAvailable: false,
      meta: {
        links: typeof matrix.summaryLinkCount === "number" ? matrix.summaryLinkCount : arrayLength(matrix.links),
        diagnostics: typeof matrix.summaryDiagnosticCount === "number" ? matrix.summaryDiagnosticCount : arrayLength(matrix.diagnostics),
      },
    });
  }

  const files = asRecord(source.files);
  for (const [path, content] of Object.entries(files)) {
    add({
      key: path,
      type: "代码文件",
      title: path,
      sourceLength: typeof content === "string" ? content.length : undefined,
      previewAvailable: false,
    });
  }
  if (source.businessLogic) {
    add({ key: "business-logic", type: "业务逻辑", title: "业务逻辑摘要", previewAvailable: false });
  }
  for (const [index, diagnostic] of (Array.isArray(source.qualityDiagnostics) ? source.qualityDiagnostics : Array.isArray(source.diagnostics) ? source.diagnostics : []).entries()) {
    const record = asRecord(diagnostic);
    add({
      key: stringOrNumber(record.id) ?? index,
      type: "质量检查",
      title: typeof record.message === "string" ? record.message : `质量检查 ${index + 1}`,
      previewAvailable: false,
    });
  }
  if (source.documentId || source.fileName) {
    add({
      key: stringOrNumber(source.documentId) ?? stringOrNumber(source.fileName) ?? "document",
      type: "DOCX 文档",
      title: typeof source.fileName === "string" ? source.fileName : documentKindLabel(source.documentKind),
      previewAvailable: false,
      meta: {
        documentId: typeof source.documentId === "string" ? source.documentId : null,
        size: typeof source.byteLength === "number" ? source.byteLength : null,
      },
    });
  }

  return items;
}

export function calculateDurationMs(createdAt?: string, completedAt?: string) {
  if (!createdAt || !completedAt) return null;
  const start = new Date(createdAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

function timestampMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function shanghaiDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shanghaiDayWindow(dateText: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }
  const startMs = Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
  const today = shanghaiDateString(now);
  if (dateText > today) return null;
  const nextStartMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: dateText === today ? now.toISOString() : new Date(nextStartMs).toISOString(),
  };
}

export function isInWindow(value: unknown, window: { startIso: string; endIso: string }) {
  const time = timestampMs(value);
  if (time === null) return false;
  return time >= new Date(window.startIso).getTime() && time < new Date(window.endIso).getTime();
}

export function percentage(count: number, total: number) {
  return total > 0 ? `${Math.round((count / total) * 100)}%` : "0%";
}

function formatDuration(valueMs: number | null) {
  if (valueMs === null) return "暂无数据";
  if (valueMs < 1000) return `${valueMs}ms`;
  if (valueMs < 60_000) {
    return `${(valueMs / 1000).toFixed(valueMs < 10_000 ? 1 : 0)}秒`;
  }
  if (valueMs < 60 * 60_000) return `${(valueMs / 60_000).toFixed(1)}分钟`;
  return `${(valueMs / 3_600_000).toFixed(1)}小时`;
}

export function averageDuration(records: RunRecord[]) {
  const durations = records
    .map((record) => calculateDurationMs(record.metadata?.createdAt, record.metadata?.completedAt))
    .filter((duration): duration is number => duration !== null);
  if (durations.length === 0) return { label: "暂无数据", valueMs: null };
  const valueMs = Math.round(
    durations.reduce((total, duration) => total + duration, 0) / durations.length,
  );
  return { label: formatDuration(valueMs), valueMs };
}

export function isGenerationTaskType(value: AdminRunTaskType): value is GenerationTaskType {
  return GENERATION_TASK_TYPE_SET.has(value);
}

function artifactCountSummary(counts: Array<{ label: string; value: number }>) {
  const visible = counts.filter((item) => item.value > 0);
  if (visible.length === 0) return "暂无所选日期产物";
  return visible.map((item) => `${item.label} ${item.value}`).join(" · ");
}

function readMetricDocumentKind(value: unknown) {
  return value === "requirementsSpec" || value === "softwareDesignSpec" || value === "feasibilityStudy"
    ? value
    : null;
}

function documentArtifactCounts(
  completedDocumentRuns: RunRecord[],
  todayDocuments: Array<Record<string, unknown>>,
) {
  const counts = {
    requirementsSpec: 0,
    softwareDesignSpec: 0,
    feasibilityStudy: 0,
  };
  const documentSourceRunIds = new Set<string>();
  for (const document of todayDocuments) {
    const kind = readMetricDocumentKind(document.documentKind);
    if (kind) counts[kind] += 1;
    if (typeof document.sourceRunId === "string") {
      documentSourceRunIds.add(document.sourceRunId);
    }
  }
  for (const record of completedDocumentRuns) {
    const source = asRecord(record.snapshot);
    if (!source.documentId || documentSourceRunIds.has(record.snapshot.runId)) continue;
    const kind = readMetricDocumentKind(source.documentKind);
    if (kind) counts[kind] += 1;
  }
  return [
    { label: "需求规格说明书", value: counts.requirementsSpec },
    { label: "软件设计说明书", value: counts.softwareDesignSpec },
    { label: "可行性研究报告", value: counts.feasibilityStudy },
  ];
}

export function artifactCountsForTask(
  taskType: GenerationTaskType,
  completedRecords: RunRecord[],
  todayDocuments: Array<Record<string, unknown>>,
) {
  if (taskType === "requirements_to_uml") {
    return [
      { label: "规则", value: completedRecords.reduce((total, record) => total + arrayLength(asRecord(record.snapshot).rules), 0) },
      { label: "需求模型", value: completedRecords.reduce((total, record) => total + arrayLength(asRecord(record.snapshot).models), 0) },
    ];
  }
  if (taskType === "design_modeling") {
    return [
      { label: "设计模型", value: completedRecords.reduce((total, record) => total + arrayLength(asRecord(record.snapshot).models), 0) },
    ];
  }
  if (taskType === "document_generation") {
    return documentArtifactCounts(completedRecords, todayDocuments);
  }
  return [
    {
      label: "代码文件",
      value: completedRecords.reduce(
        (total, record) => total + Object.keys(asRecord(asRecord(record.snapshot).files)).length,
        0,
      ),
    },
  ];
}

export function buildGenerationBreakdown(
  todayRecords: RunRecord[],
  modelUsageByTask: Map<GenerationTaskType, number>,
  todayDocuments: Array<Record<string, unknown>>,
): GenerationBreakdownRow[] {
  return GENERATION_TASKS.map(({ taskType, label }) => {
    const records = todayRecords.filter((record) => taskTypeForSnapshot(record.snapshot) === taskType);
    const completedRecords = records.filter((record) => record.snapshot.status === "completed");
    const failedRecords = records.filter((record) => record.snapshot.status === "failed");
    const duration = averageDuration(
      records.filter((record) => record.terminal || record.metadata?.completedAt),
    );
    const artifactCounts = artifactCountsForTask(taskType, completedRecords, todayDocuments);
    return {
      taskType,
      label,
      generatedCount: records.length,
      successRate: percentage(completedRecords.length, records.length),
      failureRate: percentage(failedRecords.length, records.length),
      averageDuration: duration.label,
      averageDurationMs: duration.valueMs,
      modelCallCount: modelUsageByTask.get(taskType) ?? 0,
      artifactSummary: artifactCountSummary(artifactCounts),
      artifactCounts,
      sampleCount: records.length,
      successfulCount: completedRecords.length,
      failedCount: failedRecords.length,
      recentRuns: records
        .slice()
        .sort((left, right) =>
          (right.metadata?.createdAt ?? "").localeCompare(left.metadata?.createdAt ?? ""),
        )
        .slice(0, 5)
        .map((record) => ({
          id: record.snapshot.runId,
          status: record.snapshot.status,
          createdAt: record.metadata?.createdAt ?? null,
          durationMs: calculateDurationMs(record.metadata?.createdAt, record.metadata?.completedAt),
          artifactSummary: buildRunArtifactSummary(record.snapshot).title,
        })),
    };
  });
}
