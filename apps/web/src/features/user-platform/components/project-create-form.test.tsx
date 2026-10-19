// Covers optional manual backgrounds and the project creation payloads.
import { render, screen, waitFor } from "@testing-library/react";
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
              visibility: "private",
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

  it("chooses a default once and keeps it fixed when typing a project title", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();

    render(<ProjectCreateForm onNavigate={() => {}} />);

    const nameInput = screen.getByLabelText("项目名称");
    expect(nameInput).toHaveValue("");
    const previewSource = screen.getByTestId("project-background-preview-image").getAttribute("src");
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
    await user.clear(nameInput);
    await user.type(nameInput, "质量追溯系统 UML 实验");

    expect(screen.queryByText("质量追溯系统")).not.toBeInTheDocument();
    expect(screen.queryByText("自动匹配")).not.toBeInTheDocument();
    expect(screen.queryByText(/命中：/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "项目背景图" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-background-gallery")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-background-preview-image")).toHaveAttribute("src", previewSource);
  });

  it.each([["仅成员可见", "private"], ["公开可见", "public"]])("submits %s without silently remapping visibility", async (label, value) => {
    const user = userEvent.setup();
    const fetchMock = stubCreateProjectFetch();
    render(<ProjectCreateForm onNavigate={() => {}} />);
    await user.type(screen.getByLabelText("项目名称"), "权限测试");
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.queryByRole("button", { name: "课程班级可见" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: label }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText(label)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(String(call?.[1]?.body));
    expect(payload.visibility).toBe(value);
    for (const field of ["organizationId", "courseId", "classId", "teamId"]) {
      expect(payload).not.toHaveProperty(field);
    }
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("academic-options"))).toBe(false);
    expect(PROJECT_BACKGROUND_OPTIONS.map(({ key }) => key)).toContain(JSON.parse(String(call?.[1]?.body)).backgroundKey);
  });

  it("submits a manual project background selection", async () => {
    const user = userEvent.setup();
    const fetchMock = stubCreateProjectFetch();

    render(<ProjectCreateForm onNavigate={() => {}} />);

    expect(screen.queryByRole("button", { name: /预约预订系统/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /选择背景图/u }));
    const background = await screen.findByRole("button", { name: "选择背景图 19" });
    expect(background).toHaveTextContent("");
    expect(screen.queryByRole("button", { name: "自动匹配" })).not.toBeInTheDocument();
    await user.click(background);
    const previewSource = screen.getByTestId("project-background-preview-image").getAttribute("src");
    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    expect(screen.getByTestId("project-background-preview-image")).toHaveAttribute("src", previewSource);
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: /创建并进入项目/u }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, init]) => {
        const url = new URL(String(input), "http://127.0.0.1:4101");
        return url.pathname === "/api/projects" && init?.method === "POST";
      });
      expect(createCall).toBeTruthy();
      expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
        backgroundKey: "booking",
        projectMode: "standard",
      });
    });
  });

  it("lets users remove a manual background without restoring automatic matching", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();
    render(<ProjectCreateForm onNavigate={() => {}} />);
    await user.type(screen.getByLabelText("项目名称"), "ERP 企业资源计划");
    await user.click(screen.getByRole("button", { name: "选择背景图" }));
    await user.click(await screen.findByRole("button", { name: "选择背景图 1" }));
    expect(screen.getByTestId("project-background-preview-image")).toHaveAttribute("src", expect.stringContaining("cover-01"));
    await user.click(screen.getByRole("button", { name: "选择背景图" }));
    await user.click(await screen.findByRole("button", { name: "不使用背景图" }));
    expect(screen.queryByTestId("project-background-preview-image")).not.toBeInTheDocument();
  });

  it("lets the creator explicitly select professional mode", async () => {
    const user = userEvent.setup(); const fetchMock = stubCreateProjectFetch();
    render(<ProjectCreateForm onNavigate={() => {}} />);
    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.queryByLabelText("项目名称")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body)).projectMode).toBe("professional");
  });

  it("preserves the chosen mode and project details when navigating back", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();
    render(<ProjectCreateForm onNavigate={() => {}} />);
    expect(screen.queryByRole("radio", { name: "快速建模" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    await user.click(screen.getByRole("button", { name: "下一步" }));
    screen.getByRole("radio", { name: "快速建模" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "工程建模" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "上一步" }));
    expect(screen.getByLabelText("项目名称")).toHaveValue("订单系统");
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("radio", { name: "工程建模" })).toBeChecked();
  });

  it("shows a success toast before navigating to the created project", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();
    const onNavigate = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    render(<ProjectCreateForm onNavigate={onNavigate} />);

    await user.type(screen.getByLabelText("项目名称"), "订单系统");
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
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
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    unmount();
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
