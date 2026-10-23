// Covers the account-settings member layout, live actions, and permission guards.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withWorkspaceProviders } from "../../../../tests/helpers/workspace-test-utils";
import type { PlatformProject, PlatformProjectMember } from "../services/platform-api";
import { ProjectMembers } from "./project-members";
import { platformApi } from "../services/platform-api";
import * as routeSession from "./authenticated-route-session";
import { createProjectInvitationResponse } from "@test/fixtures/contract-fixtures";

const project: PlatformProject = {
  id: "project-members-test",
  name: "成员测试项目",
  description: null,

  status: "active",
  projectMode: "professional", ownerUserId: "owner-1",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

function owner(id: string, username: string): PlatformProjectMember {
  return {
    id,
    projectId: project.id,
    userId: id,
    username,
    displayName: username,
    role: "owner",
    status: "active",
    joinedAt: "2026-09-22T00:00:00.000Z",
  };
}

describe("ProjectMembers", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.spyOn(platformApi, "searchProjectInvitees").mockResolvedValue({ users: [] });
  });

  it("uses autocomplete-09 to search registered users and invite the selected username", async () => {
    const user = userEvent.setup();
    const search = vi.mocked(platformApi.searchProjectInvitees).mockResolvedValue({ users: [{ id: "alice", username: "alice_user", displayName: "Alice Chen", avatarUrl: null }] });
    const member = { ...owner("alice", "alice_user"), role: "viewer", status: "invited" };
    const invite = vi.spyOn(platformApi, "inviteProjectMember").mockResolvedValue(createProjectInvitationResponse({ id: member.id, username: member.username }));
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[]} membershipRole="owner" />));
    await user.click(await screen.findByRole("button", { name: "邀请新成员" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByRole("combobox", { name: /邀请用户名/u });
    expect(search).not.toHaveBeenCalled();
    await user.type(input, "Alice");
    expect(await screen.findByText("正在搜索用户…")).toBeVisible();
    const option = await screen.findByRole("option", { name: /Alice Chen.*alice_user/u });
    expect(within(option).getByText("AC")).toBeVisible();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(project.id, "Alice");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("alice_user");
    // Tab dismisses the autocomplete popup before reaching the dialog actions.
    await user.tab();
    await user.click(within(dialog).getByRole("button", { name: "发送邀请" }));
    await waitFor(() => expect(invite).toHaveBeenCalledWith(project.id, { username: "alice_user", role: "viewer" }));
  });

  it("ignores stale searches, clears results, and recovers from search errors", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: Awaited<ReturnType<typeof platformApi.searchProjectInvitees>>) => void;
    const search = vi.mocked(platformApi.searchProjectInvitees)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ users: [{ id: "bob", username: "bobby", displayName: "Bob", avatarUrl: null }] });
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[]} membershipRole="owner" />));
    await user.click(await screen.findByRole("button", { name: "邀请新成员" }));
    const input = screen.getByRole("combobox", { name: /邀请用户名/u });
    await user.type(input, "alice");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await user.clear(input);
    await user.type(input, "missing");
    expect(await screen.findByText("搜索用户失败，请重试。")).toBeVisible();
    resolveFirst({ users: [{ id: "old", username: "alice", displayName: "Stale Alice", avatarUrl: null }] });
    await user.clear(input);
    await user.type(input, "bob");
    await user.click(await screen.findByRole("option", { name: /Bob.*bobby/u }));
    expect(input).toHaveValue("bobby");
    expect(screen.queryByText("Stale Alice")).not.toBeInTheDocument();
    const clear = document.querySelector<HTMLButtonElement>("[data-slot='autocomplete-clear']")!;
    await user.click(clear);
    expect(input).toHaveValue("");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.queryByText("搜索用户失败，请重试。")).not.toBeInTheDocument();
  });

  it("shows the demo's empty search status without blocking manual invitation", async () => {
    const user = userEvent.setup();
    const invite = vi.spyOn(platformApi, "inviteProjectMember").mockResolvedValue(createProjectInvitationResponse({ id: "unknown", username: "unknown" }));
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[]} membershipRole="owner" />));
    await user.click(await screen.findByRole("button", { name: "邀请新成员" }));
    const sendButton = screen.getByRole("button", { name: "发送邀请" });
    await user.type(screen.getByRole("combobox", { name: /邀请用户名/u }), "unknown");
    expect(await screen.findByText("未找到与“unknown”匹配的可邀请用户")).toBeVisible();
    // A pointer click outside the open popup still reaches the invitation action.
    await user.click(sendButton);
    await waitFor(() => expect(invite).toHaveBeenCalledWith(project.id, { username: "unknown", role: "viewer" }));
  });

  it("uses the template lists and explains why the sole owner cannot be changed", async () => {
    const user = userEvent.setup();
    const soleOwner = owner("owner-1", "owner");
    render(
      withWorkspaceProviders(
        <ProjectMembers project={project} members={[soleOwner]} membershipRole="owner" layout="drawer" />,
      ),
    );

    expect(await screen.findByRole("heading", { name: "成员" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "待处理邀请" })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("搜索姓名或用户名")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "owner 的角色" })).toBeDisabled();

    const hint = screen.getByLabelText("唯一所有者不可移除，请先转移所有权");
    expect(within(hint).getByRole("button", { name: "管理 owner" })).toBeDisabled();
    await user.hover(hint);
    expect(await screen.findByText("唯一所有者不可移除，请先转移所有权", { selector: "[data-slot='tooltip-content']" })).toBeVisible();
    hint.focus();
    expect(hint).toHaveFocus();
  });

  it("allows a manager to remove an owner when another owner remains", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      withWorkspaceProviders(
        <ProjectMembers
          project={project}
          members={[
            owner("owner-1", "owner_1"),
            owner("owner-2", "owner_2"),
          ]}
          membershipRole="owner"
        />,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "管理 owner_2" }));
    await user.click(await screen.findByRole("menuitem", { name: "移除 owner_2" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/projects/project-members-test/members/owner-2"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("separates joined members from pending and expired invitations without truncating the list", async () => {
    const members = Array.from({ length: 12 }, (_, index) => ({
      ...owner(`member-${index}`, `member-${index}@example.edu`), role: "viewer",
    }));
    const pending = { ...owner("pending", "pending"), userId: "", role: "editor", status: "invited" };
    const expired = { ...pending, id: "expired", username: "expired", displayName: "Expired", status: "expired" };
    const revoked = { ...pending, id: "revoked", username: "revoked", displayName: "Revoked", status: "revoked" };
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[...members, pending, expired, revoked]} membershipRole="owner" />));

    const joinedList = await screen.findByRole("group", { name: "成员" });
    const invitations = screen.getByRole("group", { name: "待处理邀请" });
    expect(within(joinedList).getAllByTestId("project-member-card")).toHaveLength(12);
    expect(within(invitations).getAllByTestId("project-member-card")).toHaveLength(2);
    expect(within(invitations).getByText("已过期")).toBeVisible();
    expect(screen.queryByText("revoked")).not.toBeInTheDocument();
  });

  it("invites by username and shows the server result in pending invitations", async () => {
    const user = userEvent.setup();
    const member = { ...owner("invited", "new"), role: "viewer", status: "invited", userId: "" };
    const invite = vi.spyOn(platformApi, "inviteProjectMember").mockResolvedValue(createProjectInvitationResponse({ id: member.id, username: member.username }));
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[]} membershipRole="owner" />));

    await user.click(await screen.findByRole("button", { name: "邀请新成员" }));
    const dialog = await screen.findByRole("dialog", { name: "邀请成员加入项目" });
    await user.tab();
    await user.click(within(dialog).getByRole("button", { name: "发送邀请" }));
    expect(within(dialog).getByText("请填写邀请用户名。")).toBeVisible();
    expect(invite).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/邀请用户名/u), "new");
    await user.tab();
    await user.click(within(dialog).getByRole("button", { name: "发送邀请" }));
    await waitFor(() => expect(invite).toHaveBeenCalledWith(project.id, { username: "new", role: "viewer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(screen.getByRole("group", { name: "待处理邀请" })).getByRole("button", { name: "管理 new" })).toBeVisible();
  });

  it.each(["has spaces", "ab", "member@", "a".repeat(33)])("rejects invalid username %s without sending a request", async (username) => {
    const user = userEvent.setup();
    const invite = vi.spyOn(platformApi, "inviteProjectMember");
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[]} membershipRole="owner" />));
    await user.click(await screen.findByRole("button", { name: "邀请新成员" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/邀请用户名/u), username);
    await user.tab();
    await user.click(within(dialog).getByRole("button", { name: "发送邀请" }));
    expect(within(dialog).getByText("请输入 3–32 位小写字母、数字或下划线组成的用户名。")).toBeVisible();
    expect(invite).not.toHaveBeenCalled();
    expect(screen.queryByTestId("project-member-card")).not.toBeInTheDocument();
  });

  it("rejects the signed-in user's username before the request even when members have not loaded", async () => {
    const user = userEvent.setup();
    vi.spyOn(routeSession, "useAuthenticatedRouteSession").mockReturnValue({
      mfa: { enabled: false, enforcement: "totp" },
      user: { id: "owner-1", username: "owner", displayName: "Owner", status: "active", mfaEnabled: false },
      session: { id: "session", userId: "owner-1", createdAt: "2026-10-19T00:00:00Z", expiresAt: "2026-10-20T00:00:00Z", lastSeenAt: "2026-10-19T00:00:00Z", ipAddress: null, userAgent: null },
    });
    const invite = vi.spyOn(platformApi, "inviteProjectMember");
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[]} membershipRole="owner" />));
    await user.click(await screen.findByRole("button", { name: "邀请新成员" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/邀请用户名/u), " Owner ");
    await user.tab();
    await user.click(within(dialog).getByRole("button", { name: "发送邀请" }));
    expect(within(dialog).getByText("不能邀请自己的用户名。")).toBeVisible();
    expect(invite).not.toHaveBeenCalled();
  });

  it("blocks duplicate invitations already visible in the member list", async () => {
    const user = userEvent.setup();
    const invite = vi.spyOn(platformApi, "inviteProjectMember");
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[owner("another", "another")]} membershipRole="owner" />));
    await user.click(await screen.findByRole("button", { name: "邀请新成员" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/邀请用户名/u), "Another");
    await user.tab();
    await user.click(within(dialog).getByRole("button", { name: "发送邀请" }));
    expect(within(dialog).getByText("该用户名已在项目中或已有邀请记录，请勿重复邀请。")).toBeVisible();
    expect(invite).not.toHaveBeenCalled();
  });

  it.each([
    ["PROJECT_INVITATION_USER_NOT_REGISTERED", "该用户名尚未注册，请邀请已注册的其他用户。"],
    ["PROJECT_INVITATION_SELF", "不能邀请自己的用户名。"],
    ["PROJECT_INVITATION_ALREADY_EXISTS", "该用户名已在项目中或已有邀请记录，请勿重复邀请。"],
  ])("shows the server's %s error inline and rolls back the pending row", async (code, message) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code, category: "validation", retryable: false } }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[]} membershipRole="owner" />));
    await user.click(await screen.findByRole("button", { name: "邀请新成员" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/邀请用户名/u), " Unknown ");
    await user.tab();
    await user.click(within(dialog).getByRole("button", { name: "发送邀请" }));
    expect(await within(dialog).findByText(message)).toBeVisible();
    expect(within(dialog).getByLabelText(/邀请用户名/u)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByTestId("project-member-card")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/invitations"), expect.objectContaining({ body: JSON.stringify({ username: "unknown", role: "viewer" }) }));
  });

  it("updates a pending role, resends an expired invitation, and removes a revoked invitation from the list", async () => {
    const user = userEvent.setup();
    const member = { ...owner("pending", "pending"), role: "viewer", status: "expired", userId: "" };
    const update = vi.spyOn(platformApi, "updateProjectMemberRole").mockResolvedValue({ member: { ...member, role: "editor" } });
    const resend = vi.spyOn(platformApi, "resendProjectInvitation").mockResolvedValue(createProjectInvitationResponse({ id: member.id, username: member.username, role: "editor" }));
    const revoke = vi.spyOn(platformApi, "revokeProjectInvitation").mockResolvedValue({});
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[member]} membershipRole="owner" />));

    await user.click(await screen.findByRole("combobox", { name: "pending 的角色" }));
    expect(screen.queryByRole("option", { name: "所有者" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "编辑者" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(project.id, "pending", "editor"));
    await user.click(screen.getByRole("button", { name: "管理 pending" }));
    await user.click(await screen.findByRole("menuitem", { name: "重发邀请 pending" }));
    await waitFor(() => expect(resend).toHaveBeenCalledWith(project.id, "pending"));
    await waitFor(() => expect(screen.queryByText("已过期")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "管理 pending" }));
    await user.click(await screen.findByRole("menuitem", { name: "撤销邀请 pending" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(project.id, "pending"));
    await waitFor(() => expect(screen.queryByTestId("project-member-card")).not.toBeInTheDocument());
    expect(screen.getByText("暂无待处理邀请。")).toBeVisible();
  });

  it("keeps member and invitation actions disabled for read-only users", async () => {
    const member = { ...owner("viewer", "viewer"), role: "viewer" };
    const pending = { ...member, id: "pending", username: "pending", status: "invited", userId: "" };
    render(withWorkspaceProviders(<ProjectMembers project={project} members={[member, pending]} membershipRole="viewer" layout="drawer" />));

    expect(await screen.findByText("当前权限为只读，只能查看成员与邀请状态，无法邀请或修改成员角色。")).toBeVisible();
    expect(screen.getByRole("button", { name: "邀请新成员" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "管理 viewer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "管理 pending" })).toBeDisabled();
    for (const select of screen.getAllByRole("combobox")) expect(select).toBeDisabled();
  });
});
