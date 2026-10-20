// Covers creation details, automatic default backgrounds, and submission guards.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { floatingAlert as toast } from "../../../shared/ui/floating-alert";
import { ProjectCreateForm } from "./project-create-form";
import { PROJECT_BACKGROUND_OPTIONS } from "../lib/project-backgrounds";

vi.mock("../../../shared/ui/floating-alert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/ui/floating-alert")>();
  return { ...actual, floatingAlert: { ...actual.floatingAlert, success: vi.fn(), error: vi.fn() } };
});

describe("ProjectCreateForm", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  function stubCreateProjectFetch() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/provider-configs") {
        return new Response(JSON.stringify({ providerConfigs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/api/projects" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            project: { projectMode: "professional",
              id: "project-created",
              name: "测试项目",
              description: null,
              status: "active",
              ownerUserId: "owner-user",
              backgroundKey: JSON.parse(String(init.body)).backgroundKey ?? null,
              updatedAt: "2026-06-21T00:00:00.000Z",
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("assigns a default background without showing a background picker during creation", async () => {
    const user = userEvent.setup();
    const fetchMock = stubCreateProjectFetch();
    render(<ProjectCreateForm onNavigate={() => {}} />);

    expect(screen.queryByText("项目背景")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /选择背景图/u })).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-background-preview-image")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建并进入项目" })).toBeDisabled();
    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    await user.type(screen.getByLabelText("项目描述"), "订单管理");
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(String(call?.[1]?.body));
    expect(payload).toMatchObject({ name: "订单系统", description: "订单管理", projectMode: "standard" });
    expect(PROJECT_BACKGROUND_OPTIONS.map(({ key }) => key)).toContain(payload.backgroundKey);
  });

  it("creates invitation-only projects without visibility or hierarchy settings", async () => {
    const user = userEvent.setup();
    const fetchMock = stubCreateProjectFetch();
    render(<ProjectCreateForm onNavigate={() => {}} />);
    await user.type(screen.getByLabelText("项目名称"), "权限测试");
    expect(screen.queryByRole("button", { name: "课程班级可见" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "可见性" })).not.toBeInTheDocument();
    expect(screen.getByText("项目仅对已加入的成员开放，创建后可邀请协作者。")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(String(call?.[1]?.body));
    expect(payload).not.toHaveProperty("visibility");
    for (const field of ["organizationId", "courseId", "classId", "teamId"]) {
      expect(payload).not.toHaveProperty(field);
    }
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("academic-options"))).toBe(false);
    expect(PROJECT_BACKGROUND_OPTIONS.map(({ key }) => key)).toContain(JSON.parse(String(call?.[1]?.body)).backgroundKey);
  });

  it("guards empty names and duplicate submissions while locking the form during creation", async () => {
    const user = userEvent.setup();
    const fetchMock = stubCreateProjectFetch();
    let finishCreation!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishCreation = resolve; }));
    const { container } = render(<ProjectCreateForm onNavigate={() => {}} />);
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));
    expect(screen.getByLabelText("项目名称")).toBeDisabled();
    expect(screen.getByLabelText("项目描述")).toBeDisabled();
    expect(screen.getByRole("button", { name: "创建并进入项目" })).toBeDisabled();
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finishCreation(new Response(JSON.stringify({ project: {
      id: "project-created", projectMode: "standard", name: "订单系统", description: null,
      status: "active", ownerUserId: "owner-user", updatedAt: "2026-06-21T00:00:00.000Z",
    } }), { status: 201, headers: { "Content-Type": "application/json" } }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("lets the creator explicitly select professional mode", async () => {
    const user = userEvent.setup(); const fetchMock = stubCreateProjectFetch();
    render(<ProjectCreateForm onNavigate={() => {}} />);
    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    expect(screen.getByLabelText("项目名称")).toHaveValue("订单系统");
    expect(screen.getByRole("radio", { name: "快速建模" })).toBeChecked();
    const quickCard = screen.getByRole("radio", { name: "快速建模" }).closest("label")!;
    const engineeringCard = screen.getByRole("radio", { name: "工程建模" }).closest("label")!;
    expect(screen.getByRole("radio", { name: "快速建模" })).toHaveAccessibleDescription("适合初学者和希望快速验证想法的用户。通过对话灵活建模，不进行链路校验。");
    expect(screen.getByRole("radio", { name: "工程建模" })).toHaveAccessibleDescription("适合开展课程设计或工程实践的学生与团队。按规范流程分步建模，校验链路并追踪变更影响，过程更严谨。");
    expect(quickCard.querySelector('[data-project-mode-illustration="chat"]')).toHaveAttribute("aria-hidden", "true");
    expect(engineeringCard.querySelector('[data-project-mode-illustration="beam"]')).toHaveAttribute("aria-hidden", "true");
    // Decorative chat actions must not add form controls inside the mode's label.
    expect(quickCard.querySelectorAll("button, input")).toHaveLength(1);
    expect(engineeringCard.querySelectorAll("button, input")).toHaveLength(1);
    expect(screen.getByText("聊天式")).toBeVisible();
    expect(screen.getByText("工作流式")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "工程建模" }));
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body)).projectMode).toBe("professional");
  });

  it("shows every field together and preserves mode and details while editing", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();
    render(<ProjectCreateForm onNavigate={() => {}} />);
    expect(screen.getByLabelText("项目名称")).toBeVisible();
    expect(screen.getByLabelText("项目描述")).toBeVisible();
    expect(screen.getByRole("radio", { name: "快速建模" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "工程建模" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "创建项目步骤" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一步" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上一步" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    screen.getByRole("radio", { name: "快速建模" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "工程建模" })).toBeChecked();
    await user.type(screen.getByLabelText("项目描述"), "订单管理");
    expect(screen.getByLabelText("项目名称")).toHaveValue("订单系统");
    expect(screen.getByRole("radio", { name: "工程建模" })).toBeChecked();
  });

  it("shows a success toast before navigating to the created project", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();
    const onNavigate = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    render(<ProjectCreateForm onNavigate={onNavigate} />);

    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("项目已创建，正在进入项目。");
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 900);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.queryByText("项目已创建，正在进入项目。")).not.toBeInTheDocument();
  });

  it("does not redirect after the user leaves the creation form", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();
    const onNavigate = vi.fn();
    const { unmount } = render(<ProjectCreateForm onNavigate={onNavigate} />);
    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    unmount();
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
