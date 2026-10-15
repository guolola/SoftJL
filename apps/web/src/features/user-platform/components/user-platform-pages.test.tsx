// Covers authenticated user-platform project drawers and settings behavior at the feature boundary.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { ProjectWorkspaceDrawer } from "./user-platform-pages";
import { ProjectWorkspaceActions } from "../../workspace-shell/components/top-bar";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";

function createRepository(): WorkspaceRepository {
  return {
    loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
    updateRequirementText: vi.fn(async () => {}),
    startRun: vi.fn(),
    subscribeToRun: vi.fn(),
    getRunSnapshot: vi.fn(),
    renderPlantUml: vi.fn(),
    testProviderSettings: vi.fn(async () => ({
      ok: true,
      message: "ok",
      capability: {
        structuredOutputMode: "strict_json",
        supportsJsonSchema: true,
        supportsJsonObject: true,
        modeLabel: "严格 JSON",
      } as const,
    })),
    saveRunHistory: vi.fn(),
    listRunHistory: vi.fn(async () => []),
    restoreRunHistory: vi.fn(async () => null),
    deleteRunHistory: vi.fn(async () => []),
    clearRunHistory: vi.fn(async () => {}),
  };
}

describe("ProjectWorkspaceDrawer", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function projectDrawerRepository(): WorkspaceRepository {
    return createRepository();
  }

  function stubProjectWorkspaceFetch({
    defaultProviderConfigId = "provider-long",
    backgroundKey = null,
    providerConfigs = [{
      id: "provider-long",
      name: "goal-e2e comfly 20260524021222 managed provider with long name",
      provider: "openai-compatible",
      baseUrl: "https://provider.example",
      defaultModel: "gpt-5.5-preview-with-long-model-name",
      allowedModels: [
        "gpt-5.5-preview-with-long-model-name",
        "provider-native-long-model",
      ],
      maskedKey: "********a91f",
      keyPurpose: "course generation",
      status: "active",
      riskState: "low",
      quota: "unlimited",
      createdBy: "admin@example.edu",
      createdAt: "2026-05-22T01:00:00.000Z",
      updatedAt: "2026-05-22T01:00:00.000Z",
      lastUsedAt: null,
      allowlisted: true,
      scopeType: "project",
      scopeId: "project-with-very-long-drawer-values",
    }],
  } = {}) {
    const projectId = "project-with-very-long-drawer-values";
    const longName = "goal-e2e destructive 20260524021222 with extremely long project label";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === `/api/projects/${projectId}`) {
        if ((init?.method ?? "GET") === "DELETE") {
          return new Response(null, { status: 204 });
        }
        if ((init?.method ?? "GET") === "PATCH") {
          const body = JSON.parse(String(init?.body ?? "{}"));
          return new Response(
            JSON.stringify({
              project: {
                id: projectId,
                name: body.name ?? longName,
                description: body.description ?? `${longName} local test project`,
                visibility: body.visibility ?? "private",
                status: "active",
                ownerUserId: "owner-user",
                defaultProviderConfigId: body.defaultProviderConfigId ?? null,
                backgroundKey: body.backgroundKey ?? null,
                retentionPolicy: "manual",
                updatedAt: "2026-05-24T00:00:00.000Z",
                memberCount: 3,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            project: {
              id: projectId,
              name: longName,
              description: `${longName} local test project`,
              visibility: "private",
              status: "active",
              ownerUserId: "owner-user",
              defaultProviderConfigId,
              backgroundKey,
              retentionPolicy: "manual",
              updatedAt: "2026-05-24T00:00:00.000Z",
              memberCount: 3,
            },
            membership: {
              id: "owner-member",
              projectId,
              userId: "owner-user",
              email: "frontend_owner.goal-e2e.20260524021222@example.test",
              displayName: "frontend_owner goal-e2e 20260524021222 extremely long name",
              role: "owner",
              status: "active",
              joinedAt: "2026-05-24T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname === `/api/projects/${projectId}/retention-policy`) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            project: {
              id: projectId,
              retentionPolicy: body.retentionPolicy ?? "manual",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname === `/api/projects/${projectId}/members`) {
        return new Response(
          JSON.stringify({
            members: [
              {
                id: "owner-member",
                projectId,
                userId: "owner-user",
                email: "frontend_owner.goal-e2e.20260524021222@example.test",
                displayName: "frontend_owner goal-e2e 20260524021222 extremely long name",
                role: "owner",
                status: "active",
                joinedAt: "2026-05-24T00:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname === `/api/projects/${projectId}/runs`) {
        return new Response(JSON.stringify({ projectId, runs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === `/api/projects/${projectId}/documents`) {
        return new Response(JSON.stringify({ documents: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === `/api/projects/${projectId}/provider-configs`) {
        return new Response(
          JSON.stringify({
            projectId,
            providerConfigs,
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
    return projectId;
  }

  it("hides read-only project status text while keeping workspace actions", async () => {
    const projectId = stubProjectWorkspaceFetch();

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceActions projectId={projectId} onOpenDrawer={() => {}} />,
        projectDrawerRepository(),
      ),
    );

    expect(screen.getByRole("button", { name: "生成任务" })).toBeInTheDocument();
    for (const name of ["项目设置", "成员", "文档中心"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText("已同步")).not.toBeInTheDocument();
    expect(screen.queryByText("运行中 2")).not.toBeInTheDocument();
    expect(screen.queryByText("项目状态：active")).not.toBeInTheDocument();
    expect(screen.queryByText("文档 0")).not.toBeInTheDocument();
    expect(screen.queryByText(/^owner$/u)).not.toBeInTheDocument();
  });

  it("constrains settings drawer content and does not render project model policy", async () => {
    const projectId = stubProjectWorkspaceFetch();

    render(
      <FloatingAlertProvider>{withWorkspaceProviders(
        <ProjectWorkspaceDrawer
          projectId={projectId}
          activeDrawer="settings"
          onClose={() => {}}
        />,
        projectDrawerRepository(),
      )}</FloatingAlertProvider>,
    );

    const drawer = await screen.findByTestId("project-workspace-drawer");
    const body = await screen.findByTestId("project-workspace-drawer-body");
    expect(screen.getByRole("dialog", { name: "项目设置" })).toBe(drawer);
    expect(document.getElementById(drawer.getAttribute("aria-labelledby") ?? "")).toHaveTextContent("项目设置");
    expect(document.getElementById(drawer.getAttribute("aria-describedby") ?? "")).toHaveTextContent("goal-e2e destructive");
    expect(drawer).toHaveClass("overflow-x-hidden");
    expect(body).toHaveClass("overflow-x-hidden", "min-w-0");
    expect(document.body).not.toHaveAttribute("data-scroll-locked");
    expect(screen.queryByText("默认模型策略")).not.toBeInTheDocument();
    const retentionValue = screen.getByText("手动归档", {
      selector: "[data-slot='select-value']",
    });
    const retentionTrigger = retentionValue.closest("button");
    expect(retentionTrigger).toBeTruthy();
    expect(within(retentionTrigger as HTMLElement).getAllByText("手动归档")).toHaveLength(1);
    expect(screen.queryByText(/openai-compatible/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/gpt-5\.5-preview-with-long-model-name/u)).not.toBeInTheDocument();
  });

  it("saves project settings without writing a project provider policy", async () => {
    const user = userEvent.setup();
    const projectId = stubProjectWorkspaceFetch();

    render(
      <FloatingAlertProvider>{withWorkspaceProviders(
        <ProjectWorkspaceDrawer
          projectId={projectId}
          activeDrawer="settings"
          onClose={() => {}}
        />,
        projectDrawerRepository(),
      )}</FloatingAlertProvider>,
    );

    expect(await screen.findByLabelText("项目信息")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存项目设置" }));

    expect(await screen.findByText("项目设置已保存。")).toBeInTheDocument();
    const fetchMock = vi.mocked(fetch);
    const updateCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      return url.pathname === `/api/projects/${projectId}` && init?.method === "PATCH";
    });
    expect(JSON.parse(String(updateCall?.[1]?.body))).not.toHaveProperty(
      "defaultProviderConfigId",
    );
  });

  it("confirms project deletion with an in-app dialog and leaves the project drawer", async () => {
    const user = userEvent.setup();
    const projectId = stubProjectWorkspaceFetch();
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);

    render(
      <FloatingAlertProvider>{withWorkspaceProviders(
        <ProjectWorkspaceDrawer
          projectId={projectId}
          activeDrawer="settings"
          onClose={onClose}
          onNavigate={onNavigate}
        />,
        projectDrawerRepository(),
      )}</FloatingAlertProvider>,
    );

    await screen.findByLabelText("项目信息");
    await user.click(screen.getByRole("button", { name: "删除项目" }));
    const dialog = await screen.findByRole("dialog", { name: "确认删除项目" });
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(
      vi.mocked(fetch).mock.calls.some(([input, init]) => {
        const url = new URL(String(input), "http://127.0.0.1:4101");
        return url.pathname === `/api/projects/${projectId}` && init?.method === "DELETE";
      }),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "删除项目" }));
    const confirmationDialog = await screen.findByRole("dialog", {
      name: "确认删除项目",
    });
    await user.click(
      within(confirmationDialog).getByRole("button", { name: "确认删除" }),
    );

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining(`/api/projects/${projectId}`),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("/projects");
  });

  it("saves a manual project background from settings", async () => {
    const user = userEvent.setup();
    const projectId = stubProjectWorkspaceFetch();

    render(
      <FloatingAlertProvider>{withWorkspaceProviders(
        <ProjectWorkspaceDrawer
          projectId={projectId}
          activeDrawer="settings"
          onClose={() => {}}
        />,
        projectDrawerRepository(),
      )}</FloatingAlertProvider>,
    );

    expect(screen.queryByRole("button", { name: /质量追溯系统/u })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /选择背景图/u }));
    await user.click(await screen.findByRole("button", { name: /质量追溯系统/u }));
    await user.click(screen.getByRole("button", { name: "保存项目设置" }));
    await screen.findByText("项目设置已保存。");

    const fetchMock = vi.mocked(fetch);
    const updateCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      return url.pathname === `/api/projects/${projectId}` && init?.method === "PATCH";
    });
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      backgroundKey: "quality_traceability",
    });
  });

  it("does not render project default provider controls for unavailable old bindings", async () => {
    const user = userEvent.setup();
    const scopedProjectId = "project-with-very-long-drawer-values";
    const projectId = stubProjectWorkspaceFetch({
      defaultProviderConfigId: "provider-disabled",
      providerConfigs: [
        {
          id: "provider-disabled",
          name: "已禁用 OpenAI 托管配置",
          provider: "openai",
          baseUrl: "https://disabled-provider.example",
          defaultModel: "gpt-5-disabled",
          allowedModels: ["gpt-5-disabled"],
          maskedKey: "********disabled",
          keyPurpose: "disabled generation",
          status: "disabled",
          riskState: "medium",
          quota: "unlimited",
          createdBy: "admin@example.edu",
          createdAt: "2026-05-22T01:00:00.000Z",
          updatedAt: "2026-05-22T01:00:00.000Z",
          lastUsedAt: null,
          allowlisted: true,
          scopeType: "project",
          scopeId: scopedProjectId,
        },
        {
          id: "provider-active",
          name: "可用 OpenAI 托管配置",
          provider: "openai",
          baseUrl: "https://active-provider.example",
          defaultModel: "gpt-5-active",
          allowedModels: ["gpt-5-active"],
          maskedKey: "********active",
          keyPurpose: "active generation",
          status: "active",
          riskState: "low",
          quota: "unlimited",
          createdBy: "admin@example.edu",
          createdAt: "2026-05-22T01:00:00.000Z",
          updatedAt: "2026-05-22T01:00:00.000Z",
          lastUsedAt: null,
          allowlisted: true,
          scopeType: "project",
          scopeId: scopedProjectId,
        },
      ],
    });

    render(
      <FloatingAlertProvider>{withWorkspaceProviders(
        <ProjectWorkspaceDrawer
          projectId={projectId}
          activeDrawer="settings"
          onClose={() => {}}
        />,
        projectDrawerRepository(),
      )}</FloatingAlertProvider>,
    );

    expect(await screen.findByLabelText("项目信息")).toBeInTheDocument();
    expect(screen.queryByText("默认模型策略")).not.toBeInTheDocument();
    expect(screen.queryByText("当前项目默认 Provider 已不可用，保存后将跟随用户默认模型。")).not.toBeInTheDocument();
    expect(screen.queryByText("跟随用户默认模型")).not.toBeInTheDocument();
    expect(screen.queryByText("已禁用 OpenAI 托管配置")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存项目设置" }));
    await screen.findByText("项目设置已保存。");

    const fetchMock = vi.mocked(fetch);
    const updateCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      return url.pathname === `/api/projects/${projectId}` && init?.method === "PATCH";
    });
    expect(JSON.parse(String(updateCall?.[1]?.body))).not.toHaveProperty(
      "defaultProviderConfigId",
    );
  });

  it("constrains member drawer cards and truncates long member identity text", async () => {
    const projectId = stubProjectWorkspaceFetch();

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceDrawer
          projectId={projectId}
          activeDrawer="members"
          onClose={() => {}}
        />,
        projectDrawerRepository(),
      ),
    );

    const body = await screen.findByTestId("project-workspace-drawer-body");
    expect(body).toHaveClass("overflow-x-hidden", "min-w-0");
    const displayName = await screen.findByText(/frontend_owner goal-e2e/u);
    expect(displayName).toHaveClass("truncate");
    expect(displayName.closest("[data-testid='project-member-card']")).toHaveClass(
      "max-w-full",
      "min-w-0",
    );
  });
});
