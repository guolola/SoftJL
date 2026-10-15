// Locks run failure classification for provider quota and balance messages.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRunError } from "./errors.js";
import { ModelSemanticError } from "@uml-platform/contracts";

test("normalizeRunError treats provider balance wording as quota exhaustion", () => {
  const siliconFlow = normalizeRunError(
    new Error(
      "LLM request failed with HTTP 403: Sorry, your account balance is insufficient",
    ),
  );
  const chineseQuota = normalizeRunError(
    new Error("Provider test failed with HTTP 403: 用户额度不足"),
  );

  assert.equal(siliconFlow.code, "PLATFORM_PROVIDER_BALANCE_INSUFFICIENT");
  assert.equal(siliconFlow.message, "当前模型服务额度不足，请稍后重试或联系管理员。");
  assert.equal(chineseQuota.code, "PLATFORM_PROVIDER_BALANCE_INSUFFICIENT");
});

test("exhausted model repairs retain structured diagnostics for snapshots and SSE", () => {
  const diagnostics = [{ modelId: "activity:order", diagramKind: "activity", code: "object-type", path: "relationships.0", elementId: "flow", severity: "error" as const, message: "对象类型不一致" }];
  const error = normalizeRunError(new Error("generate_models structured output failed", { cause: new ModelSemanticError(diagnostics) }));
  assert.equal(error.code, "RUN_STRUCTURED_OUTPUT_INVALID");
  assert.deepEqual(error.details?.diagnostics, diagnostics);
});
