// Verifies the uploaded dropdown's layout and its real inbox/announcement interactions.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InboxMessage, SystemNoticeDto } from "@uml-platform/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemNoticeButton } from "./system-notice-dialog";
import { inboxApi } from "../inbox-api";
import { systemNoticeApi } from "../system-notice-api";
import { i18n } from "../../../shared/i18n/i18n";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";

vi.mock("../inbox-api", () => ({ inboxApi: { list: vi.fn(), act: vi.fn() } }));
vi.mock("../system-notice-api", () => ({ systemNoticeApi: { listPublished: vi.fn(), markRead: vi.fn(), dismiss: vi.fn() } }));

const invitation: InboxMessage = {
  id: "project:invitation-1", invitationId: "invitation-1", kind: "project",
  sender: { username: "owner_user", displayName: "项目负责人", avatarUrl: null },
  project: { id: "project-1", name: "课程实验" }, role: "member",
  status: "pending", createdAt: "2026-10-19T00:00:00.000Z", unread: true,
};
const notices: SystemNoticeDto[] = [
  { id: "notice-1", title: "平台维护公告", type: "important", icon: "!", status: "published",
    contentBlocks: [{ kind: "paragraph", text: "第一条公告的完整内容。" }],
    publishedAt: "2026-10-18T00:00:00.000Z", createdAt: "2026-10-18T00:00:00.000Z", updatedAt: "2026-10-18T00:00:00.000Z", unread: true },
  { id: "notice-2", title: "模型更新公告", type: "model_update", icon: null, status: "published",
    contentBlocks: [{ kind: "paragraph", text: "第二条公告的独立内容。" }],
    publishedAt: "2026-10-19T00:00:00.000Z", createdAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z", unread: true },
];
const noticeResponse = (items = notices) => ({ generatedAt: "2026-10-19T00:00:00.000Z", unreadCount: items.filter(item => item.unread).length, notices: items });

beforeEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage("zh-CN");
  vi.mocked(inboxApi.list).mockResolvedValue({ messages: [invitation], unreadCount: 1 });
  vi.mocked(systemNoticeApi.listPublished).mockResolvedValue(noticeResponse());
  vi.mocked(systemNoticeApi.markRead).mockImplementation(async ids => noticeResponse(notices.map(notice => ({ ...notice, unread: !ids?.includes(notice.id) }))));
  vi.mocked(systemNoticeApi.dismiss).mockImplementation(async id => noticeResponse(notices.filter(notice => notice.id !== id)));
  vi.mocked(inboxApi.act).mockImplementation(async (message, action) => ({
    messages: action === "dismiss" ? [] : [{ ...message, unread: false, status: action === "accept" ? "accepted" : action === "decline" ? "declined" : message.status }], unreadCount: 0,
  }));
});

async function openNotifications() {
  const user = userEvent.setup();
  render(<FloatingAlertProvider><SystemNoticeButton className="size-9" /></FloatingAlertProvider>);
  await user.click(await screen.findByRole("button", { name: "系统通知，3 条未读" }));
  await screen.findByRole("tab", { name: "消息" });
  return user;
}

describe("uploaded notification dropdown", () => {
  it("translates the two tabs as Messages and Announcements in English", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();
    render(<FloatingAlertProvider><SystemNoticeButton /></FloatingAlertProvider>);
    await user.click(await screen.findByRole("button", { name: "System notices, 3 unread" }));
    expect(await screen.findByRole("tab", { name: "Messages" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Announcements" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Inbox|General/u })).not.toBeInTheDocument();
  });

  it("uses the original menu, line tabs, separators and invitation row spacing", async () => {
    await openNotifications();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("平台维护公告")).not.toBeInTheDocument();
  });

  it.each([["接受", "accept", "已接受"], ["拒绝", "decline", "已拒绝"]] as const)("sends %s once without activating the parent message", async (label, action, status) => {
    const user = await openNotifications();
    await user.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByText(status)).toBeInTheDocument();
    expect(inboxApi.act).toHaveBeenCalledExactlyOnceWith(invitation, action);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "接受" })).not.toBeInTheDocument();
    if (action === "accept") expect(screen.getByRole("link", { name: "打开项目" })).toHaveAttribute("href", "/projects/project-1");
    await user.click(screen.getByRole("button", { name: "移除消息：课程实验" }));
    expect(await screen.findByText("暂无消息。")).toBeInTheDocument();
    expect(vi.mocked(inboxApi.act).mock.calls.at(-1)?.[1]).toBe("dismiss");
  });

  it("uses a refresh icon and reloads both feeds without closing the dropdown", async () => {
    const user = await openNotifications();
    const refresh = screen.getByRole("button", { name: "刷新" });
    await waitFor(() => expect(refresh).toBeEnabled());
    expect(refresh.querySelector(".lucide-refresh-cw")).not.toBeNull();
    expect(refresh.querySelector(".lucide-settings")).toBeNull();
    vi.mocked(inboxApi.list).mockClear().mockResolvedValue({ messages: [], unreadCount: 0 });
    vi.mocked(systemNoticeApi.listPublished).mockClear().mockResolvedValue(noticeResponse([{ ...notices[0]!, title: "刷新后的公告", unread: false }]));
    await user.click(refresh);
    expect(await screen.findByText("暂无消息。")).toBeInTheDocument();
    expect(inboxApi.list).toHaveBeenCalledTimes(1);
    expect(systemNoticeApi.listPublished).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "系统通知" }).querySelector("[data-slot='notification-unread-dot']")).toBeNull();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "公告" }));
    expect(screen.getByText("刷新后的公告")).toBeInTheDocument();
  });

  it("opens only the selected announcement and marks only that announcement read", async () => {
    const user = await openNotifications();
    await user.click(screen.getByRole("tab", { name: "公告" }));
    expect(screen.queryByTestId("inbox-message")).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /平台维护公告/ }));
    const dialog = await screen.findByRole("dialog", { name: "平台维护公告" });
    expect(within(dialog).getByText("第一条公告的完整内容。")).toBeInTheDocument();
    expect(within(dialog).queryByText("第二条公告的独立内容。")).not.toBeInTheDocument();
    expect(systemNoticeApi.markRead).toHaveBeenCalledExactlyOnceWith(["notice-1"]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("dismisses an announcement without opening it, and keeps it hidden on refresh", async () => {
    const user = await openNotifications();
    await user.click(screen.getByRole("tab", { name: "公告" }));
    await user.click(screen.getByRole("button", { name: "移除公告：平台维护公告" }));
    await waitFor(() => expect(screen.queryByText("平台维护公告")).not.toBeInTheDocument());
    expect(systemNoticeApi.dismiss).toHaveBeenCalledExactlyOnceWith("notice-1");
    expect(systemNoticeApi.markRead).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    vi.mocked(systemNoticeApi.listPublished).mockResolvedValue(noticeResponse([notices[1]!]));
    await user.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled());
    expect(screen.queryByText("平台维护公告")).not.toBeInTheDocument();
    expect(screen.getByText("模型更新公告")).toBeInTheDocument();
  });

  it("does not reinsert a dismissed announcement when an earlier refresh finishes late", async () => {
    const user = await openNotifications();
    await user.click(screen.getByRole("tab", { name: "公告" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled());
    let finishRefresh!: (value: ReturnType<typeof noticeResponse>) => void;
    vi.mocked(systemNoticeApi.listPublished).mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    await user.click(screen.getByRole("button", { name: "刷新" }));
    await user.click(screen.getByRole("button", { name: "移除公告：平台维护公告" }));
    await waitFor(() => expect(screen.queryByText("平台维护公告")).not.toBeInTheDocument());
    await act(async () => { finishRefresh(noticeResponse()); });
    expect(screen.queryByText("平台维护公告")).not.toBeInTheDocument();
    expect(screen.getByText("模型更新公告")).toBeInTheDocument();
  });

  it("retains an announcement and reports the error if dismissal fails", async () => {
    vi.mocked(systemNoticeApi.dismiss).mockRejectedValue(new Error("dismiss failed"));
    const user = await openNotifications();
    await user.click(screen.getByRole("tab", { name: "公告" }));
    await user.click(screen.getByRole("button", { name: "移除公告：平台维护公告" }));
    expect(await screen.findByText("操作失败，请重试。")).toBeInTheDocument();
    expect(screen.getByText("平台维护公告")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps announcement access when inbox loading fails", async () => {
    vi.mocked(inboxApi.list).mockRejectedValue(new Error("inbox unavailable"));
    const user = userEvent.setup();
    render(<FloatingAlertProvider><SystemNoticeButton /></FloatingAlertProvider>);
    await user.click(await screen.findByRole("button", { name: "系统通知，2 条未读" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "公告" }));
    expect(screen.getByText("平台维护公告")).toBeInTheDocument();
    expect(screen.queryByText("inbox unavailable")).not.toBeInTheDocument();
  });

  it("keeps the selected announcement open if persisting its read state fails", async () => {
    vi.mocked(systemNoticeApi.markRead).mockRejectedValue(new Error("read failed"));
    const user = await openNotifications();
    await user.click(screen.getByRole("tab", { name: "公告" }));
    await user.click(screen.getByRole("menuitem", { name: /模型更新公告/ }));
    expect(await screen.findByRole("dialog", { name: "模型更新公告" })).toBeInTheDocument();
    await waitFor(() => expect(systemNoticeApi.markRead).toHaveBeenCalledWith(["notice-2"]));
    expect(screen.getByText("第二条公告的独立内容。")).toBeInTheDocument();
  });
});
