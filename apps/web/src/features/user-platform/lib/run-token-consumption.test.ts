// Checks fixed-k formatting and incomplete per-run telemetry without deriving missing counts.
import { describe, expect, it } from "vitest";
import type { PlatformRunTokenConsumption } from "../services/platform-api";
import { formatRunTokenCount, runTokenConsumptionPresentation } from "./run-token-consumption";

function consumption(overrides: Partial<PlatformRunTokenConsumption> = {}): PlatformRunTokenConsumption {
  return { totalTokens: null, inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null, calls: 1, unreportedCalls: 1, ...overrides };
}

describe("per-run token consumption", () => {
  it.each([
    [0, "0k"], [1, "0.001k"], [250, "0.25k"], [5700, "5.7k"],
    [1_000_000, "1000k"], [1_000_000_000, "1000000k"], [123_456, "123.456k"],
  ] as const)("formats %s tokens as %s", (value, expected) => {
    expect(formatRunTokenCount(value)).toBe(expected);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1])("does not turn absent or invalid %s counts into zero", (value) => {
    expect(formatRunTokenCount(value)).toBeNull();
  });

  it("keeps reported dimensions when every call has an incomplete usage report", () => {
    const result = runTokenConsumptionPresentation(consumption({ inputTokens: 250 }));
    expect(result.partial).toBe(true);
    expect(result.metrics.input).toBe("0.25k");
    expect(result.metrics.total).toBeNull();
    expect(result.metrics.output).toBeNull();
  });

  it("does not infer total tokens from overlapping or incomplete dimensions", () => {
    const result = runTokenConsumptionPresentation(consumption({ inputTokens: 4000, outputTokens: 1700, cachedInputTokens: 500, reasoningTokens: 300 }));
    expect(result.metrics.total).toBeNull();
    expect(result.metrics.cachedInput).toBe("0.5k");
    expect(result.metrics.reasoning).toBe("0.3k");
  });

  it("distinguishes an entirely unreported run from a reported zero", () => {
    expect(runTokenConsumptionPresentation(undefined)).toMatchObject({ partial: false, hasReportedUsage: false, metrics: { total: null } });
    expect(runTokenConsumptionPresentation(consumption())).toMatchObject({ partial: false, hasReportedUsage: false, metrics: { total: null } });
    expect(runTokenConsumptionPresentation(consumption({ totalTokens: 0, unreportedCalls: 0 }))).toMatchObject({ partial: false, hasReportedUsage: true, metrics: { total: "0k" } });
  });
});
