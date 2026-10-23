// Verifies public authentication page navigation and non-blocking feedback.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/index";
import { i18n, saveLocalePreference } from "../../../shared/i18n/index";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";
import { AuthPage } from "./auth-page";
import { createAuthSessionResponse } from "@test/fixtures/contract-fixtures";

afterEach(async () => {
  localStorage.removeItem("uml-auth-remembered-username");
  localStorage.removeItem("uml-auth-remembered-password");
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
  saveLocalePreference("system");
  await i18n.changeLanguage("zh-CN");
});

it("prefills only the remembered account and leaves the password empty", () => {
  localStorage.setItem("uml-auth-remembered-username", "teacher");

  render(
    <AppI18nProvider>
      <AuthPage path="/login" onNavigate={vi.fn()} />
    </AppI18nProvider>,
  );

  expect(screen.getByLabelText("用户名")).toHaveValue("teacher");
  expect(screen.getByLabelText("密码")).toHaveValue("");
  expect(screen.getByRole("checkbox", { name: "记住账号" })).toBeChecked();
  expect(localStorage.getItem("uml-auth-remembered-password")).toBeNull();
});

it("forgets the saved account after a successful login with remembering unchecked", async () => {
  localStorage.setItem("uml-auth-remembered-username", "teacher");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(createAuthSessionResponse())));
  const onNavigate = vi.fn();
  const user = userEvent.setup();

  render(
    <AppI18nProvider>
      <AuthPage path="/login" onNavigate={onNavigate} />
    </AppI18nProvider>,
  );

  await user.type(screen.getByLabelText("密码"), "password-123");
  await user.click(screen.getByRole("checkbox", { name: "记住账号" }));
  await user.click(screen.getByRole("button", { name: "登录" }));

  await waitFor(() => expect(onNavigate).toHaveBeenCalled());
  expect(localStorage.getItem("uml-auth-remembered-username")).toBeNull();
  expect(localStorage.getItem("uml-auth-remembered-password")).toBeNull();
});

it("shows student project guidance without the security footnote in both languages", async () => {
  for (const [locale, removedText] of [
    ["zh-CN", "登录状态由服务端安全会话校验保护。"],
    ["en", "Your sign-in is protected by server-side session validation."],
  ] as const) {
    saveLocalePreference(locale);
    await i18n.changeLanguage(locale);
    const { unmount } = render(
      <AppI18nProvider>
        <AuthPage path="/login" onNavigate={vi.fn()} />
      </AppI18nProvider>,
    );
    expect(screen.getByTestId("auth-form-panel")).toBeInTheDocument();
    expect(screen.getAllByText("SoftJL")).toHaveLength(2);
    expect(screen.getByText(locale === "en"
      ? "Start with project requirements and work through analysis, modeling, design and testing for your capstone or course project."
      : "从一段项目需求开始，逐步完成毕业设计与课程设计中的分析、建模、设计和测试。",
    )).toBeInTheDocument();
    expect(screen.queryByText(removedText)).not.toBeInTheDocument();
    unmount();
  }
});

it("shows login-required feedback in the floating alert layer", async () => {
  await i18n.changeLanguage("zh-CN");
  window.history.pushState({}, "", "/login?redirect=%2Fprojects&reason=login-required");

  render(
    <AppI18nProvider>
      <FloatingAlertProvider>
        <AuthPage path="/login" onNavigate={vi.fn()} />
      </FloatingAlertProvider>
    </AppI18nProvider>,
  );

  const notice = await screen.findByText("此页面需要登录，请登录后继续。");
  expect(screen.getByTestId("auth-form-panel")).not.toContainElement(notice);
});

it("shows a localized fixed alert for login network failures without changing the form layout", async () => {
  await i18n.changeLanguage("zh-CN");
  window.history.pushState({}, "", "/login");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const user = userEvent.setup();

  render(
    <AppI18nProvider>
      <FloatingAlertProvider>
        <AuthPage path="/login" onNavigate={vi.fn()} />
      </FloatingAlertProvider>
    </AppI18nProvider>,
  );

  await user.type(screen.getByLabelText("用户名"), "teacher");
  await user.type(screen.getByLabelText("密码"), "password-123");
  await user.click(screen.getByRole("checkbox", { name: "记住账号" }));
  await user.click(screen.getByRole("button", { name: "登录" }));

  const message = await screen.findByText("无法连接服务，请检查网络或确认服务已启动后重试。");
  expect(screen.getByTestId("auth-form-panel")).not.toContainElement(message);
  expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  expect(localStorage.getItem("uml-auth-remembered-username")).toBeNull();
  expect(localStorage.getItem("uml-auth-remembered-password")).toBeNull();
});

it("keeps terms validation next to the registration checkbox", async () => {
  await i18n.changeLanguage("zh-CN");
  window.history.pushState({}, "", "/register");
  const user = userEvent.setup();

  render(
    <AppI18nProvider>
      <FloatingAlertProvider>
        <AuthPage path="/register" onNavigate={vi.fn()} />
      </FloatingAlertProvider>
    </AppI18nProvider>,
  );

  await user.type(screen.getByLabelText("用户名"), "teacher_001");
  await user.type(screen.getByLabelText("密码"), "password-123");
  await user.type(screen.getByLabelText("昵称"), "王老师");
  await user.click(screen.getByRole("button", { name: "注册" }));
  const error = screen.getByText("请先阅读并同意服务条款。");
  expect(error).toHaveAttribute("id", "terms-error");
  expect(screen.getByRole("checkbox", { name: /服务条款/ })).toHaveAttribute("aria-describedby", "terms-error");
  expect(error.closest('[aria-live="polite"]')).toBeNull();
});

it.each([
  ["zh-CN", "用户名", "密码", "登录", /请在 .+ 前完成验证。/u],
  ["en", "Username", "Password", "Log in", /Complete verification before .+\./u],
] as const)("shows clear MFA expiry copy and keeps all six code slots inside the mobile form in %s", async (locale, emailLabel, passwordLabel, loginLabel, expiryCopy) => {
  saveLocalePreference(locale);
  await i18n.changeLanguage(locale);
  window.history.pushState({}, "", "/login");
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({
      mfa: {
        required: true,
        method: "totp",
        challengeId: "challenge-00000001",
        expiresAt: "2026-09-22T12:00:00.000Z",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ));
  const user = userEvent.setup();
  const { container } = render(
    <AppI18nProvider>
      <FloatingAlertProvider>
        <AuthPage path="/login" onNavigate={vi.fn()} />
      </FloatingAlertProvider>
    </AppI18nProvider>,
  );

  await user.type(screen.getByLabelText(emailLabel), "teacher");
  await user.type(screen.getByLabelText(passwordLabel), "password-123");
  await user.click(screen.getByRole("button", { name: loginLabel }));

  expect(await screen.findByText(expiryCopy)).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/挑战|challenge/iu);
  await waitFor(() => {
    expect(container.querySelector('[data-slot="input-otp-group"]')).toBeInTheDocument();
  });
  const group = container.querySelector('[data-slot="input-otp-group"]')!;
  expect(group).toHaveClass("w-full", "min-w-0", "gap-1", "sm:gap-4");
  const slots = group.querySelectorAll('[data-slot="input-otp-slot"]');
  expect(slots).toHaveLength(6);
  slots.forEach((slot) => expect(slot).toHaveClass("size-9", "sm:size-10"));
  // input-otp mirrors the selection on 0/10/50 ms timers; let them finish before jsdom teardown.
  await new Promise((resolve) => window.setTimeout(resolve, 60));
});

it("omits website navigation from login and returns registration to login", async () => {
  const onNavigate = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<AppI18nProvider><AuthPage path="/login" onNavigate={onNavigate} /></AppI18nProvider>);
  expect(screen.queryByRole("button", { name: "返回官网" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "返回登录" })).not.toBeInTheDocument();
  rerender(<AppI18nProvider><AuthPage path="/register" onNavigate={onNavigate} /></AppI18nProvider>);
  await user.click(screen.getByRole("button", { name: "返回登录" }));
  expect(onNavigate).toHaveBeenCalledWith("/login");
});
