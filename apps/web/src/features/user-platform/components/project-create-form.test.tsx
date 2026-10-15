// Covers project creation background auto matching and manual selection payloads.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { floatingAlert as toast } from "../../../shared/ui/floating-alert";
import { ProjectCreateForm } from "./project-create-form";

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
      if (url.pathname === "/api/academic-options") {
        return new Response(
          JSON.stringify({ organizations: [], courses: [], classes: [], teams: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname === "/api/provider-configs") {
        return new Response(JSON.stringify({ providerConfigs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/api/projects" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            project: {
              id: "project-created",
              name: "测试项目",
              description: null,
              visibility: "team",
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

  it("updates automatic background matching from the project title", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();

    render(<ProjectCreateForm onNavigate={() => {}} />);

    const nameInput = screen.getByLabelText("项目名称");
    await user.clear(nameInput);
    await user.type(nameInput, "质量追溯系统 UML 实验");

    expect(await screen.findByText("质量追溯系统")).toBeInTheDocument();
    expect(screen.queryByText("自动匹配")).not.toBeInTheDocument();
    expect(screen.queryByText(/命中：/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "项目背景图" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-background-gallery")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("project-background-preview-image")).toHaveLength(1);
  });

  it("submits a manual project background selection", async () => {
    const user = userEvent.setup();
    const fetchMock = stubCreateProjectFetch();

    render(<ProjectCreateForm onNavigate={() => {}} />);

    expect(screen.queryByRole("button", { name: /预约预订系统/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /选择背景图/u }));
    await user.click(await screen.findByRole("button", { name: /预约预订系统/u }));
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
      });
    });
  });

  it("shows a success toast before navigating to the created project", async () => {
    const user = userEvent.setup();
    stubCreateProjectFetch();
    const onNavigate = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    render(<ProjectCreateForm onNavigate={onNavigate} />);

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
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "下一步" }));
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    unmount();
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
