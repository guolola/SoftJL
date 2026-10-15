// Verifies provider health-check failures remain actionable without exposing upstream secrets.
import assert from "node:assert/strict";
import test from "node:test";
import { ProviderHttpError } from "../llm.js";
import {
  classifyProviderTestFailure,
  providerTestError,
} from "./provider-test-errors.js";

test("classifies provider authentication and rate-limit failures", () => {
  const authentication = classifyProviderTestFailure(new ProviderHttpError({
    status: 401,
    detail: "invalid key sk-sensitive",
    message: "provider rejected sk-sensitive",
  }));
  const rateLimit = classifyProviderTestFailure(new ProviderHttpError({
    status: 429,
    detail: "quota exhausted for tenant-sensitive",
    message: "quota exhausted for tenant-sensitive",
  }));

  assert.deepEqual(authentication, {
    code: "PROVIDER_SECRET_INVALID",
    failureKind: "authentication",
    httpStatus: 400,
    retryable: false,
    upstreamStatus: 401,
  });
  assert.equal(rateLimit.code, "PROVIDER_RATE_LIMITED");
  assert.equal(rateLimit.httpStatus, 429);
  assert.equal(rateLimit.retryable, true);
});

test("classifies TLS resets and timeouts without returning raw errors", () => {
  const tlsReset = classifyProviderTestFailure(
    new Error("read ECONNRESET during TLS handshake for api-key-sensitive"),
  );
  const timeout = classifyProviderTestFailure(
    new Error("provider request timed out after 10 seconds"),
  );
  const response = providerTestError({
    code: tlsReset.code,
    retryable: tlsReset.retryable,
    details: { failureKind: tlsReset.failureKind },
  });

  assert.equal(tlsReset.code, "PROVIDER_CONNECTION_FAILED");
  assert.equal(tlsReset.httpStatus, 502);
  assert.equal(timeout.code, "PROVIDER_TIMEOUT");
  assert.equal(timeout.httpStatus, 502);
  assert.doesNotMatch(JSON.stringify(response), /ECONNRESET|api-key-sensitive/u);
});

test("keeps blocked provider redirects as non-retryable URL policy failures", () => {
  const redirect = classifyProviderTestFailure(new ProviderHttpError({
    status: 400,
    detail: "Provider request redirected; configure the final reviewed public HTTPS endpoint",
    message: "Provider test failed with HTTP 400",
  }));

  assert.deepEqual(redirect, {
    code: "PROVIDER_BASE_URL_NOT_ALLOWED",
    failureKind: "connection",
    httpStatus: 400,
    retryable: false,
    upstreamStatus: 400,
  });
});
