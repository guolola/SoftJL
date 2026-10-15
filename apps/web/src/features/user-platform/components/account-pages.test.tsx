import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "./account-pages";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";

const profileResponse = {
  user: {
    id: "user-1",
    email: "student@example.edu",
    username: "student",
    displayName: "Student",
    avatarUrl: null,
    status: "active",
    emailVerified: true,
    mfaEnabled: false,
    systemRoles: [],
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
    lastLoginAt: null,
  },
  session: {
    id: "session-1",
    userId: "user-1",
    createdAt: "2026-07-06T00:00:00.000Z",
    expiresAt: "2026-07-13T00:00:00.000Z",
    lastSeenAt: "2026-07-06T00:00:00.000Z",
    ipAddress: "203.0.113.10",
    userAgent: "Vitest",
  },
  mfa: { enabled: false, enforcement: "totp" },
  generationUsage: {
    usedToday: 0,
    limit: null,
    remaining: null,
    windowSeconds: 86400,
    limited: false,
    scope: "user",
  },
};

function stubProfileFetch() {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({
          ...profileResponse,
          user: { ...profileResponse.user, ...body },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify(profileResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("AccountPage avatar URL security", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an inline reason and blocks insecure avatar URLs", async () => {
    const fetchMock = stubProfileFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FloatingAlertProvider><AccountPage onNavigate={vi.fn()} /></FloatingAlertProvider>);

    const avatarInput = await screen.findByLabelText("头像 URL");
    await user.type(avatarInput, "http://cdn.example.com/avatar.png");

    expect(screen.getByRole("alert")).toHaveTextContent("头像 URL 必须使用 HTTPS。");
    expect(screen.getByRole("button", { name: "保存资料" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("submits HTTPS avatar URLs", async () => {
    const fetchMock = stubProfileFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FloatingAlertProvider><AccountPage onNavigate={vi.fn()} /></FloatingAlertProvider>);

    await user.type(await screen.findByLabelText("头像 URL"), "https://cdn.example.com/avatar.png");
    await user.click(screen.getByRole("button", { name: "保存资料" }));

    await screen.findByText("账号资料已保存。");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const patchRequest = fetchMock.mock.calls[1]?.[1];
    expect(JSON.parse(String(patchRequest?.body))).toMatchObject({
      avatarUrl: "https://cdn.example.com/avatar.png",
    });
  });
});
