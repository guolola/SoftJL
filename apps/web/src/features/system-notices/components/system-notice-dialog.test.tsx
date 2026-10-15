import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import confetti from "canvas-confetti";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemNoticeButton } from "./system-notice-dialog";
import { i18n } from "../../../shared/i18n/i18n";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

const publishedNoticeResponse = {
  generatedAt: "2026-06-05T00:00:00.000Z",
  unreadCount: 2,
  notices: [
    {
      id: "notice-important",
      title: "重要通知：公司主体变更及对公账号更新",
      type: "important",
      icon: "!",
      contentBlocks: [
        { kind: "paragraph", text: "大家好，请注意以下关键信息。" },
        { kind: "list_item", text: "确认新主体信息。" },
      ],
      status: "published",
      publishedAt: "2026-05-22T07:00:00.000Z",
      createdAt: "2026-05-22T07:00:00.000Z",
      updatedAt: "2026-05-22T07:00:00.000Z",
      unread: true,
    },
    {
      id: "notice-model",
      title: "MiniMax M3 模型上线",
      type: "model_update",
      icon: null,
      contentBlocks: [],
      status: "published",
      publishedAt: "2026-06-01T09:00:00.000Z",
      createdAt: "2026-06-01T09:00:00.000Z",
      updatedAt: "2026-06-01T09:00:00.000Z",
      unread: true,
    },
  ],
};

afterEach(() => {
  void i18n.changeLanguage("zh-CN");
  vi.unstubAllGlobals();
  vi.mocked(confetti).mockClear();
});

describe("SystemNoticeButton", () => {
  it("opens the system notice timeline and persists read state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/system-notices/read") && method === "POST") {
        return new Response(
          JSON.stringify({
            ...publishedNoticeResponse,
            unreadCount: 0,
            notices: publishedNoticeResponse.notices.map((notice) => ({
              ...notice,
              unread: false,
            })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/system-notices") && method === "GET") {
        return new Response(JSON.stringify(publishedNoticeResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "unexpected" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<FloatingAlertProvider><SystemNoticeButton className="size-9" /></FloatingAlertProvider>);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "系统通知，2 条未读" }),
      ).toBeInTheDocument();
    });
    const unreadDot = screen.getByRole("button", { name: "系统通知，2 条未读" })
      .querySelector("[data-slot='notification-unread-dot']");
    expect(screen.getByRole("button", { name: "系统通知，2 条未读" })).toHaveClass("size-9");
    expect(unreadDot).toHaveClass(
      "right-0.5",
      "top-1",
      "animate-bounce",
      "bg-sky-600",
      "dark:bg-sky-400",
      "motion-reduce:animate-none",
    );
    expect(screen.queryByRole("button", { name: "后台通知配置" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "系统通知，2 条未读" }));

    expect(await screen.findByRole("dialog", { name: "系统通知" })).toBeInTheDocument();
    expect(screen.getByText("MiniMax M3 模型上线")).toBeInTheDocument();
    expect(screen.getByText("确认新主体信息。")).toBeInTheDocument();
    expect(screen.getByText("重要")).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByText("模型")).toHaveAttribute("data-variant", "secondary");
    const dots = screen.getAllByTestId("system-notice-dot");
    expect(dots.find((dot) => dot.dataset.noticeType === "important")).toHaveClass("bg-destructive");
    expect(dots.find((dot) => dot.dataset.noticeType === "model_update")).toHaveClass("bg-info");

    await user.click(screen.getByRole("button", { name: "已阅览" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "系统通知" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "系统通知" }).querySelector("[data-slot='notification-unread-dot']")).toBeNull();
    expect(confetti).toHaveBeenCalledTimes(5);
    expect(confetti).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        origin: { y: 0.7 },
        particleCount: 50,
        spread: 26,
        startVelocity: 55,
      }),
    );
    expect(confetti).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        origin: { y: 0.7 },
        particleCount: 40,
        spread: 60,
      }),
    );
    expect(confetti).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        origin: { y: 0.7 },
        particleCount: 70,
        spread: 100,
        decay: 0.91,
        scalar: 0.8,
      }),
    );
    expect(confetti).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        origin: { y: 0.7 },
        particleCount: 20,
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2,
      }),
    );
    expect(confetti).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        origin: { y: 0.7 },
        particleCount: 20,
        spread: 120,
        startVelocity: 45,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/system-notices/read"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the dialog open and skips confetti when read state fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/system-notices/read") && method === "POST") {
        return new Response(JSON.stringify({ message: "read failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/system-notices") && method === "GET") {
        return new Response(JSON.stringify(publishedNoticeResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "unexpected" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<FloatingAlertProvider><SystemNoticeButton className="size-10" /></FloatingAlertProvider>);

    await screen.findByRole("button", { name: "系统通知，2 条未读" });
    await user.click(screen.getByRole("button", { name: "系统通知，2 条未读" }));
    expect(await screen.findByRole("dialog", { name: "系统通知" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "已阅览" }));

    expect(await screen.findByText("服务暂时不可用，请稍后重试。")).toBeInTheDocument();
    expect(screen.queryByText(/read failed/u)).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "系统通知" })).toBeInTheDocument();
    expect(confetti).not.toHaveBeenCalled();
  });

  it("localizes notice chrome while preserving notice content", async () => {
    await i18n.changeLanguage("en");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify(publishedNoticeResponse),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const user = userEvent.setup();
    render(<FloatingAlertProvider><SystemNoticeButton /></FloatingAlertProvider>);
    await user.click(await screen.findByRole("button", { name: "System notices, 2 unread" }));

    expect(await screen.findByRole("dialog", { name: "System notices" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeInTheDocument();
    expect(screen.getByText("Important")).toBeInTheDocument();
    expect(screen.getByText("重要通知：公司主体变更及对公账号更新")).toBeInTheDocument();
    expect(screen.getByText("大家好，请注意以下关键信息。")).toBeInTheDocument();
  });
});
