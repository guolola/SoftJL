// Maps project run API summaries into the shared run history item contract.
import type { RunError } from "@uml-platform/contracts";
import {
  createRunHistoryTitle,
  formatDocumentMissingArtifactSummary,
  formatRunHistoryDiagramErrorSummary,
  isDocumentRunSnapshot,
  runHistorySnapshotRequirementText,
  type RunHistoryItem,
  type RunHistoryDiagramErrorSummary,
  type RunHistorySnapshot,
} from "../../entities/run-history";

import { localizeRunFailure } from "../../shared/i18n/api-errors";

export type ProjectRunDetailResponse = {
  projectId?: string;
  run?: {
    runId?: string;
    model?: string | null;
    status?: string | null;
    stage?: string | null;
    runKind?: string | null;
    documentKind?: string | null;
    error?: RunError | null;
    errorMessage?: string | null;
    diagramErrorCount?: number | null;
    diagramErrorSummary?: RunHistoryDiagramErrorSummary[] | null;
    partialFailure?: boolean | null;
    missingArtifactCount?: number | null;
    missingArtifactSummary?: string[] | null;
    
    
    
    sourceRunId?: string | null;
    sourceAction?: string | null;
    sourceRunStatus?: string | null;
    derivedRunIds?: string[] | null;
    latestAction?: string | null;
    latestActionRunId?: string | null;
    latestActionAt?: string | null;
    snapshotAvailable?: boolean | null;
    canRestore?: boolean | null;
    documentDownloadAvailable?: boolean | null;
    documentId?: string | null;
    documentFileName?: string | null;
    documentVersion?: number | null;
    documentStatus?: string | null;
    documentRestoreAvailable?: boolean | null;
    documentByteLength?: number | null;
    startedAt?: string | null;
    createdAt?: string | null;
    completedAt?: string | null;
    updatedAt?: string | null;
  };
  snapshot?: RunHistorySnapshot;
};

export type ProjectRunsResponse = {
  runs?: Array<{
    runId?: string;
    status?: string | null;
    stage?: string | null;
    runKind?: string | null;
    documentKind?: string | null;
    error?: RunError | null;
    createdAt?: string | null;
    startedAt?: string | null;
    updatedAt?: string | null;
    completedAt?: string | null;
    model?: string | null;
    errorMessage?: string | null;
    diagramErrorCount?: number | null;
    diagramErrorSummary?: RunHistoryDiagramErrorSummary[] | null;
    partialFailure?: boolean | null;
    missingArtifactCount?: number | null;
    missingArtifactSummary?: string[] | null;
    
    
    
    sourceRunId?: string | null;
    sourceAction?: string | null;
    sourceRunStatus?: string | null;
    derivedRunIds?: string[] | null;
    latestAction?: string | null;
    latestActionRunId?: string | null;
    latestActionAt?: string | null;
    snapshotAvailable?: boolean | null;
    canRestore?: boolean | null;
    documentDownloadAvailable?: boolean | null;
    documentId?: string | null;
    documentFileName?: string | null;
    documentVersion?: number | null;
    documentStatus?: string | null;
    documentRestoreAvailable?: boolean | null;
    documentByteLength?: number | null;
  }>;
};

type ProjectRunResponse =
  | NonNullable<ProjectRunsResponse["runs"]>[number]
  | ProjectRunDetailResponse["run"];

export function isProjectDocumentRun(
  run: ProjectRunResponse,
  snapshot?: RunHistorySnapshot | null,
) {
  return (
    run?.runKind === "document" ||
    Boolean(run?.documentKind) ||
    Boolean(snapshot && isDocumentRunSnapshot(snapshot))
  );
}

export function canRestoreProjectRunWorkspace(
  run: ProjectRunResponse,
  snapshot?: RunHistorySnapshot | null,
) {
  if (isProjectDocumentRun(run, snapshot) || run?.runKind === "feasibility") return false;
  return run?.canRestore ?? Boolean(snapshot);
}

export function normalizeProjectHistoryResponse(payload: unknown): RunHistoryItem[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as {
    history?: RunHistoryItem[];
    items?: RunHistoryItem[];
    runs?: ProjectRunsResponse["runs"];
  };
  const persisted = record.history ?? record.items;
  if (persisted) {
    return persisted.filter((item): item is RunHistoryItem => {
      return (
        !!item &&
        typeof item.id === "string" &&
        typeof item.createdAt === "string" &&
        typeof item.title === "string" &&
        typeof item.providerModel === "string"
      );
    });
  }
  return (record.runs ?? [])
    .map((run) => projectRunSummaryToHistoryItem(run))
    .filter((item): item is RunHistoryItem => item !== null);
}

export function projectRunSummaryToHistoryItem(
  run: ProjectRunResponse,
  snapshot?: RunHistorySnapshot | null,
): RunHistoryItem | null {
  const runId = run?.runId?.trim();
  if (!runId) return null;
  const documentDownloadAvailable =
    run.status === "completed" && Boolean(run.documentDownloadAvailable);
  const interrupted = run.status === "interrupted";
  const canRestore = interrupted ? false : canRestoreProjectRunWorkspace(run, snapshot);
  const createdAt =
    run.completedAt ??
    run.startedAt ??
    run.createdAt ??
    run.updatedAt ??
    new Date().toISOString();
  const title = snapshot
    ? createRunHistoryTitle(runHistorySnapshotRequirementText(snapshot))
    : projectRunStageTitle(run);
  const historySnapshot =
    snapshot && isDocumentRunSnapshot(snapshot) && run?.documentFileName
      ? {
          ...snapshot,
          fileName: run.documentFileName,
          byteLength: run.documentByteLength ?? snapshot.byteLength,
        }
      : snapshot;
  return {
    id: runId,
    createdAt,
    title,
    snapshot: historySnapshot ?? null,
    providerModel: run.model ?? "默认模型",
    status: run.status ?? null,
    runKind: run.runKind ?? null,
    stage: run.stage ?? null,
    stageLabel: snapshot ? null : projectRunKindLabel(run),
    summary: snapshot ? null : projectRunSummary(run),
    sourceRunId: run.sourceRunId ?? null,
    sourceAction: run.sourceAction ?? null,
    sourceRunStatus: run.sourceRunStatus ?? null,
    derivedRunIds: run.derivedRunIds ?? null,
    latestAction: run.latestAction ?? null,
    latestActionRunId: run.latestActionRunId ?? null,
    latestActionAt: run.latestActionAt ?? null,
    errorMessage:
      run.error
        ? localizeRunFailure(run.error, "任务遇到内部错误，请联系管理员。")
        : run.errorMessage
          ? "任务遇到内部错误，请联系管理员。"
          : null,
    documentKind:
      run?.documentKind === "requirementsSpec" ||
      run?.documentKind === "softwareDesignSpec" ||
      run?.documentKind === "feasibilityStudy"
        ? run.documentKind
        : historySnapshot && isDocumentRunSnapshot(historySnapshot)
          ? historySnapshot.documentKind
          : null,
    documentId:
      run?.documentId ??
      (historySnapshot && isDocumentRunSnapshot(historySnapshot)
        ? historySnapshot.documentId
        : null),
    documentFileName:
      run?.documentFileName ??
      (historySnapshot && isDocumentRunSnapshot(historySnapshot)
        ? historySnapshot.fileName
        : null),
    documentVersion: run?.documentVersion ?? null,
    documentStatus: run?.documentStatus ?? null,
    documentRestoreAvailable: run?.documentRestoreAvailable ?? null,
    documentByteLength:
      run?.documentByteLength ??
      (historySnapshot && isDocumentRunSnapshot(historySnapshot)
        ? historySnapshot.byteLength
        : null),
    diagramErrorCount: run.diagramErrorCount ?? null,
    diagramErrorSummary: run.diagramErrorSummary ?? null,
    partialFailure: run.partialFailure ?? null,
    missingArtifactCount: run.missingArtifactCount ?? null,
    missingArtifactSummary: run.missingArtifactSummary ?? null,
    
    
    
    canRestore,
    snapshotAvailable: run.snapshotAvailable ?? Boolean(snapshot),
    documentDownloadAvailable,
  };
}

function projectRunStageTitle(run: ProjectRunDetailResponse["run"]) {
  if (!run) return "运行历史";
  if (run.documentKind === "requirementsSpec") return "生成需求规格说明书";
  if (run.documentKind === "softwareDesignSpec") return "生成软件设计说明书";
  if (run.documentKind === "feasibilityStudy") return "生成可行性研究报告";
  if (run.runKind === "feasibility" && run.stage === "generate_context") return "生成系统环境图";
  if (run.runKind === "feasibility" && run.stage === "render_context") return "渲染系统环境图";
  if (run.runKind === "feasibility" && run.stage === "generate_implementation") return "生成实现方案";
  if (run.runKind === "feasibility" && run.stage === "generate_business_flow") return "生成业务与系统流程图";
  if (run.runKind === "feasibility" && run.stage === "render_business_flow") return "渲染业务与系统流程图";
  const stage = run.stage ?? "";
  if (stage === "render_svg") {
    return run.runKind === "design" ? "渲染设计图表" : "渲染需求图表";
  }
  if (stage.includes("generate_tests")) return "生成测试用例";
  if (stage.includes("sequence")) return "生成用例实现设计";
  if (stage.includes("design")) return "生成设计模型";
  if (stage.includes("document")) return "生成说明书";
  if (stage.includes("extract_rules")) return "抽取需求规则";
  if (stage.includes("generate_models")) return "生成需求模型";
  if (run.runKind === "design") return "设计模型生成";
  
  if (run.runKind === "document") return "说明书生成";
  if (run.runKind === "feasibility") return "可行性分析生成";
  return "需求模型生成";
}

function projectRunKindLabel(run: ProjectRunDetailResponse["run"]) {
  if (!run) return "运行阶段";
  if (run.runKind === "design") return "设计阶段";
  
  if (run.runKind === "document") return "说明书";
  if (run.runKind === "feasibility") return "可行性分析";
  return "需求阶段";
}

function runActionLabel(action?: string | null) {
  if (action === "retry") return "重试";
  if (action === "rerun") return "重新运行";
  return "派生运行";
}

function projectRunSummary(run: ProjectRunDetailResponse["run"]) {
  const diagramErrors = formatRunHistoryDiagramErrorSummary(
    run?.diagramErrorSummary,
    { design: run?.runKind === "design" },
  );
  
  const parts = [
    run?.sourceRunId ? `${runActionLabel(run.sourceAction)}自 ${run.sourceRunId}` : null,
    run?.latestActionRunId
      ? `已${runActionLabel(run.latestAction)}为 ${run.latestActionRunId}`
      : null,
    run?.status === "interrupted" ? "服务中断，可重试" : null,
    run?.stage ? `阶段 ${run.stage}` : null,
    run?.error
      ? `失败原因 ${localizeRunFailure(run.error, "任务遇到内部错误，请联系管理员。")}`
      : run?.errorMessage
        ? "失败原因 任务遇到内部错误，请联系管理员。"
        : null,
    diagramErrors,
    
    formatDocumentMissingArtifactSummary(
      run?.missingArtifactSummary,
      run?.missingArtifactCount,
    ),
    canRestoreProjectRunWorkspace(run) ? "快照可恢复" : null,
    run?.status === "completed" && run?.documentDownloadAvailable
      ? "文档可下载"
      : null,
  ].filter(Boolean);
  return parts.join(" · ") || "运行摘要";
}
