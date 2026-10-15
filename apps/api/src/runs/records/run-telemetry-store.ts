// Persists privacy-safe LLM telemetry and versioned evaluation attempts for local generation diagnostics.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Queryable } from "../../db/transactions.js";
export type LlmTokenUsage = {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
};
export type LlmRequestTelemetry = {
    id: string;
    runId: string;
    projectId: string | null;
    userId: string | null;
    providerConfigId: string | null;
    model: string;
    taskType: string;
    stage: string | null;
    diagramKind: string | null;
    subtaskId: string | null;
    requestedModelCount: number | null;
    queuedAt: string;
    providerStartedAt: string | null;
    firstReasoningAt: string | null;
    firstVisibleAt: string | null;
    lastVisibleAt: string | null;
    completedAt: string;
    queueMs: number | null;
    providerTtftMs: number | null;
    ttftMs: number | null;
    reasoningMs: number | null;
    decodeMs: number | null;
    totalMs: number;
    usage: LlmTokenUsage | null;
    outcome: "success" | "failed" | "cancelled";
    statusCode: number | null;
    errorCategory: string | null;
    retryCount: number;
    formatFallbackCount: number;
    usageUnavailableReason: string | null;
};
export type AnalyticsWindowFilters = {
    from: string;
    to: string;
    taskType?: string;
    providerConfigId?: string;
    model?: string;
    requestedModelCount?: number;
    strategyId?: string;
};
export interface RunTelemetryStore {
    recordTelemetry(entry: LlmRequestTelemetry): Promise<void>;
    listTelemetry(filters: AnalyticsWindowFilters): Promise<LlmRequestTelemetry[]>;
}
function matchesFilters(entry: Pick<LlmRequestTelemetry, "queuedAt" | "taskType" | "providerConfigId" | "model" | "requestedModelCount">, filters: AnalyticsWindowFilters) {
    return entry.queuedAt >= filters.from && entry.queuedAt < filters.to &&
        (!filters.taskType || entry.taskType === filters.taskType) &&
        (!filters.providerConfigId || entry.providerConfigId === filters.providerConfigId) &&
        (!filters.model || entry.model === filters.model) &&
        (filters.requestedModelCount === undefined || entry.requestedModelCount === filters.requestedModelCount);
}
export function createInMemoryRunTelemetryStore(): RunTelemetryStore {
    const telemetry: LlmRequestTelemetry[] = [];
    return {
        async recordTelemetry(entry) {
            telemetry.push(structuredClone(entry));
        },
        async listTelemetry(filters) {
            return telemetry.filter((entry) => matchesFilters(entry, filters)).map((entry) => structuredClone(entry));
        },
    };
}
function nullableNumber(value: unknown) {
    if (value === null || value === undefined)
        return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}
function timestamp(value: unknown) {
    return value instanceof Date ? value.toISOString() : String(value);
}
function mapTelemetryRow(row: Record<string, unknown>): LlmRequestTelemetry {
    return {
        id: String(row.id), runId: String(row.run_id),
        projectId: row.project_id === null ? null : String(row.project_id),
        userId: row.user_id === null ? null : String(row.user_id),
        providerConfigId: row.provider_config_id === null ? null : String(row.provider_config_id),
        model: String(row.model), taskType: String(row.task_type),
        stage: row.stage === null ? null : String(row.stage),
        diagramKind: row.diagram_kind === null ? null : String(row.diagram_kind),
        subtaskId: row.subtask_id === null ? null : String(row.subtask_id),
        requestedModelCount: nullableNumber(row.requested_model_count),
        queuedAt: timestamp(row.queued_at),
        providerStartedAt: row.provider_started_at === null ? null : timestamp(row.provider_started_at),
        firstReasoningAt: row.first_reasoning_at === null ? null : timestamp(row.first_reasoning_at),
        firstVisibleAt: row.first_visible_at === null ? null : timestamp(row.first_visible_at),
        lastVisibleAt: row.last_visible_at === null ? null : timestamp(row.last_visible_at),
        completedAt: timestamp(row.completed_at),
        queueMs: nullableNumber(row.queue_ms), providerTtftMs: nullableNumber(row.provider_ttft_ms),
        ttftMs: nullableNumber(row.ttft_ms), reasoningMs: nullableNumber(row.reasoning_ms),
        decodeMs: nullableNumber(row.decode_ms), totalMs: Number(row.total_ms),
        usage: row.input_tokens === null && row.output_tokens === null && row.total_tokens === null ? null : {
            inputTokens: nullableNumber(row.input_tokens), outputTokens: nullableNumber(row.output_tokens),
            cachedInputTokens: nullableNumber(row.cached_input_tokens), reasoningTokens: nullableNumber(row.reasoning_tokens),
            totalTokens: nullableNumber(row.total_tokens),
        },
        outcome: row.outcome as LlmRequestTelemetry["outcome"],
        statusCode: nullableNumber(row.status_code),
        errorCategory: row.error_category === null ? null : String(row.error_category),
        retryCount: Number(row.retry_count ?? 0), formatFallbackCount: Number(row.format_fallback_count ?? 0),
        usageUnavailableReason: row.usage_unavailable_reason === null ? null : String(row.usage_unavailable_reason),
    };
}
export function createPostgresRunTelemetryStore(db: Queryable): RunTelemetryStore {
    return {
        async recordTelemetry(entry) {
            await db.query(`insert into llm_request_telemetry (
        id, run_id, project_id, user_id, provider_config_id, model, task_type, stage, diagram_kind,
        subtask_id, requested_model_count, queued_at, provider_started_at, first_reasoning_at,
        first_visible_at, last_visible_at, completed_at, queue_ms, provider_ttft_ms, ttft_ms,
        reasoning_ms, decode_ms, total_ms, input_tokens, output_tokens, cached_input_tokens,
        reasoning_tokens, total_tokens, outcome, status_code, error_category, retry_count,
        format_fallback_count, usage_unavailable_reason
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34) on conflict (id) do nothing`, [
                entry.id, entry.runId, entry.projectId, entry.userId, entry.providerConfigId, entry.model,
                entry.taskType, entry.stage, entry.diagramKind, entry.subtaskId, entry.requestedModelCount,
                entry.queuedAt, entry.providerStartedAt, entry.firstReasoningAt, entry.firstVisibleAt,
                entry.lastVisibleAt, entry.completedAt, entry.queueMs, entry.providerTtftMs, entry.ttftMs,
                entry.reasoningMs, entry.decodeMs, entry.totalMs, entry.usage?.inputTokens ?? null,
                entry.usage?.outputTokens ?? null, entry.usage?.cachedInputTokens ?? null,
                entry.usage?.reasoningTokens ?? null, entry.usage?.totalTokens ?? null, entry.outcome,
                entry.statusCode, entry.errorCategory, entry.retryCount, entry.formatFallbackCount,
                entry.usageUnavailableReason,
            ]);
        },
        async listTelemetry(filters) {
            const result = await db.query<Record<string, unknown>>(`select * from llm_request_telemetry
        where queued_at >= $1::timestamptz and queued_at < $2::timestamptz
          and ($3::text is null or task_type = $3) and ($4::text is null or provider_config_id = $4)
          and ($5::text is null or model = $5) and ($6::int is null or requested_model_count = $6)
        order by queued_at asc`, [filters.from, filters.to, filters.taskType ?? null,
                filters.providerConfigId ?? null, filters.model ?? null, filters.requestedModelCount ?? null]);
            return result.rows.map(mapTelemetryRow);
        },
    };
}
export function newTelemetryId() {
    return randomUUID();
}
