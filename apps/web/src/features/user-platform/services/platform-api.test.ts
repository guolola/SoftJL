// Verifies account platform API request semantics that are easy to miss in UI mocks.
import { afterEach, describe, expect, it, vi } from "vitest";
import { platformApi } from "./platform-api";
import { i18n } from "../../../shared/i18n/i18n";
import { createAuthSessionResponse, createProjectInvitationResponse } from "@test/fixtures/contract-fixtures";

describe("platformApi", () => {
  it("requires current invitation responses without alternate member or empty success payloads", async () => {
    const response = createProjectInvitationResponse();
    const fetchMock = vi.fn(async () => Response.json(response));
    vi.stubGlobal("fetch", fetchMock);
    await expect(platformApi.inviteProjectMember("project", { username: "invitee", role: "viewer" })).resolves.toEqual(response);
    await expect(platformApi.resendProjectInvitation("project", "invitation")).resolves.toEqual(response);
    for (const invalid of [{ member: response.invitation }, { ...response, member: response.invitation }, {}]) {
      fetchMock.mockImplementation(async () => Response.json(invalid));
      await expect(platformApi.inviteProjectMember("project", { username: "invitee", role: "viewer" })).rejects.toThrow();
      await expect(platformApi.resendProjectInvitation("project", "invitation")).rejects.toThrow();
    }
  });

  it("accepts only current sessions and TOTP challenges at authentication boundaries", async () => {
    const session = createAuthSessionResponse();
    const challenge = { required: true, challengeId: "challenge-current-1", expiresAt: "2026-10-23T08:00:00.000Z", method: "totp" };
    const fetchMock = vi.fn(async () => Response.json(session));
    vi.stubGlobal("fetch", fetchMock);
    await expect(platformApi.login({ identifier: "new_student", password: "password" })).resolves.toEqual(session);
    await expect(platformApi.register({ username: "new_student", displayName: "Student", password: "password" })).resolves.toEqual(session);
    await expect(platformApi.verifyMfa({ challengeId: challenge.challengeId, code: "123456" })).resolves.toEqual(session);
    fetchMock.mockImplementation(async () => Response.json({ mfa: challenge }));
    await expect(platformApi.login({ identifier: "new_student", password: "password" })).resolves.toEqual({ mfa: challenge });
    for (const response of [{ mfaChallenge: challenge }, { mfa: challenge, mfaChallenge: challenge }, { ...session, mfaChallenge: challenge }, {}]) {
      fetchMock.mockImplementation(async () => Response.json(response));
      await expect(platformApi.login({ identifier: "new_student", password: "password" })).rejects.toThrow();
      await expect(platformApi.register({ username: "new_student", displayName: "Student", password: "password" })).rejects.toThrow();
      await expect(platformApi.verifyMfa({ challengeId: challenge.challengeId, code: "123456" })).rejects.toThrow();
    }
  });

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
