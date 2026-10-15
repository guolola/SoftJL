// Verifies account platform API request semantics that are easy to miss in UI mocks.
import { afterEach, describe, expect, it, vi } from "vitest";
import { platformApi } from "./platform-api";
import { i18n } from "../../../shared/i18n/i18n";

describe("platformApi", () => {
  it('requests timed run events and forwards cancellation without changing ordinary run reads', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await platformApi.getProjectRun('project', 'run');
    await platformApi.getProjectRun('project', 'run', { includeEvents: true, signal: controller.signal });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/projects/project/runs/run');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/projects/project/runs/run?includeEvents=true');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).signal).toBe(controller.signal);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await i18n.changeLanguage("zh-CN");
  });

  it("does not send a JSON content type for empty-body MFA setup requests", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUri: "otpauth://totp/UML:user@example.test?secret=JBSWY3DPEHPK3PXP",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await platformApi.setupMfa();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it.each([
    ["zh-CN", "无法连接服务，请检查网络或确认服务已启动后重试。"],
    ["en", "Unable to reach the service. Check your connection or confirm that the service is running, then try again."],
  ])("localizes transport failures for %s", async (language, expected) => {
    await i18n.changeLanguage(language);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    await expect(platformApi.me()).rejects.toMatchObject({
      name: "PlatformApiError",
      status: 0,
      code: "NETWORK_FAILURE",
      message: expected,
    });
  });

  it("does not turn AbortError into a request failure", async () => {
    const abortError = new DOMException("cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn(async () => { throw abortError; }));

    await expect(platformApi.me()).rejects.toBe(abortError);
  });
});
