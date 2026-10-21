// Verifies saved account identities reach both navigation avatars through the live route session.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { DefaultSidebar } from "../../../shared/template/layout/default-sidebar";
import { TopBar } from "../../workspace-shell/components/top-bar";
import { SidebarUserDropdown } from "../../workspace-shell/components/sidebar-user-dropdown";
import { AUTH_SESSION_CHANGED_EVENT, platformApi, type PlatformAccountProfileResponse } from "../services/platform-api";
import { invalidateProviderConfigCache } from "../services/provider-config-cache";
import { AuthenticatedRoute } from "./user-platform-pages";

const profile: PlatformAccountProfileResponse = {
  user: { id: "profile-user", username: "profile_user", displayName: "Original Name", avatarUrl: "/avatars/original.png", status: "active", mfaEnabled: false },
  session: { id: "session-profile", userId: "profile-user", createdAt: "", expiresAt: "", lastSeenAt: "", ipAddress: null, userAgent: null },
};
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function renderNavigation() {
  const onNavigate = vi.fn();
  render(withWorkspaceProviders(
    <AuthenticatedRoute onNavigate={onNavigate} routeKey="/projects" renderLayout={(content) => <>
      <TopBar currentRoute="/projects" onNavigate={onNavigate} />
      <DefaultSidebar footer={<SidebarUserDropdown onOpenAccount={() => {}} onNavigate={onNavigate} />}>
        <span>Navigation</span>
      </DefaultSidebar>
      {content}
    </>}>
      <main data-testid="preserved-page">Current page</main>
    </AuthenticatedRoute>,
  ));
}

async function openProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "账号" }));
  await user.click(await screen.findByRole("menuitem", { name: "账号" }));
  const dialog = await screen.findByRole("dialog", { name: "设置" });
  await user.click(within(dialog).getByRole("tab", { name: "个人资料" }));
  await waitFor(() => expect(within(dialog).getByLabelText("昵称")).toHaveValue(profile.user.displayName));
  return dialog;
}

async function expectNavigationIdentity(name: string, avatarUrl: string) {
  await waitFor(() => {
    const top = document.querySelector<HTMLButtonElement>('header button[aria-label="账号"]')!;
    const sidebar = document.querySelector<HTMLButtonElement>(`[data-slot="sidebar-footer"] button[aria-label="账号：${name}"]`)!;
    expect(top).not.toBeNull();
    expect(sidebar).not.toBeNull();
    for (const trigger of [top, sidebar]) {
      expect(within(trigger).getByRole("img", { name, hidden: true })).toHaveAttribute("src", avatarUrl);
    }
  });
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:avatar-preview");
  URL.revokeObjectURL = vi.fn();
  localStorage.clear();
  invalidateProviderConfigCache();
  vi.spyOn(platformApi, "me").mockResolvedValue(profile);
  vi.spyOn(platformApi, "getAccountProfile").mockResolvedValue(profile);
  vi.spyOn(platformApi, "listAccountSessions").mockResolvedValue({ sessions: [] });
  vi.spyOn(platformApi, "listProviderConfigs").mockResolvedValue({ providerConfigs: [] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ messages: [], notices: [], unreadCount: 0 }))));
  vi.spyOn(window, "Image").mockImplementation(function () {
    const image = document.createElement("img");
    queueMicrotask(() => image.dispatchEvent(new Event("load")));
    return image;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe("account profile navigation sync", () => {
  it("updates both avatars and names after save without another auth check or page remount", async () => {
    const user = userEvent.setup();
    const saved = { ...profile, user: { ...profile.user, displayName: "Updated Name", avatarUrl: "/avatars/momonga-tail-wag.gif" } };
    let finishSave!: (response: PlatformAccountProfileResponse) => void;
    vi.spyOn(platformApi, "updateAccountProfile").mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    renderNavigation();
    const page = await screen.findByTestId("preserved-page");
    const dialog = await openProfile(user);
    await user.clear(within(dialog).getByLabelText("昵称"));
    await user.type(within(dialog).getByLabelText("昵称"), saved.user.displayName);
    await user.click(within(dialog).getByRole("button", { name: "莫莫咖摇尾巴" }));
    await user.click(within(dialog).getByRole("button", { name: "保存资料" }));
    await expectNavigationIdentity(profile.user.displayName, profile.user.avatarUrl!);
    await act(async () => finishSave(saved));
    await expectNavigationIdentity(saved.user.displayName, saved.user.avatarUrl);
    expect(platformApi.me).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("preserved-page")).toBe(page);
    expect(screen.getByRole("dialog", { name: "设置" })).toBe(dialog);
    expect(screen.queryByTestId("auth-check-placeholder")).not.toBeInTheDocument();
  });

  it("uses the uploaded avatar returned by the server in both navigation areas", async () => {
    const user = userEvent.setup();
    const saved = { ...profile, user: { ...profile.user, avatarUrl: "/api/account/avatars/new-upload.gif" } };
    vi.spyOn(platformApi, "updateAccountProfile").mockResolvedValue(profile);
    const upload = vi.spyOn(platformApi, "uploadAccountAvatar").mockResolvedValue(saved);
    const file = new File(["GIF89a"], "new-avatar.gif", { type: "image/gif" });
    renderNavigation();
    const dialog = await openProfile(user);
    await user.upload(within(dialog).getByLabelText("头像图片"), file);
    await user.click(within(dialog).getByRole("button", { name: "保存资料" }));
    await expectNavigationIdentity(saved.user.displayName, saved.user.avatarUrl);
    expect(upload).toHaveBeenCalledWith(file);
    expect(platformApi.me).toHaveBeenCalledTimes(1);
  });

  it("preserves the shared identity when saving fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(platformApi, "updateAccountProfile").mockRejectedValue(new Error("offline"));
    renderNavigation();
    const dialog = await openProfile(user);
    await user.click(within(dialog).getByRole("button", { name: "莫莫咖摇尾巴" }));
    await user.click(within(dialog).getByRole("button", { name: "保存资料" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存资料" })).toBeEnabled());
    await expectNavigationIdentity(profile.user.displayName, profile.user.avatarUrl!);
    expect(platformApi.me).toHaveBeenCalledTimes(1);
  });

  it("keeps the saved avatar when an older auth refresh finishes afterwards", async () => {
    const user = userEvent.setup();
    const saved = { ...profile, user: { ...profile.user, avatarUrl: "/avatars/momonga-tail-wag.gif" } };
    let finishSave!: (response: PlatformAccountProfileResponse) => void;
    let finishAuth!: (response: PlatformAccountProfileResponse) => void;
    vi.spyOn(platformApi, "updateAccountProfile").mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    renderNavigation();
    const dialog = await openProfile(user);
    await user.click(within(dialog).getByRole("button", { name: "莫莫咖摇尾巴" }));
    await user.click(within(dialog).getByRole("button", { name: "保存资料" }));
    vi.mocked(platformApi.me).mockImplementationOnce(() => new Promise((resolve) => { finishAuth = resolve; }));
    act(() => { window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT)); });
    await act(async () => finishSave(saved));
    await expectNavigationIdentity(saved.user.displayName, saved.user.avatarUrl);
    await act(async () => finishAuth(profile));
    await expectNavigationIdentity(saved.user.displayName, saved.user.avatarUrl);
    expect(platformApi.me).toHaveBeenCalledTimes(2);
  });
});
