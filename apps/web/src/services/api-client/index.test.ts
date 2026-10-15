import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  buildApiUrl,
  downloadBlob,
  postJson,
  requestJson,
} from "./index";
import { i18n } from "../../shared/i18n/i18n";

describe("api-client", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await i18n.changeLanguage("zh-CN");
  });

  it("builds api urls without duplicating the /api prefix", () => {
    expect(buildApiUrl("/api/runs", "https://example.com/api/")).toBe(
      "https://example.com/api/runs",
    );
  });

  it("builds same-origin api urls by default", () => {
    expect(buildApiUrl("/api/auth/me")).toBe("/api/auth/me");
    expect(buildApiUrl("api/auth/me")).toBe("/api/auth/me");
  });

  it("requests same-origin api paths by default", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestJson<{ ok: boolean }>("/api/auth/me")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("does not expose legacy server error messages for JSON requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "Provider rejected API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(postJson("/api/runs", {})).rejects.toMatchObject({
      name: "ApiClientError",
      status: 401,
      message: "登录状态已失效，请重新登录。",
    } satisfies Partial<ApiClientError>);
  });

  it("prefers a stable backend error code over an operation fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "USER_ENTITLEMENT_REQUIRED" } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      requestJson("/api/runs", { errorKey: "errors.operations.startDesign" }),
    ).rejects.toMatchObject({
      message: "当前账户没有可用于 AI 生成的权益，请先购买次数包。",
    });
  });

  it("exposes parsed structured api errors for contextual actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({
          error: {
            code: "REQUIREMENT_REVIEWS_PENDING",
            category: "conflict",
            retryable: false,
            params: { count: 2 },
            details: { ruleIds: ["r1", "r2"] },
          },
          requestId: "request-structured",
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(requestJson("/api/runs")).rejects.toMatchObject({
      name: "ApiClientError",
      apiError: {
        code: "REQUIREMENT_REVIEWS_PENDING",
        params: { count: 2 },
        details: { ruleIds: ["r1", "r2"] },
      },
    } satisfies Partial<ApiClientError>);
  });

  it("uses the localized operation fallback when no stable code exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "internal provider stack" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      requestJson("/api/design-runs", { errorKey: "errors.operations.startDesign" }),
    ).rejects.toMatchObject({
      message: "设计模型生成未能启动，请稍后重试。",
    });
  });

  it("keeps errorMessage as a compatibility fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("legacy detail", { status: 500 })),
    );

    await expect(
      requestJson("/api/legacy", { errorMessage: "当前操作失败，请重试。" }),
    ).rejects.toMatchObject({ message: "当前操作失败，请重试。" });
  });

  it("downloads blobs and reads utf-8 filenames", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("doc", {
          status: 200,
          headers: {
            "Content-Disposition": "attachment; filename*=UTF-8''%E8%AF%B4%E6%98%8E%E4%B9%A6.docx",
          },
        }),
      ),
    );

    const result = await downloadBlob("/api/document-runs/run/download");
    expect(result.fileName).toBe("说明书.docx");
    expect(await result.blob.text()).toBe("doc");
  });

  it.each([
    ["zh-CN", "无法连接服务，请检查网络或确认服务已启动后重试。"],
    ["en", "Unable to reach the service. Check your connection or confirm that the service is running, then try again."],
  ])("localizes network failures for %s without exposing browser text", async (language, expected) => {
    await i18n.changeLanguage(language);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    await expect(requestJson("/api/auth/me")).rejects.toMatchObject({
      name: "ApiClientError",
      status: 0,
      message: expected,
    });
  });

  it("keeps AbortError as cancellation", async () => {
    const abortError = new DOMException("cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn(async () => { throw abortError; }));

    await expect(requestJson("/api/auth/me")).rejects.toBe(abortError);
  });
});
