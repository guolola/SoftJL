// Summarizes task failures without exposing renderer diagnostics or provider payloads.
import { i18n } from "../../../shared/i18n/i18n";
import { localizeRunFailure } from "../../../shared/i18n/api-errors";

export function generationFailureSummary(error: unknown, label?: string) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof error === "string" ? error : typeof value.message === "string" ? value.message : "";
  const code = typeof value.code === "string" ? value.code : "";
  const key = code === "RUN_RENDER_FAILED" || value.category === "render" || /绘图器故障|绘制校验|SVG.*(?:不一致|缺少)|PlantUML.*(?:失败|故障)|图形渲染失败/i.test(message)
    ? "renderer"
    : code === "RUN_STRUCTURED_OUTPUT_INVALID" ? "format"
      : /TIMEOUT/.test(code) || /超时|timed?\s*out|timeout/i.test(message) ? "timeout"
        : code === "RUN_INTERNAL_ERROR" || !code ? "unknown"
          : undefined;
  const fallback = i18n.t("generation.drawer.failures.unknown");
  // Known input/configuration errors retain their actionable, localized guidance.
  const localized = key ? i18n.t(`generation.drawer.failures.${key}`) : localizeRunFailure(value, fallback);
  const summary = localized.length <= 140 ? localized : fallback;
  return label ? i18n.t("generation.drawer.failureWithTarget", { label, message: summary }) : summary;
}
