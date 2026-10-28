// Covers project index pagination, sorting, card presentation, and accessible navigation.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedRouteSessionProvider } from "./authenticated-route-session";
import { ProjectsIndexPage } from "./projects-index-page";
import { formatProjectDateTimeMinute } from "../lib/project-presentation";

// Real layout/exit animation is covered in the browser; JSDOM has no animation completion events.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, AnimatePresence: ({ children }) => children };
});

function mockProjectList(count: number) {
  const projects = Array.from({ length: count }, (_, index) => ({ projectMode: index % 3 === 0 ? "standard" : "professional",
    id: `project-${index + 1}`,
    name: `项目${String(index + 1).padStart(2, "0")}`,
    memberCount: index % 2 === 1 ? 2 : 1,
    status: index < 2 ? "archived" : "active",
    ownerUserId: "owner-user",
    updatedAt: new Date(Date.UTC(2026, 5, index + 1)).toISOString(),
    lastGeneratedAt: new Date(Date.UTC(2026, 5, index + 1)).toISOString(),
  }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ projects }), {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
}

function projectCards() {
  return within(screen.getByTestId("projects-card-grid")).getAllByRole("button");
}

describe("ProjectsIndexPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves the Aceternity hover background between cards without opening a project", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockProjectList(3);
    render(<ProjectsIndexPage onNavigate={onNavigate} />);
    const grid = await screen.findByTestId("projects-card-grid");
    const [first, second] = projectCards();
    const background = () => grid.querySelector<HTMLSpanElement>('[data-slot="card-hover-background"]');

    expect(background()).not.toBeInTheDocument();
    await user.hover(first);
    expect(first.parentElement).toContainElement(background());
    expect(background()).toHaveAttribute("aria-hidden", "true");
    // Moving through the grid gap must not unmount the shared background before the next card enters.
    const firstBackground = background();
    fireEvent.mouseOut(first, { relatedTarget: grid });
    expect(background()).toBe(firstBackground);
    await user.hover(second);
    expect(second.parentElement).toContainElement(background());
    expect(first.parentElement).not.toContainElement(background());
    expect(grid.querySelectorAll('[data-slot="card-hover-background"]')).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
    await user.unhover(second);
    expect(background()).not.toBeInTheDocument();

    first.focus();
    await waitFor(() => expect(first.parentElement).toContainElement(background()));
    await user.tab();
    expect(second).toHaveFocus();
    expect(second.parentElement).toContainElement(background());
  });

  it("clears the hover background when pagination replaces the cards", async () => {
    const user = userEvent.setup();
    mockProjectList(13);
    render(<ProjectsIndexPage onNavigate={() => {}} />);
    const grid = await screen.findByTestId("projects-card-grid");
    await user.hover(projectCards()[0]);
    expect(grid.querySelector('[data-slot="card-hover-background"]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    const nextGrid = screen.getByTestId("projects-card-grid");
    expect(projectCards()).toHaveLength(1);
    expect(nextGrid.querySelector('[data-slot="card-hover-background"]')).not.toBeInTheDocument();
  });

  it.each([0, 15])("reserves only an existing scrollbar and restores page styles on close and unmount (%spx)", async (scrollbarWidth) => {
    mockProjectList(1);
    const root = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    const previousGutter = root.style.scrollbarGutter;
    const widthSpy = vi.spyOn(root, "clientWidth", "get").mockReturnValue(window.innerWidth - scrollbarWidth);
    const user = userEvent.setup();
    const view = render(<ProjectsIndexPage onNavigate={() => {}} />);
    try {
      const trigger = await screen.findByRole("button", { name: "查看项目 项目01" });
      await user.click(trigger);
      expect(document.body.style.overflow).toBe("hidden");
      expect(root.style.scrollbarGutter).toBe(scrollbarWidth ? "stable" : previousGutter);
      await user.keyboard("{Escape}");
      expect(document.body.style.overflow).toBe(previousOverflow);
      expect(root.style.scrollbarGutter).toBe(previousGutter);
      expect(trigger).toHaveFocus();
      await user.click(trigger);
      view.unmount();
      expect(document.body.style.overflow).toBe(previousOverflow);
      expect(root.style.scrollbarGutter).toBe(previousGutter);
    } finally {
      view.unmount();
      widthSpy.mockRestore();
      document.body.style.overflow = previousOverflow;
      root.style.scrollbarGutter = previousGutter;
    }
  });

  it("paginates sorted cards with page numbers, boundary guards, and working project links", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockProjectList(25);
    render(<ProjectsIndexPage onNavigate={onNavigate} />);

    expect(await screen.findByLabelText("1-12 / 25")).toHaveTextContent("共 25 个项目");
    expect(projectCards()).toHaveLength(12);
    expect(screen.getByRole("heading", { name: "项目25" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "项目13" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByLabelText("13-24 / 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 2 页" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "项目13" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "项目25" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看项目 项目13" }));
    const preview = await screen.findByRole("dialog", { name: "项目13" });
    expect(onNavigate).not.toHaveBeenCalled();
    await user.click(within(preview).getByRole("link", { name: "进入项目 项目13" }));
    expect(onNavigate).toHaveBeenCalledWith("/projects/project-13");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByLabelText("25-25 / 25")).toBeInTheDocument();
    expect(projectCards()).toHaveLength(1);
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
    expect(projectCards()).toHaveLength(9);
    expect(screen.getByRole("heading", { name: "项目01" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "搜索项目" }), "不存在");
    expect(screen.queryByRole("heading", { name: "没有匹配的项目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^查看项目 / })).not.toBeInTheDocument();
    expect(screen.getByTestId("projects-filter-panel")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "pagination" })).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "搜索项目" }));
    expect(screen.getByLabelText("1-12 / 30")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "第 2 页" }));
    await user.click(screen.getByRole("button", { name: "协作项目" }));
    expect(screen.getByLabelText("1-12 / 15")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "项目30" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "项目29" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "第 2 页" }));
    await user.click(screen.getByRole("button", { name: "快速项目" }));
    expect(screen.getByLabelText("1-10 / 10")).toBeInTheDocument();
    expect(projectCards()).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: "工程项目" }));
    expect(screen.getByLabelText("1-12 / 20")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "全部项目" }));
    await user.click(screen.getByRole("button", { name: "第 2 页" }));
    await user.click(screen.getByRole("combobox", { name: "排序方式" }));
    await user.click(await screen.findByRole("option", { name: "项目名称" }));
    expect(screen.getByLabelText("1-12 / 30")).toBeInTheDocument();
    expect(projectCards().map((card) => within(card).getByRole("heading").textContent))
      .toEqual(Array.from({ length: 12 }, (_, index) => `项目${String(index + 1).padStart(2, "0")}`));
  });

  it("filters project modes independently from collaboration and keeps archived projects accessible", async () => {
    const user = userEvent.setup();
    mockProjectList(6);
    render(<ProjectsIndexPage onNavigate={() => {}} />);
    await screen.findByLabelText("1-6 / 6");
    const filters = within(screen.getByTestId("projects-filter-panel"));
    expect(filters.getAllByRole("button").filter(button => button.hasAttribute("aria-pressed"))
      .map(button => button.getAttribute("aria-label")))
      .toEqual(["全部项目", "快速项目", "工程项目", "协作项目"]);

    for (const [filter, names] of [
      ["快速项目", ["项目04", "项目01"]],
      ["工程项目", ["项目06", "项目05", "项目03", "项目02"]],
      ["协作项目", ["项目06", "项目04", "项目02"]],
      ["全部项目", ["项目06", "项目05", "项目04", "项目03", "项目02", "项目01"]],
    ] as const) {
      await user.click(filters.getByRole("button", { name: filter }));
      expect(filters.getByRole("button", { name: filter })).toHaveAttribute("aria-pressed", "true");
      expect(projectCards().map(card => within(card).getByRole("heading").textContent)).toEqual(names);
    }
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
    expect(projectCards()).toHaveLength(24);
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(projectCards()).toHaveLength(1);
    screen.getByRole("combobox", { name: "每页条数" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("option", { name: "48" }));
    expect(screen.getByLabelText("1-25 / 25")).toBeInTheDocument();
    expect(projectCards()).toHaveLength(25);
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it.each([200, 401, 403, 500])("hides pagination for an empty or inaccessible list (HTTP %s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ projects: [] }), {
      status, headers: { "Content-Type": "application/json" },
    })));
    render(<ProjectsIndexPage onNavigate={() => {}} />);
    if (status === 200) await screen.findByRole("heading", { name: "从一句需求到完整的工程交付" });
    else await screen.findByRole("alert");
    expect(screen.queryByRole("navigation", { name: "pagination" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^查看项目 / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看引导" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "还没有项目" })).not.toBeInTheDocument();
    if (status !== 200) {
      expect(screen.queryByRole("heading", { name: "从一句需求到完整的工程交付" })).not.toBeInTheDocument();
    }
  });

  it("shows the platform overview bento for an empty workspace and keeps header project creation available", async () => {
    mockProjectList(0);
    render(<ProjectsIndexPage onNavigate={() => {}} />);
    await screen.findByRole("heading", { name: "从一句需求到完整的工程交付" });
    expect(screen.queryByText("Features")).not.toBeInTheDocument();
    expect(screen.getByText("变更影响追踪")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "三步开始第一个项目" })).toBeInTheDocument();
    expect(screen.getByAltText("整理后的需求页面")).toHaveAttribute("src", "/marketing/empty-projects/requirements-before.svg");
    expect(screen.getByText("阅读快速开始").closest("a")).toHaveAttribute("href", "/tutorial?article=quick-start");
    expect(screen.queryByRole("button", { name: "创建第一个项目" })).not.toBeInTheDocument();
    const createButton = screen.getByRole("button", { name: "新建项目" });
    await userEvent.click(createButton);
    expect(await screen.findByRole("dialog", { name: "创建项目" })).toBeInTheDocument();
  });

  it("defaults to latest generation and places projects without generations last", async () => {
    const projects = [
      { id: "never-generated", name: "尚未生成", updatedAt: "2026-06-23T00:00:00.000Z", lastGeneratedAt: null },
      { id: "older-generation", name: "较早生成", updatedAt: "2026-06-22T00:00:00.000Z", lastGeneratedAt: "2026-06-20T00:00:00.000Z" },
      { id: "latest-generation", name: "最新生成", updatedAt: "2026-06-21T00:00:00.000Z", lastGeneratedAt: "2026-06-21T00:00:00.000Z" },
    ].map((project) => ({ ...project,  status: "active", ownerUserId: "owner-user" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ projects }), {
      status: 200, headers: { "Content-Type": "application/json" },
    })));

    render(<ProjectsIndexPage onNavigate={() => {}} />);

    await screen.findByRole("heading", { name: "最新生成" });
    expect(screen.getByLabelText("排序方式")).toHaveTextContent("最近生成");
    expect(projectCards().map((card) => within(card).getByRole("heading").textContent))
      .toEqual(["最新生成", "较早生成", "尚未生成"]);
  });

  it.each([
    ["professional", "工程建模"],
    ["standard", "快速建模"],
  ])("expands a %s project cover into its full details and restores focus on close", async (projectMode, modeLabel) => {
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
          mfa: { enabled: false, enforcement: "totp" },
          user: {
            id: "owner-user",
            username: "owner",
            displayName: "Owner User",
            status: "active",
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

    const card = await screen.findByRole("button", { name: "查看项目 课程预约系统" });
    expect(card).toHaveAttribute("data-background-key", "booking");
    expect(within(card).queryByText(modeLabel)).not.toBeInTheDocument();
    expect(within(card).getByText("用于课程实验的预约项目")).toHaveAttribute("title", "用于课程实验的预约项目");
    expect(within(card).queryByRole("button", { name: "进入项目 课程预约系统" })).not.toBeInTheDocument();
    const trigger = card;
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const preview = await screen.findByRole("dialog", { name: "课程预约系统" });
    expect(within(preview).getByText(modeLabel).querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    const modeBadge = within(preview).getByText(modeLabel);
    const ownerRow = within(preview).getByText("负责人：Owner User").closest("p")!;
    expect(modeBadge.parentElement).toBe(ownerRow.parentElement);
    expect(modeBadge.compareDocumentPosition(ownerRow) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    const projectEntry = within(preview).getByRole("link", { name: "进入项目 课程预约系统" });
    expect(preview).toHaveTextContent(`最近更新：${formatProjectDateTimeMinute("2026-06-21T08:09:30.000Z")}`);
    for (const label of ["负责人：Owner User", "1 位成员", `最近更新：${formatProjectDateTimeMinute("2026-06-21T08:09:30.000Z")}`]) {
      expect(within(preview).getByText(label).closest("p")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
    expect(preview.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("cover-19"),
    );
    const memberTrigger = within(preview).getByLabelText("成员头像 Owner User");
    expect(projectEntry.parentElement).toContainElement(memberTrigger);
    expect(memberTrigger).toHaveAttribute("tabindex", "0");
    await userEvent.hover(memberTrigger);
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Owner User")).toBeInTheDocument();
    expect(within(tooltip).getByText("所有者")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
