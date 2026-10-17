// Covers project index pagination, sorting, card presentation, and accessible navigation.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedRouteSessionProvider } from "./authenticated-route-session";
import { ProjectsIndexPage } from "./projects-index-page";
import { formatProjectDateTimeMinute } from "../lib/project-presentation";

function mockProjectList(count: number) {
  const projects = Array.from({ length: count }, (_, index) => ({
    id: `project-${index + 1}`,
    name: `项目${String(index + 1).padStart(2, "0")}`,
    visibility: index % 2 === 1 ? "team" : "private",
    status: index < 2 ? "archived" : "active",
    ownerUserId: "owner-user",
    updatedAt: new Date(Date.UTC(2026, 5, index + 1)).toISOString(),
    lastGeneratedAt: new Date(Date.UTC(2026, 5, index + 1)).toISOString(),
  }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ projects }), {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
}

describe("ProjectsIndexPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("paginates sorted cards with page numbers, boundary guards, and working project links", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockProjectList(25);
    render(<ProjectsIndexPage onNavigate={onNavigate} />);

    expect(await screen.findByLabelText("1-12 / 25")).toHaveTextContent("共 25 个项目");
    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(screen.getByRole("heading", { name: "项目25" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "项目13" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByLabelText("13-24 / 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 2 页" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "项目13" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "项目25" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "进入项目 项目13" }));
    expect(onNavigate).toHaveBeenCalledWith("/projects/project-13");

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByLabelText("25-25 / 25")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "项目01" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "上一页" }));
    expect(screen.getByLabelText("13-24 / 25")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "第 1 页" }));
    expect(screen.getByLabelText("1-12 / 25")).toBeInTheDocument();
  });

  it("searches all pages and resets pagination when search, scope, or sort changes", async () => {
    const user = userEvent.setup();
    mockProjectList(30);
    render(<ProjectsIndexPage onNavigate={() => {}} />);
    await screen.findByLabelText("1-12 / 30");
    await user.click(screen.getByRole("button", { name: "第 2 页" }));

    await user.type(screen.getByRole("textbox", { name: "搜索项目" }), "项目0");
    expect(screen.getByLabelText("1-9 / 9")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(9);
    expect(screen.getByRole("heading", { name: "项目01" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "搜索项目" }), "不存在");
    expect(screen.getByRole("heading", { name: "没有匹配的项目" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "pagination" })).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "搜索项目" }));
    expect(screen.getByLabelText("1-12 / 30")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "第 2 页" }));
    await user.click(screen.getByRole("button", { name: "团队项目" }));
    expect(screen.getByLabelText("1-12 / 15")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "项目30" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "项目29" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "第 2 页" }));
    await user.click(screen.getByRole("button", { name: "归档项目" }));
    expect(screen.getByLabelText("1-2 / 2")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "全部项目" }));
    await user.click(screen.getByRole("button", { name: "第 2 页" }));
    await user.click(screen.getByRole("combobox", { name: "排序方式" }));
    await user.click(screen.getByRole("option", { name: "项目名称" }));
    expect(screen.getByLabelText("1-12 / 30")).toBeInTheDocument();
    expect(screen.getAllByRole("article").map((card) => within(card).getByRole("heading").textContent))
      .toEqual(Array.from({ length: 12 }, (_, index) => `项目${String(index + 1).padStart(2, "0")}`));
  });

  it("resets to the first page when changing page size and handles a single remaining page", async () => {
    const user = userEvent.setup();
    mockProjectList(25);
    render(<ProjectsIndexPage onNavigate={() => {}} />);
    await screen.findByLabelText("1-12 / 25");
    await user.click(screen.getByRole("button", { name: "第 3 页" }));
    await user.click(screen.getByRole("combobox", { name: "每页条数" }));
    await user.click(await screen.findByRole("option", { name: "24" }));
    expect(screen.getByLabelText("1-24 / 25")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(24);
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    screen.getByRole("combobox", { name: "每页条数" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "48" }));
    expect(screen.getByLabelText("1-25 / 25")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(25);
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it.each([200, 401, 403, 500])("hides pagination for an empty or inaccessible list (HTTP %s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ projects: [] }), {
      status, headers: { "Content-Type": "application/json" },
    })));
    render(<ProjectsIndexPage onNavigate={() => {}} />);
    if (status === 200) await screen.findByRole("heading", { name: "还没有项目" });
    else await screen.findByRole("alert");
    expect(screen.queryByRole("navigation", { name: "pagination" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("defaults to latest generation and places projects without generations last", async () => {
    const projects = [
      { id: "never-generated", name: "尚未生成", updatedAt: "2026-06-23T00:00:00.000Z", lastGeneratedAt: null },
      { id: "older-generation", name: "较早生成", updatedAt: "2026-06-22T00:00:00.000Z", lastGeneratedAt: "2026-06-20T00:00:00.000Z" },
      { id: "latest-generation", name: "最新生成", updatedAt: "2026-06-21T00:00:00.000Z", lastGeneratedAt: "2026-06-21T00:00:00.000Z" },
    ].map((project) => ({ ...project, visibility: "private", status: "active", ownerUserId: "owner-user" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ projects }), {
      status: 200, headers: { "Content-Type": "application/json" },
    })));

    render(<ProjectsIndexPage onNavigate={() => {}} />);

    await screen.findByRole("heading", { name: "最新生成" });
    expect(screen.getByLabelText("排序方式")).toHaveTextContent("最近生成");
    expect(screen.getAllByRole("article").map((card) => within(card).getByRole("heading").textContent))
      .toEqual(["最新生成", "较早生成", "尚未生成"]);
  });

  it.each([
    ["professional", "工程建模"],
    ["standard", "快速建模"],
  ])("renders %s cards with a named mode icon and no active status label", async (projectMode, modeLabel) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/projects") {
        return new Response(
          JSON.stringify({
            projects: [
              {
                id: "project-booking",
                projectMode,
                name: "课程预约系统",
                description: "用于课程实验的预约项目",
                visibility: "team",
                status: "active",
                ownerUserId: "owner-user",
                ownerDisplayName: "Owner User",
                backgroundKey: "booking",
                updatedAt: "2026-06-21T08:09:30.000Z",
                memberCount: 1,
                memberPreviews: [
                  {
                    id: "member-owner",
                    userId: "owner-user",
                    displayName: "Owner User",
                    role: "owner",
                    status: "active",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthenticatedRouteSessionProvider
        value={{
          user: {
            id: "owner-user",
            email: "owner@example.com",
            username: "owner",
            displayName: "Owner User",
            status: "active",
            emailVerified: true,
            mfaEnabled: false,
          },
          session: {
            id: "session-a",
            userId: "owner-user",
            createdAt: "2026-06-21T00:00:00.000Z",
            expiresAt: "2026-06-28T00:00:00.000Z",
            lastSeenAt: "2026-06-21T00:00:00.000Z",
            ipAddress: "127.0.0.1",
            userAgent: "vitest",
          },
        }}
      >
        <ProjectsIndexPage onNavigate={() => {}} />
      </AuthenticatedRouteSessionProvider>,
    );

    const card = await screen.findByRole("article");
    const filterPanel = screen.getByTestId("projects-filter-panel");
    expect(within(filterPanel).getByRole("group", { name: "项目范围" })).toHaveClass(
      "grid-cols-4",
      "min-w-0",
    );
    expect(within(filterPanel).getByPlaceholderText("搜索项目、成员...").closest('[data-slot="input-group"]')).toHaveClass(
      "min-w-0",
      "flex-1",
    );
    expect(within(filterPanel).getByLabelText("排序方式")).toHaveClass("w-28", "shrink-0");
    expect(card).toHaveAttribute("data-slot", "perspective-card");
    expect(card).toHaveAttribute("data-background-key", "booking");
    expect(within(card).queryByText("进行中")).not.toBeInTheDocument();
    expect(within(card).getByText("用于课程实验的预约项目")).toHaveAttribute("title", "用于课程实验的预约项目");
    expect(within(card).getByText(modeLabel).querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(within(card).getByRole("button", { name: /进入项目/u })).toBeInTheDocument();
    expect(card).toHaveTextContent(`最近更新：${formatProjectDateTimeMinute("2026-06-21T08:09:30.000Z")}`);
    expect(card).not.toHaveTextContent(":30");
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("57_booking"),
    );
    const memberTrigger = within(card).getByLabelText("成员头像 Owner User");
    expect(memberTrigger).toHaveAttribute("tabindex", "0");
    await userEvent.hover(memberTrigger);
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Owner User")).toBeInTheDocument();
    expect(within(tooltip).getByText("所有者")).toBeInTheDocument();
  });
});
