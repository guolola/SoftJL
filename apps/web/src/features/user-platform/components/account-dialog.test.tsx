// Covers account modal profile usage telemetry and security workflows displayed to the current user.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../../shared/i18n/i18n";
import { AppI18nProvider } from '../../../shared/i18n/i18n-provider';
import { SidebarProvider } from '../../../shared/ui/sidebar';
import { ThemeProvider } from "../../../shared/ui/theme-provider";
import { AccountDialog } from "./account-dialog";
import type { PlatformAccountProfileResponse } from "../services/platform-api";
import { invalidateProviderConfigCache } from "../services/provider-config-cache";

const baseUser = {
  id: "user-1",
  email: "student@example.edu",
  username: "student",
  displayName: "Student",
  status: "active",
  emailVerified: true,
  mfaEnabled: false,
};

function profileResponse(
  generationUsage: PlatformAccountProfileResponse["generationUsage"],
  user = baseUser,
): PlatformAccountProfileResponse {
  return {
    user,
    session: {
      id: "session-1",
      userId: user.id,
      createdAt: "2026-05-25T08:00:00.000Z",
      expiresAt: "2026-06-01T08:00:00.000Z",
      lastSeenAt: "2026-05-25T08:00:00.000Z",
      ipAddress: "203.0.113.40",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    },
    mfa: { enabled: false, enforcement: "totp" },
    generationUsage,
  };
}

function stubAccountFetch(profile: PlatformAccountProfileResponse, sessions: PlatformAccountProfileResponse["session"][] = [profile.session]) {
  let mfaEnabled = Boolean(profile.mfa?.enabled ?? profile.user.mfaEnabled);
  const currentProfile = () => ({
    ...profile,
    user: { ...profile.user, mfaEnabled },
    mfa: { enabled: mfaEnabled, enforcement: "totp" },
  });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://127.0.0.1:4101");
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/auth/me" || (url.pathname === "/api/account/profile" && method === "GET")) {
      return new Response(JSON.stringify(currentProfile()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/profile" && method === "PATCH") {
      return new Response(
        JSON.stringify({
          ...currentProfile(),
          user: {
            ...currentProfile().user,
            displayName: "Teaching Assistant",
            avatarUrl: "https://cdn.example.edu/avatar.png",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === "/api/account/sessions") {
      return new Response(JSON.stringify({ sessions }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/provider-configs") {
      return new Response(JSON.stringify({
        providerConfigs: [{
          id: "provider-1",
          name: "课程 OpenAI",
          provider: "openai",
          baseUrl: "https://api.example.com/v1",
          defaultModel: "gpt-5.6",
          allowedModels: ["gpt-5.6", "gpt-5.5"],
          maskedKey: "sk-***",
          keyPurpose: "course",
          status: "active",
          riskState: "approved",
          quota: "managed",
          createdBy: "admin-1",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          lastUsedAt: null,
          allowlisted: true,
          scopeType: "system",
          scopeId: null,
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/billing/summary") {
      return new Response(JSON.stringify({
        creditBalance: 0,
        signupBonus: { granted: false, creditAmount: 0, validUntil: null },
        recentOrders: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/mfa/setup" && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUri: "otpauth://totp/UML:student@example.edu?secret=JBSWY3DPEHPK3PXP",
          qrCodeDataUrl: "data:image/png;base64,mfa",
          expiresAt: "2026-05-25T08:05:00.000Z",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === "/api/account/mfa/confirm" && init?.method === "POST") {
      mfaEnabled = true;
      return new Response(JSON.stringify({ mfa: { enabled: true, enforcement: "totp" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/mfa" && init?.method === "PATCH") {
      mfaEnabled = false;
      return new Response(JSON.stringify({ mfa: { enabled: false, enforcement: "totp" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/account/sessions/revoke-others" && init?.method === "POST") {
      return new Response(JSON.stringify({ revokedCount: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/auth/logout" && init?.method === "POST") {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ message: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAccountDialog(
  props: ComponentProps<typeof AccountDialog>,
  options: { strict?: boolean } = {},
) {
  const dialog = (
    <AppI18nProvider><ThemeProvider><SidebarProvider>
      <AccountDialog {...props} />
    </SidebarProvider></ThemeProvider></AppI18nProvider>
  );
  return render(
    options.strict ? <StrictMode>{dialog}</StrictMode> : dialog,
  );
}

describe("AccountDialog generation usage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    invalidateProviderConfigCache();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  it("resolves every session table header in both supported locales", () => {
    expect(i18n.t("account.deviceHeader", { lng: "zh-CN" })).toBe("设备");
    expect(i18n.t("account.lastActiveHeader", { lng: "zh-CN" })).toBe("最近活动");
    expect(i18n.t("account.expiresHeader", { lng: "zh-CN" })).toBe("过期时间");
    expect(i18n.t("account.deviceHeader", { lng: "en" })).toBe("Device");
    expect(i18n.t("account.lastActiveHeader", { lng: "en" })).toBe("Last active");
    expect(i18n.t("account.expiresHeader", { lng: "en" })).toBe("Expires");
  });

  it("keeps the account trigger visible as a compact mobile avatar button", () => {
    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });

    const trigger = screen.getByRole("button", { name: "账号" });
    expect(trigger).toHaveClass("inline-flex", "size-9", "md:w-auto");
    expect(trigger).not.toHaveClass("hidden");
    expect(within(trigger).getByText("Student")).toHaveClass("hidden", "md:inline");
  });

  it("uses block37 top tabs and keyboard navigation on mobile", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    const user = userEvent.setup();
    stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));

    const accountDialog = await screen.findByRole("dialog", { name: "设置" });
    expect(accountDialog).toHaveAttribute("data-block", "dashboard-dialog-37");
    expect(accountDialog).toHaveClass("h-[calc(100dvh-2rem)]", "sm:h-170");
    const tabList = within(accountDialog).getByRole("tablist", { name: "设置" });
    const tabs = within(tabList).getAllByRole("tab");
    expect(tabs.map(tab => tab.getAttribute("aria-label"))).toEqual(["主题", "布局", "语言", "个人资料", "安全设置", "登录会话", "模型配置"]);
    expect(within(tabList).getByRole("tab", { name: "主题" })).toHaveAttribute("aria-selected", "true");
    expect(within(tabList).queryByRole("tab", { name: "外部工具连接" })).not.toBeInTheDocument();

    const profileTab = within(tabList).getByRole("tab", { name: "个人资料" });
    const securityTab = within(tabList).getByRole("tab", { name: "安全设置" });
    expect(tabList).toHaveClass("grid-cols-7");

    await user.click(profileTab);
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(securityTab).toHaveFocus());
    await user.keyboard("{Enter}");
    expect(securityTab).toHaveAttribute("aria-selected", "true");
    expect((await within(accountDialog).findAllByText("修改密码")).length).toBeGreaterThan(0);
  });

  it("shows the complete session list and preloads provider settings when the dialog opens", async () => {
    const user = userEvent.setup();
    const fetchMock = stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog(
      { onNavigate: () => {}, initialUser: baseUser },
      { strict: true },
    );
    await user.click(screen.getByRole("button", { name: "账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "设置" });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/account/sessions"))).toBe(true);
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/provider-configs"))).toBe(true);
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/billing/summary"))).toBe(false);
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/provider-configs"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/billing/summary"))).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/auth/me"))).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/account/login-events"))).toBe(false);

    await user.click(within(accountDialog).getByRole("tab", { name: "登录会话" }));
    const sessionsList = await within(accountDialog).findByRole("list", { name: "活跃会话" });
    expect(within(sessionsList).getAllByRole("listitem")).toHaveLength(1);
    expect(within(sessionsList).getByText(/^地区:/)).toBeInTheDocument();
    expect(within(sessionsList).getByText(/^最近活动:/)).toBeInTheDocument();
    expect(within(sessionsList).getByText(/^过期时间:/)).toBeInTheDocument();
    expect(sessionsList.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
    expect(within(sessionsList).getByText("当前设备")).toBeInTheDocument();
    expect(within(sessionsList).getByText("Windows • Chrome")).toBeInTheDocument();
    expect(within(accountDialog).queryByRole("table")).not.toBeInTheDocument();
    expect(within(accountDialog).queryByText("登录历史")).not.toBeInTheDocument();

    const providerRequestCount = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/api/provider-configs"),
    ).length;
    const billingRequestCount = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/api/billing/summary"),
    ).length;
    await user.click(within(accountDialog).getByRole("tab", { name: "模型配置" }));
    expect(await within(accountDialog).findByLabelText("托管 Provider 配置")).not.toBeDisabled();
    expect(within(accountDialog).getByLabelText("默认模型")).not.toBeDisabled();
    expect(within(accountDialog).getByLabelText("托管 Provider 配置")).toHaveTextContent("课程 OpenAI");
    expect(within(accountDialog).getByLabelText("默认模型")).toHaveTextContent("gpt-5.6");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/provider-configs"))).toHaveLength(providerRequestCount);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/billing/summary"))).toHaveLength(billingRequestCount);
    expect(within(accountDialog).queryByText("暂无可用托管 Provider 配置。")).not.toBeInTheDocument();
    expect(within(accountDialog).queryByText("选择托管 Provider 后才能选择默认模型。")).not.toBeInTheDocument();
  });

  it("does not show today's generation count for regular users", async () => {
    const user = userEvent.setup();
    stubAccountFetch(
      profileResponse({
        usedToday: 3,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));

    await user.click(screen.getByRole("tab", { name: "个人资料" }));
    await screen.findByText("个人资料信息");
    const accountDialog = screen.getByRole("dialog", { name: "设置" });
    const scrollArea = accountDialog.querySelector("[data-settings-scroll]");
    expect(scrollArea).toBeInTheDocument();
    expect(scrollArea).toHaveClass("overflow-x-hidden", "overflow-y-auto");
    expect(scrollArea?.querySelector("main")).toHaveClass("px-4", "sm:px-6");
    expect(scrollArea?.querySelector("main")).not.toHaveClass("overflow-y-auto");
    expect(screen.queryByText("今日生成次数")).not.toBeInTheDocument();
    expect(screen.queryByText("今日 3 次")).not.toBeInTheDocument();
    expect(screen.queryByText("不限额")).not.toBeInTheDocument();
  });

  it("does not show today's generation quota for guest users", async () => {
    const user = userEvent.setup();
    stubAccountFetch(
      profileResponse(
        {
          usedToday: 3,
          limit: 5,
          remaining: 2,
          windowSeconds: 86400,
          limited: true,
          scope: "visitor",
        },
        {
          ...baseUser,
          id: "guest-user",
          email: "guest@example.edu",
          displayName: "Guest",
        },
      ),
    );

    renderAccountDialog({
      onNavigate: () => {},
      initialUser: {
        ...baseUser,
        id: "guest-user",
        email: "guest@example.edu",
        displayName: "Guest",
      },
    });
    await user.click(screen.getByRole("button", { name: "账号" }));

    await user.click(screen.getByRole("tab", { name: "个人资料" }));
    await screen.findByText("个人资料信息");
    await waitFor(() => {
      expect(screen.queryByText("今日生成次数")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("今日 3 / 5 次")).not.toBeInTheDocument();
    expect(screen.queryByText("剩余 2 次")).not.toBeInTheDocument();
  });

  it("updates the account profile through the profile API", async () => {
    const user = userEvent.setup();
    const fetchMock = stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "设置" });
    await user.click(within(accountDialog).getByRole("tab", { name: "个人资料" }));
    const displayNameInput = await within(accountDialog).findByLabelText("昵称");

    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Teaching Assistant");
    fireEvent.click(within(accountDialog).getByRole("button", { name: "保存资料" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/profile"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            displayName: "Teaching Assistant",
            avatarUrl: null,
          }),
        }),
      );
    });
  });

  it("manages real TOTP MFA and session revocation through account APIs", async () => {
    const user = userEvent.setup();
    const fetchMock = stubAccountFetch(
      profileResponse({
        usedToday: 0,
        limit: null,
        remaining: null,
        windowSeconds: 86400,
        limited: false,
        scope: "user",
      }),
    );

    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    const accountDialog = await screen.findByRole("dialog", { name: "设置" });
    await user.click(await within(accountDialog).findByRole("tab", { name: "安全设置" }));

    expect((await within(accountDialog).findAllByText("MFA 已禁用")).length).toBeGreaterThan(0);
    fireEvent.click(within(accountDialog).getByRole("button", { name: "启用 MFA" }));
    expect(await within(accountDialog).findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/account/mfa/setup"),
      expect.objectContaining({ method: "POST" }),
    );

    const mfaCodeInput = within(accountDialog).getByLabelText("MFA 验证码");
    fireEvent.change(mfaCodeInput, { target: { value: "123456" } });
    await waitFor(() => {
      expect(mfaCodeInput).toHaveValue("123456");
    });
    fireEvent.click(await within(accountDialog).findByRole("button", { name: "确认启用 MFA" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/mfa/confirm"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "123456" }),
        }),
      );
    });
    expect((await within(accountDialog).findAllByText("MFA 已启用")).length).toBeGreaterThan(0);

    fireEvent.change(await within(accountDialog).findByLabelText("停用验证码"), {
      target: { value: "654321" },
    });
    fireEvent.click(await within(accountDialog).findByRole("button", { name: "停用 MFA" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/mfa"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ enabled: false, code: "654321" }),
        }),
      );
    });
    expect((await within(accountDialog).findAllByText("MFA 已禁用")).length).toBeGreaterThan(0);

    expect(within(accountDialog).queryByRole("button", { name: "退出其他设备" })).not.toBeInTheDocument();
    expect(within(accountDialog).queryByRole("button", { name: "退出登录" })).not.toBeInTheDocument();
    await user.click(within(accountDialog).getByRole("tab", { name: "登录会话" }));
    const revokeButton = within(accountDialog).getByRole("button", { name: "退出其他设备登录" });
    expect(revokeButton.parentElement?.querySelector("[data-page-description]")).toHaveTextContent("查看当前登录设备、地区、最近活动和过期时间");
    fireEvent.click(revokeButton);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/account/sessions/revoke-others"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("keeps the avatar upload target without the removed detail controls", async () => {
    const user = userEvent.setup();
    stubAccountFetch(profileResponse({ usedToday: 0, limit: null, remaining: null, windowSeconds: 86400, limited: false, scope: "user" }));
    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    const dialog = await screen.findByRole("dialog", { name: "设置" });
    await user.click(within(dialog).getByRole("tab", { name: "个人资料" }));
    expect(within(dialog).queryByRole("button", { name: "更换头像" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/支持 PNG/)).not.toBeInTheDocument();
    expect(dialog.querySelector('label[for="account-avatar-file"]')).toBeInTheDocument();
    expect(within(dialog).getAllByText("正常")).toHaveLength(1);
  });

  it("applies the active preference page while retaining other drafts and cancels pending profile changes", async () => {
    const user = userEvent.setup();
    const fetchMock = stubAccountFetch(profileResponse({ usedToday: 0, limit: null, remaining: null, windowSeconds: 86400, limited: false, scope: "user" }));
    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    const dialog = await screen.findByRole("dialog", { name: "设置" });
    await user.click(within(dialog).getByRole("tab", { name: "深色" }));
    expect(localStorage.getItem("admincn-ui-theme")).not.toBe("dark");
    await user.click(within(dialog).getByRole("radio", { name: "Classic Indigo" }));
    expect(localStorage.getItem("admincn-ui-theme-preset")).toBeNull();
    await user.click(within(dialog).getByRole("tab", { name: "布局" }));
    await user.click(within(dialog).getByRole("tab", { name: "收起" }));
    await user.click(within(dialog).getByRole("tab", { name: "主题" }));
    await user.click(within(dialog).getByRole("button", { name: "保存更改" }));
    await waitFor(() => expect(localStorage.getItem("admincn-ui-theme")).toBe("dark"));
    expect(localStorage.getItem("admincn-ui-theme-preset")).toBe("classic-indigo");
    await user.click(within(dialog).getByRole("tab", { name: "布局" }));
    expect(within(dialog).getByRole("tab", { name: "收起" })).toHaveAttribute("aria-selected", "true");
    await user.click(within(dialog).getByRole("button", { name: "保存更改" }));
    expect(document.cookie).toContain("sidebar_state=false");
    await user.click(within(dialog).getByRole("tab", { name: "个人资料" }));
    await user.clear(within(dialog).getByLabelText("昵称"));
    await user.type(within(dialog).getByLabelText("昵称"), "Discard this draft");
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "设置" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "账号" }));
    await user.click(screen.getByRole("tab", { name: "个人资料" }));
    expect(screen.getByLabelText("昵称")).toHaveValue("Student");
    expect(fetchMock.mock.calls.filter(([input, init]) => String(input).includes("/api/account/profile") && init?.method === "PATCH")).toHaveLength(0);
  });

  it("saves language without resetting a model draft or issuing new preload requests", async () => {
    const user = userEvent.setup();
    const fetchMock = stubAccountFetch(profileResponse({ usedToday: 0, limit: null, remaining: null, windowSeconds: 86400, limited: false, scope: "user" }));
    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    const dialog = await screen.findByRole("dialog", { name: "设置" });
    await user.click(within(dialog).getByRole("tab", { name: "模型配置" }));
    const auto = within(dialog).getByRole("switch", { name: "修改后自动重新生成规则" });
    await user.click(auto);
    const counts = fetchMock.mock.calls.length;
    await user.click(within(dialog).getByRole("tab", { name: "语言" }));
    await user.click(within(dialog).getByRole("combobox", { name: "语言" }));
    await user.click(screen.getByRole("option", { name: "English" }));
    expect(localStorage.getItem("uml-lab-locale-preference")).not.toBe("en");
    await user.click(within(dialog).getByRole("button", { name: "保存更改" }));
    await waitFor(() => expect(within(dialog).getByRole("tab", { name: "Model configuration" })).toBeInTheDocument());
    expect(localStorage.getItem("uml-lab-locale-preference")).toBe("en");
    await user.click(within(dialog).getByRole("tab", { name: "Model configuration" }));
    expect(within(dialog).getByRole("switch", { name: "Regenerate rules after changes" })).toBeChecked();
    expect(fetchMock.mock.calls).toHaveLength(counts);
  });

  it("removes trailing periods from each page description and keeps immediate actions out of the footer", async () => {
    const user = userEvent.setup();
    stubAccountFetch(profileResponse({ usedToday: 0, limit: null, remaining: null, windowSeconds: 86400, limited: false, scope: "user" }));
    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    const dialog = await screen.findByRole("dialog", { name: "设置" });
    for (const name of ["主题", "布局", "语言", "个人资料", "安全设置", "登录会话", "模型配置"]) {
      await user.click(within(dialog).getByRole("tab", { name }));
      expect(dialog.querySelector('[data-page-description]')?.textContent).not.toMatch(/[。.]+$/u);
      if (name === "安全设置" || name === "登录会话") {
        expect(within(dialog).getByRole("button", { name: "重置" })).toBeDisabled();
        expect(within(dialog).getByRole("button", { name: "保存更改" })).toBeDisabled();
      }
    }
  });

  it.each([0, 8])("renders session empty state or at most five device records (available: %i)", async count => {
    const user = userEvent.setup();
    const profile = profileResponse({ usedToday: 0, limit: null, remaining: null, windowSeconds: 86400, limited: false, scope: "user" });
    stubAccountFetch(profile, Array.from({ length: count }, (_, index) => ({ ...profile.session, id: index === 0 ? profile.session.id : 'extra-session-' + index })));
    renderAccountDialog({ onNavigate: () => {}, initialUser: baseUser });
    await user.click(screen.getByRole("button", { name: "账号" }));
    await user.click(screen.getByRole("tab", { name: "登录会话" }));
    const list = await screen.findByRole("list", { name: "活跃会话" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(count ? 5 : 1));
    if (!count) expect(within(list).getByText("暂无活跃会话。")).toBeInTheDocument();
  });

});
