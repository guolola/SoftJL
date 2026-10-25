// Provides reusable session fixtures and harness components for integration tests.

import type { RequirementBaseline } from "@uml-platform/contracts";

export { createRule } from "./workspace-test-utils";

import { useWorkspaceSession } from "../../src/features/workspace-session/state";

export function storeManagedUserSettings() {
  localStorage.setItem(
    "uml-lab-settings",
    JSON.stringify({
      providerConfigId: "provider-config-1",
      defaultModel: "gpt-5.5",
      providerModelOptions: ["gpt-5.5"],
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

export function GenerateRulesHarness() {
  const { generateRules } = useWorkspaceSession();
  return (
    <button type="button" onClick={() => void generateRules()}>
      生成需求规则
    </button>
  );
}

export function createBaselineRule(
  overrides: Partial<RequirementBaseline["rules"][number]> = {},
): RequirementBaseline["rules"][number] {
  return { requirementId: "REQ-001", id: "r1", text: "用户可以提交订单。", sourceFragment: "用户可以提交订单。", type: "functional" as const, ...overrides };
}

export function createRequirementBaseline(
  requirements: RequirementBaseline["rules"][number][],
  overrides: Partial<RequirementBaseline> = {},
): RequirementBaseline {
  return {
      id: "baseline-test",
      version: 1,
      sourceInputFingerprint: "test-source-input",
    runId: "run-baseline",
    createdAt: "2026-05-27T00:00:00.000Z",
    schemaVersion: 3 as const,

      rules: (requirements),
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}
