// Verifies top bar navigation, run controls, theme toggles, and account/project menus.
import { installReactFlowTestLayout } from '../../../../tests/helpers/react-flow-test-layout';
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository/index";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import {
  createRunSnapshot,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../../tests/helpers/workspace-test-utils";
import { LineageGraphPage } from "../../lineage/components/lineage-graph-page";
import { snapshotInputFingerprint } from "../../../shared/lib/fingerprint";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  ProjectGenerationTasksDrawerContent,
  ProjectWorkspaceActions,
  TopBar,
} from "./top-bar";

installReactFlowTestLayout();

const { toastMessage, toastSuccess, toastError } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../../../shared/ui/floating-alert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/ui/floating-alert")>();
  return {
    ...actual,
    floatingAlert: {
      ...actual.floatingAlert,
      message: toastMessage,
      success: toastSuccess,
      error: toastError,
    },
  };
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function storeManagedUserSettings() {
  localStorage.setItem(
    "uml-lab-settings",
    JSON.stringify({
      providerConfigId: "provider-config-1",
      defaultModel: "gpt-5.5",
      providerModelOptions: ["gpt-5.5"],
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

function TopBarHarness({
  currentRoute = "/projects/library-booking",
  onNavigate = () => {},
}: {
  currentRoute?: string;
  onNavigate?: (route: string) => void;
}) {
  return (
    <>
      <TopBar currentRoute={currentRoute} onNavigate={onNavigate} />
      <main>主内容保持不变</main>
    </>
  );
}

function TopBarWithTabsHarness({
  onNavigate,
}: {
  onNavigate: (route: string) => void;
}) {
  return (
    <>
      <TopBar currentRoute="/projects/library-booking" onNavigate={onNavigate} />
    </>
  );
}

function TopBarTaskHarness() {
  const { generateRules } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />
      <ProjectGenerationTasksDrawerContent />
      <button type="button" onClick={() => void generateRules()}>
        开始测试任务
      </button>
    </>
  );
}

function TopBarTaskWithProjectRunsHarness({
  projectRuns,
}: {
  projectRuns: PlatformRunSummary[];
}) {
  const { generateRules } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions
        projectId="library-booking"
        projectRuns={projectRuns}
        onOpenDrawer={() => {}}
      />
      <ProjectGenerationTasksDrawerContent projectRuns={projectRuns} />
      <button type="button" onClick={() => void generateRules()}>
        开始测试任务
      </button>
    </>
  );
}

function TopBarDiagramTaskHarness() {
  const { generateDiagrams } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />
      <ProjectGenerationTasksDrawerContent />
      <button
        type="button"
        onClick={() => void generateDiagrams(["usecase", "class", "activity"])}
      >
        开始模型任务
      </button>
    </>
  );
}

function TopBarAnalysisTaskHarness() {
  const { generateDiagrams } = useWorkspaceSession();
  return (
    <>
      <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />
      <ProjectGenerationTasksDrawerContent />
      <button type="button" onClick={() => void generateDiagrams(["analysis"])}>
        开始分析模型任务
      </button>
    </>
  );
}

function LineageGraphOnlyHarness() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>链路图</button>
    {open && <LineageGraphPage onViewArtifact={() => setOpen(false)} />}
  </>;
}

function LineageRerunArtifactHarness() {
  const { generateDiagrams } = useWorkspaceSession();
  return (
    <>
      <LineageGraphOnlyHarness />
      <button type="button" onClick={() => void generateDiagrams(["usecase"])}>
        重新生成用例模型
      </button>
    </>
  );
}

describe("TopBar", () => {
  beforeEach(() => {
    storeManagedUserSettings();
    toastMessage.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {}),
      },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:document-export"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("offers the default theme and all twelve color presets without a visible heading", async () => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />));

    await user.click(screen.getByRole("button", { name: "主题色板" }));
    expect(await screen.findAllByRole("menuitemradio")).toHaveLength(13);
    expect(screen.queryByText("主题色板")).not.toBeInTheDocument();
    expect(screen.queryByText("选择工作台配色")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "默认" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Classic Indigo" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Caffeine" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Pastel Dreams" })).toBeInTheDocument();
  });

  it("animates the current theme icon while preserving the theme provider state", async () => {
    localStorage.setItem("admincn-ui-theme", "light");
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />));

    const lightToggle = screen.getByRole("button", { name: "切换到深色" });
    expect(lightToggle).toHaveAttribute("aria-pressed", "false");
    expect(lightToggle.querySelector("[data-slot='theme-toggle-icon'] .lucide-sun"))
      .toBeInTheDocument();

    await user.click(lightToggle);

    const darkToggle = await screen.findByRole("button", { name: "切换到浅色" });
    expect(darkToggle).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(darkToggle.querySelector("[data-slot='theme-toggle-icon'] .lucide-moon"))
        .toBeInTheDocument();
    });
  });

  it("switches top bar navigation between explicit English and browser-matched Chinese", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(async () => ({ runId: "run-topbar" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () => createRunSnapshot({ runId: "run-topbar" })),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const user = userEvent.setup();

    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(screen.getByRole("button", { name: "切换界面语言" }));
    expect((await screen.findByRole("menuitem", { name: /跟随浏览器/u }))).toBeInTheDocument();
    expect(screen.queryByText("界面语言")).not.toBeInTheDocument();
    await user.click((await screen.findByRole("menuitem", { name: /English/u })));

    expect(await screen.findByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");

    await user.click(screen.getByRole("button", { name: "Change interface language" }));
    await user.click((await screen.findByRole("menuitem", { name: /System/u })));

    expect(await screen.findByRole("button", { name: "主页" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("keeps only generation task controls in the project top bar", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(async () => ({ runId: "run-topbar" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () =>
        createRunSnapshot({
          runId: "run-topbar",
        }),
      ),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    const onOpenDrawer = vi.fn();
    render(
      withWorkspaceProviders(
        <>
          <TopBarHarness />
          <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={onOpenDrawer} />
        </>,
        repository,
      ),
    );

    expect(screen.queryByRole("dialog", { name: "历史快照" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成任务" }));
    expect(onOpenDrawer).toHaveBeenCalledWith("tasks");
    expect(screen.queryByRole("button", { name: "历史快照" })).not.toBeInTheDocument();
    for (const name of ["链路图", "运行历史", "项目设置", "成员", "文档中心"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }

    expect(toastMessage).not.toHaveBeenCalled();
    expect(screen.getByText("主内容保持不变")).toBeInTheDocument();
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("uses the supplied workflow canvas with bounded height, controls and graph filters", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(async () => ({ runId: "run-topbar" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () =>
        createRunSnapshot({
          runId: "run-topbar",
        }),
      ),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    const { container } = render(
      withWorkspaceProviders(
        <LineageGraphOnlyHarness />,
        repository,
      ),
    );

    await user.click(screen.getByRole("button", { name: "链路图" }));

    expect(
      await screen.findByRole("region", { name: "全局链路图" }),
    ).toBeInTheDocument();
    const dialog = screen.getByRole("region", { name: "全局链路图" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(dialog).queryByText("节点详情")).not.toBeInTheDocument();
    expect(container.querySelector('.react-flow__minimap')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '选择工具' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '平移工具' }));
    await user.click(within(dialog).getByRole('button', { name: '选择工具' }));
    await user.click(within(dialog).getByRole('button', { name: '锁定画布' }));
    expect(within(dialog).getByRole('button', { name: '解锁画布' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '解锁画布' }));
    expect(within(dialog).getByRole('button', { name: '撤销布局' })).toBeDisabled();
    await user.click(within(dialog).getAllByRole('button', { name: '重置布局' }).at(-1)!);
    expect(within(dialog).getByRole('button', { name: '撤销布局' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: '撤销布局' }));
    expect(within(dialog).getByRole('button', { name: '重做布局' })).toBeEnabled();
    expect(within(dialog).getByTestId("lineage-node-rule:empty")).toHaveAttribute(
      "data-lineage-kind",
      "rule",
    );
    expect(
      within(dialog).getByTestId("lineage-node-requirement-model:usecase"),
    ).toHaveAttribute("data-lineage-kind", "requirement-model");
    expect(
      within(dialog).getByTestId("lineage-node-design-model:sequence"),
    ).toHaveAttribute("data-lineage-kind", "design-model");
    expect(
      within(dialog).getByTestId("lineage-node-document:requirementsSpec"),
    ).toHaveAttribute("data-lineage-kind", "document");

    const usecaseNode = within(dialog).getByTestId(
      "lineage-node-requirement-model:usecase",
    );
    const classNode = within(dialog).getByTestId(
      "lineage-node-requirement-model:class",
    );
    fireEvent.click(usecaseNode);
    expect(within(dialog).getByRole('complementary', { name: '节点详情' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '链路筛选' }));
    await user.click(await screen.findByRole('menuitem', { name: '影响路径' }));
    expect(classNode.closest('.react-flow__node')).toHaveStyle({ opacity: '0.25' });
    await user.click(within(dialog).getByRole('button', { name: '收起节点详情' }));
    expect(within(dialog).queryByRole('complementary', { name: '节点详情' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '链路筛选' }));
    await user.click(await screen.findByRole('menuitem', { name: '全部链路' }));
    expect(classNode.closest('.react-flow__node')).toHaveStyle({ opacity: '1' });

  });

  it("opens a previous requirement artifact from the lineage graph while rerunning it", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成图书馆预约系统 UML",
          rules: [
            {
              id: "REQ-001",
              type: "functional" as const,
              text: "用户可以预约座位。",

            },
          ],
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "旧用例模型",
              summary: "旧模型仍可查看",
              notes: [],
              actors: [],
              useCases: [],
              systemBoundaries: [],
              relationships: [],
            },
          },
          generatedDiagramTypes: ["usecase"],
          svgArtifacts: {
            usecase: {
              diagramKind: "usecase",
              svg: "<svg>old usecase</svg>",
            } as never,
          },
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-rerun-usecase" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "stage_started", stage: "generate_models" });
        onEvent({
          type: "stage_progress",
          stage: "generate_models",
          progress: 40,
          diagramKind: "usecase",
          subtaskId: "usecase",
          subtaskLabel: "用例模型",
          subtaskStatus: "running",
          message: "正在重新生成：用例模型",
        });
        await new Promise(() => {});
      }),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<LineageRerunArtifactHarness />, repository));

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    await user.click(await screen.findByRole("button", { name: "重新生成用例模型" }));
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "链路图" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "链路图" }));

    const dialog = await screen.findByRole("region", { name: "全局链路图" });
    const usecaseNode = within(dialog).getByTestId(
      "lineage-node-requirement-model:usecase",
    );
    expect(usecaseNode).toHaveAttribute("data-lineage-status", "running");
    expect(usecaseNode).toHaveAttribute("data-lineage-viewable", "true");

    fireEvent.click(usecaseNode);
    expect(
      within(dialog).getAllByText("此节点正在生成，可在生成任务中查看实时进度。").length,
    ).toBeGreaterThan(0);
    const viewPreviousButton = within(dialog).getByRole("button", { name: "查看旧版" });
    expect(viewPreviousButton).toBeEnabled();
    await user.click(viewPreviousButton);

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "全局链路图" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("region", { name: "全局链路图" })).not.toBeInTheDocument();
  });

  it("does not mark structured-only requirement models as current in the lineage graph", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成图书馆预约系统 UML",
          rules: [
            {
              id: "REQ-001",
              type: "functional" as const,
              text: "用户可以预约座位。",

            },
          ],
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例模型",
              summary: "结构化模型已生成",
              notes: [],
              actors: [],
              useCases: [],
              systemBoundaries: [],
              relationships: [],
            },
          },
          generatedDiagramTypes: ["usecase"],
          svgArtifacts: {},
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<LineageGraphOnlyHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "链路图" }));

    const dialog = await screen.findByRole("region", { name: "全局链路图" });
    const usecaseNode = within(dialog).getByTestId(
      "lineage-node-requirement-model:usecase",
    );
    expect(usecaseNode).toHaveAttribute("data-lineage-status", "stale");
    expect(usecaseNode).toHaveAttribute("data-lineage-viewable", "false");

    fireEvent.click(usecaseNode);
    expect(
      within(dialog).getAllByText("上游输入或追踪证据已变化，此节点需要更新。").length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: "查看产物" })).toBeDisabled();
  });

  it("uses product navigation labels without opening workspace tabs", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(withWorkspaceProviders(<TopBarWithTabsHarness onNavigate={onNavigate} />, repository));
    const banner = screen.getByRole("banner");

    const navButtons = within(within(banner).getByRole("navigation")).getAllByRole("button");
    expect(navButtons.map((button) => button.textContent)).toEqual(["主页"]);
    expect(within(banner).queryByRole("button", { name: "工作台" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "需求" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "设计" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "代码" })).not.toBeInTheDocument();

    await user.click(navButtons[0]);
    expect(onNavigate).toHaveBeenCalledWith("/projects");
    expect(within(banner).queryByRole("button", { name: "购买" })).not.toBeInTheDocument();
    expect(within(banner).queryByRole("button", { name: "关于" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 工作台" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 考试" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 使用文档" })).not.toBeInTheDocument();
  });

  it("keeps a compact main navigation menu available for mobile layouts", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(withWorkspaceProviders(<TopBarHarness onNavigate={onNavigate} />, repository));

    await user.click(screen.getByRole("button", { name: "打开主导航" }));
    await user.click((await screen.findByRole("menuitem", { name: "次数与账单" })));

    expect(onNavigate).toHaveBeenCalledWith("/account/billing");
  });

  it("closes account modal on route changes without exposing purchase navigation", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <TopBarHarness currentRoute="/projects" />,
        repository,
      ),
    );

    expect(screen.queryByRole("button", { name: "购买" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "账号" }));
    await user.click(await screen.findByRole("menuitem", { name: "账号" }));
    expect(await screen.findByRole("dialog", { name: "登录账号" })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).not.toBeNull();

    window.history.pushState({}, "", "/projects");
    window.dispatchEvent(
      new CustomEvent("uml-route-change", {
        detail: { path: "/projects", location: "/projects" },
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "登录账号" })).not.toBeInTheDocument();
    });
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
  });

  it("shows an avatar file picker and previews selected account images", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify({
          user: {
            id: "user-avatar",
            username: "avatar",
            displayName: "Avatar User",
            avatarUrl: null,
            status: "active",
            mfaEnabled: false,
          },
          session: {
            id: "session-avatar",
            userId: "user-avatar",
            createdAt: "2026-05-23T00:00:00.000Z",
            expiresAt: "2026-05-24T00:00:00.000Z",
            lastSeenAt: "2026-05-23T00:00:00.000Z",
            ipAddress: null,
            userAgent: null,
          },
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/profile") && method === "GET") {
        return new Response(JSON.stringify({
          user: {
            id: "user-avatar",
            username: "avatar",
            displayName: "Avatar User",
            avatarUrl: null,
            status: "active",
            mfaEnabled: false,
          },
          session: {
            id: "session-avatar",
            userId: "user-avatar",
            createdAt: "2026-05-23T00:00:00.000Z",
            expiresAt: "2026-05-24T00:00:00.000Z",
            lastSeenAt: "2026-05-23T00:00:00.000Z",
            ipAddress: null,
            userAgent: null,
          },
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/sessions")) {
        return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/login-events")) {
        return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "账号" }));
    await user.click(await screen.findByRole("menuitem", { name: "账号" }));
    expect(await screen.findByLabelText("头像图片")).toBeInTheDocument();
    expect(screen.queryByLabelText("头像 URL")).not.toBeInTheDocument();

    const avatarFile = new File(["avatar"], "avatar.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("头像图片"), avatarFile);

    expect(screen.getByAltText("头像图片")).toHaveAttribute("src", "blob:document-export");
    expect(screen.queryByText(/请选择 PNG、JPG、WebP 或 GIF 图片/u)).not.toBeInTheDocument();
  });

  it("validates and uploads the selected account avatar when saving profile", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const baseUser = {
        id: "user-avatar",
        username: "avatar",
        displayName: "Avatar User",
        avatarUrl: null,
        status: "active",
        mfaEnabled: false,
      };
      const session = {
        id: "session-avatar",
        userId: "user-avatar",
        createdAt: "2026-05-23T00:00:00.000Z",
        expiresAt: "2026-05-24T00:00:00.000Z",
        lastSeenAt: "2026-05-23T00:00:00.000Z",
        ipAddress: null,
        userAgent: null,
      };
      if (url.includes("/api/auth/me") || (url.includes("/api/account/profile") && method === "GET")) {
        return new Response(JSON.stringify({
          user: baseUser,
          session,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/profile") && method === "PATCH") {
        return new Response(JSON.stringify({
          user: { ...baseUser, displayName: "Avatar User" },
          session,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/avatar") && method === "POST") {
        return new Response(JSON.stringify({
          user: { ...baseUser, avatarUrl: "/api/account/avatars/user-avatar.png" },
          session,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/sessions")) {
        return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/login-events")) {
        return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ applyAccept: false });
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "账号" }));
    await user.click(await screen.findByRole("menuitem", { name: "账号" }));
    await user.click(screen.getByRole("tab", { name: "个人资料" }));
    await user.upload(await screen.findByLabelText("头像图片"), new File(["avatar"], "avatar.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "保存资料" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/account/avatar"),
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    ));
    expect(screen.getByAltText("头像图片")).toHaveAttribute("src", "/api/account/avatars/user-avatar.png");
    expect(toastSuccess).toHaveBeenCalledWith("资料已更新");

    await user.upload(screen.getByLabelText("头像图片"), new File(["bad"], "bad.txt", { type: "text/plain" }));
    expect(screen.getByText("请选择 PNG、JPG、WebP 或 GIF 图片。")).toBeInTheDocument();
  });

  it("aligns the account dialog profile, MFA, and session views with the settings design", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const baseUser = {
      id: "user-avatar",
      username: "avatar",
      displayName: "Avatar User",
      avatarUrl: null,
      status: "active",
      mfaEnabled: false,
    };
    const currentSession = {
      id: "session-avatar",
      userId: "user-avatar",
      createdAt: "2026-05-23T00:00:00.000Z",
      expiresAt: "2026-05-24T00:00:00.000Z",
      lastSeenAt: "2026-05-23T01:00:00.000Z",
      ipAddress: "203.0.113.10",
      locationLabel: "中国 北京",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/auth/me") || (url.includes("/api/account/profile") && method === "GET")) {
        return new Response(JSON.stringify({
          user: baseUser,
          session: currentSession,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/sessions")) {
        return new Response(JSON.stringify({
          sessions: [
            currentSession,
            {
              id: "session-phone",
              userId: "user-avatar",
              createdAt: "2026-05-22T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T12:00:00.000Z",
              ipAddress: "198.51.100.22",
              locationLabel: "中国 上海",
              userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            },
            {
              id: "session-tablet",
              userId: "user-avatar",
              createdAt: "2026-05-21T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T11:00:00.000Z",
              ipAddress: "198.51.100.23",
              locationLabel: "中国 杭州",
              userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            },
            {
              id: "session-linux",
              userId: "user-avatar",
              createdAt: "2026-05-20T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T10:00:00.000Z",
              ipAddress: "198.51.100.24",
              locationLabel: "中国 深圳",
              userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            },
            {
              id: "session-windows",
              userId: "user-avatar",
              createdAt: "2026-05-19T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T09:00:00.000Z",
              ipAddress: "198.51.100.25",
              locationLabel: "中国 成都",
              userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/125.0.0.0 Safari/537.36",
            },
            {
              id: "session-overflow",
              userId: "user-avatar",
              createdAt: "2026-05-18T00:00:00.000Z",
              expiresAt: "2026-05-25T00:00:00.000Z",
              lastSeenAt: "2026-05-22T08:00:00.000Z",
              ipAddress: "198.51.100.26",
              locationLabel: "中国 广州",
              userAgent: "Mozilla/5.0 (Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
            },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/login-events")) {
        return new Response(JSON.stringify({
          events: [
            {
              id: "login-success",
              userId: "user-avatar",
              username: "avatar",
              outcome: "success",
              ipAddress: "203.0.113.10",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "密码登录",
              createdAt: "2026-05-23T01:00:00.000Z",
            },
            {
              id: "login-failure",
              userId: "user-avatar",
              username: "avatar",
              outcome: "failure",
              ipAddress: "203.0.113.66",
              locationLabel: "中国 天津",
              userAgent: null,
              message: "凭据无效",
              createdAt: "2026-05-22T01:00:00.000Z",
            },
            {
              id: "login-success-2",
              userId: "user-avatar",
              username: "avatar",
              outcome: "success",
              ipAddress: "203.0.113.11",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "第二条登录记录",
              createdAt: "2026-05-21T01:00:00.000Z",
            },
            {
              id: "login-success-3",
              userId: "user-avatar",
              username: "avatar",
              outcome: "success",
              ipAddress: "203.0.113.12",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "第三条登录记录",
              createdAt: "2026-05-20T01:00:00.000Z",
            },
            {
              id: "login-success-4",
              userId: "user-avatar",
              username: "avatar",
              outcome: "success",
              ipAddress: "203.0.113.13",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "第四条登录记录",
              createdAt: "2026-05-19T01:00:00.000Z",
            },
            {
              id: "login-success-overflow",
              userId: "user-avatar",
              username: "avatar",
              outcome: "success",
              ipAddress: "203.0.113.14",
              locationLabel: "中国 北京",
              userAgent: currentSession.userAgent,
              message: "第六条登录记录",
              createdAt: "2026-05-18T01:00:00.000Z",
            },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/mfa/setup") && method === "POST") {
        return new Response(JSON.stringify({
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUri: "otpauth://totp/UML:avatar?secret=JBSWY3DPEHPK3PXP&issuer=UML",
          expiresAt: "2026-05-23T12:00:00.000Z",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/provider-configs")) {
        return new Response(JSON.stringify({
          providerConfigs: [
            {
              id: "provider-config-1",
              name: "课程 OpenAI 托管配置",
              provider: "openai",
              baseUrl: "https://api.openai.com/v1",
              maskedKey: "sk-***",
              defaultModel: "gpt-5.5",
              status: "active",
            },
          ],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "账号" }));
    await user.click(await screen.findByRole("menuitem", { name: "账号" }));

    expect(await screen.findByRole("tab", { name: "个人资料" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "安全设置" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "登录会话" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "个人资料" }));
    expect(screen.getByText("个人资料信息")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Avatar User")).toBeInTheDocument();
    expect(screen.getByDisplayValue("avatar")).toBeInTheDocument();
    expect(screen.queryByText("用户名已验证")).not.toBeInTheDocument();
    expect(screen.getAllByText("正常").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: "安全设置" }));
    await user.click(screen.getByRole("button", { name: "启用 MFA" }));

    expect(await screen.findByRole("img", { name: "MFA 二维码" })).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制 MFA 密钥" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "登录会话" }));

    const sessionsList = screen.getByRole("list", { name: "活跃会话" });
    expect(within(sessionsList).getAllByText(/^地区:/)).toHaveLength(5);
    expect(within(sessionsList).getAllByText(/^最近活动:/)).toHaveLength(5);
    expect(within(sessionsList).getAllByText(/^过期时间:/)).toHaveLength(5);
    expect(within(sessionsList).getByText("macOS • Chrome")).toBeInTheDocument();
    expect(within(sessionsList).getByText("当前设备")).toBeInTheDocument();
    expect(within(sessionsList).getAllByText(/中国 北京/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/203\.0\.113\.10/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "登录历史" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "模型配置" }));

    expect(screen.getAllByText("模型配置").length).toBeGreaterThan(0);
    expect(screen.getAllByText("模型配置").length).toBeGreaterThan(0);
    expect(await screen.findByText(/课程 OpenAI 托管配置/u)).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "修改后自动重新生成规则" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加供应商" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "测试托管配置" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存更改" })).toBeInTheDocument();
  });

  it("lets users change their password from the account security tab", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const baseUser = {
      id: "user-password",
      username: "password",
      displayName: "Password User",
      avatarUrl: null,
      status: "active",
      mfaEnabled: false,
    };
    const currentSession = {
      id: "session-password",
      userId: "user-password",
      createdAt: "2026-05-23T00:00:00.000Z",
      expiresAt: "2026-05-24T00:00:00.000Z",
      lastSeenAt: "2026-05-23T01:00:00.000Z",
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0 Chrome/124.0.0.0",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/auth/me") || (url.includes("/api/account/profile") && method === "GET")) {
        return new Response(JSON.stringify({
          user: baseUser,
          session: currentSession,
          mfa: { enabled: false, enforcement: "totp" },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/sessions")) {
        return new Response(JSON.stringify({ sessions: [currentSession] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/login-events")) {
        return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/account/security") && method === "PATCH") {
        return new Response(JSON.stringify({ user: baseUser, session: currentSession }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "账号" }));
    await user.click(await screen.findByRole("menuitem", { name: "账号" }));
    await user.click(screen.getByRole("tab", { name: "安全设置" }));
    await user.type(await screen.findByLabelText("当前密码"), "Goal-e2e-old!Aa1");
    await user.type(screen.getByLabelText("新密码"), "Goal-e2e-new!Aa1");
    await user.click(screen.getByRole("button", { name: "修改密码" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/account/security"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: "Goal-e2e-old!Aa1",
          newPassword: "Goal-e2e-new!Aa1",
        }),
      }),
    ));
    expect(toastSuccess).toHaveBeenCalledWith("密码已修改，其他设备会话已失效");
    expect(screen.getByLabelText("当前密码")).toHaveValue("");
    expect(screen.getByLabelText("新密码")).toHaveValue("");
  });

  it("does not expose workspace export actions from the top bar", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [
            {
              id: "r1",
              type: "functional" as const,
              text: "系统生成 UML。",

            },
          ],
          plantUml: {
            usecase: "@startuml\nactor 用户\n",
          },
          generatedDiagramTypes: ["usecase"],
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-topbar" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />,
        repository,
      ),
    );

    expect(screen.queryByRole("button", { name: /导出/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /运行报告/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /当前快照/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/PlantUML|puml/i)).not.toBeInTheDocument();
  });

  it("keeps document generation controls out of the top bar actions", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceActions projectId="library-booking" onOpenDrawer={() => {}} />,
        repository,
      ),
    );

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole("button", { name: /导出/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /运行报告/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /当前快照/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /说明书样式/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /需求规格说明书/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /软件设计说明书/i })).not.toBeInTheDocument();
  });

  it("surfaces active project runs after reloading the workspace session", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const activeRun = {
      runId: "server-run-active",
      status: "running",
      stage: "generate_models",
      operationType: "requirement_modeling" as const, runKind: "requirements",
      model: "gpt-5.5",
    };

    render(
      withWorkspaceProviders(
        <>
          <ProjectWorkspaceActions
            projectId="library-booking"
            projectRuns={[activeRun]}
            onOpenDrawer={() => {}}
          />
          <ProjectGenerationTasksDrawerContent projectRuns={[activeRun]} />
        </>,
        repository,
      ),
    );

    // Active work shows elapsed time instead of a stage percentage.
    expect(screen.getAllByText(/^生成中( · 已用 [\d:]+)?$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("生成需求模型").length).toBeGreaterThan(0);
    expect(screen.queryByText("server-run-active")).not.toBeInTheDocument();
    expect(screen.queryByText(/模型 gpt-5\.5/)).not.toBeInTheDocument();
  });

  it("keeps an explicitly selected local terminal task ahead of an active server run", async () => {
    const snapshot = createRunSnapshot({
      runId: "local-completed-run",
      requirementText: "生成 UML",
      rules: [
        {
          id: "r1",
          type: "functional" as const,
          text: "系统生成 UML。",

        },
      ],
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "local-completed-run" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "completed", snapshot });
      }),
      getRunSnapshot: vi.fn(async () => snapshot),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const activeRun: PlatformRunSummary = {
      runId: "server-run-active-with-local-terminal",
      status: "running",
      stage: "generate_models",
      operationType: "requirement_modeling" as const, runKind: "requirements",
      model: "gpt-5.5",
      createdAt: "2026-06-21T00:00:00.000Z",
      startedAt: "2026-06-21T00:00:01.000Z",
    };

    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <TopBarTaskWithProjectRunsHarness projectRuns={[activeRun]} />,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "开始测试任务" }));
    await waitFor(() => {
      expect(repository.subscribeToRun).toHaveBeenCalledWith(
        "local-completed-run",
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal), onSnapshot: expect.any(Function) }),
      );
    });

    await waitFor(() => expect(screen.getAllByText(/^生成中( · 已用 [\d:]+)?$/).length).toBeGreaterThan(0));
    expect(
      within(screen.getByTestId("generation-transcript")).getByText(
        "此任务未保存完整回复，当前仅展示可用的执行记录。",
      ),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "我知道了" }));
    expect(screen.queryByRole("button", { name: "清理已完成" })).not.toBeInTheDocument();
    expect(screen.queryByText("任务列表")).not.toBeInTheDocument();
  });

  it("keeps a local startup failure visible instead of falling back to an older remote success", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({ requirementText: "生成 UML" }),
      ),

      startRun: vi.fn(async () => {
        throw new Error("ECONNRESET upstream-secret-value");
      }),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => null),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const completedRun: PlatformRunSummary = {
      runId: "older-server-run-completed",
      status: "completed",
      stage: "render_svg",
      operationType: "requirement_modeling" as const, runKind: "requirements",
      updatedAt: "2026-06-18T08:30:00.000Z",
    };

    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <TopBarTaskWithProjectRunsHarness projectRuns={[completedRun]} />,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "开始测试任务" }));
    await screen.findByRole("dialog", { name: "任务遇到内部错误" });

    const transcript = screen.getByTestId("generation-transcript");
    expect(within(transcript).getAllByText("启动校验").length).toBeGreaterThan(0);
    expect(
      within(transcript).getAllByText("生成任务失败，请稍后重试。").length,
    ).toBeGreaterThan(0);
    expect(within(transcript).queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.queryByText(/ECONNRESET|upstream-secret-value/u)).not.toBeInTheDocument();
  });

  it("shows the latest terminal server run when there is no active task", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const failedRun = {
      runId: "server-run-failed",
      status: "failed",
      stage: "generate_design_models",
      operationType: "design_modeling" as const, runKind: "design",
      updatedAt: "2026-06-18T09:30:00.000Z",
      errorMessage: "缺少设计类图",
    };
    const completedRun = {
      runId: "server-run-completed",
      status: "completed",
      stage: "render_svg",
      operationType: "requirement_modeling" as const, runKind: "requirements",
      updatedAt: "2026-06-18T08:30:00.000Z",
    };

    render(
      withWorkspaceProviders(
        <ProjectWorkspaceActions
          projectId="library-booking"
          projectRuns={[completedRun, failedRun]}
          onOpenDrawer={() => {}}
        />,
        repository,
      ),
    );

    expect(screen.getByText("失败")).toBeInTheDocument();
  });

  it("shows interrupted server runs instead of falling back to idle", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const interruptedRun: PlatformRunSummary = {
      runId: "server-run-interrupted",
      status: "interrupted",
      stage: "generate_models",
      operationType: "requirement_modeling" as const, runKind: "requirements",
      model: "gpt-5.5",
      updatedAt: "2026-06-18T10:30:00.000Z",
    };

    render(
      withWorkspaceProviders(
        <TopBarTaskWithProjectRunsHarness projectRuns={[interruptedRun]} />,
        repository,
      ),
    );

    expect(screen.getAllByText("服务中断，可重试").length).toBeGreaterThan(0);
    expect(screen.queryByText("暂无任务")).not.toBeInTheDocument();
    expect(screen.getByText("服务中断，请在生成任务中查看错误或重试")).toBeInTheDocument();
    expect(screen.queryByText("server-run-interrupted")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows retry source relationships for server runs in the task drawer", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const retryRun: PlatformRunSummary = {
      runId: "server-run-retry",
      status: "queued",
      stage: "generate_models",
      operationType: "requirement_modeling" as const, runKind: "requirements",
      sourceRunId: "server-run-failed",
      sourceAction: "retry",
      sourceRunStatus: "failed",
      model: "gpt-5.5",
      updatedAt: "2026-06-18T10:40:00.000Z",
    };

    render(
      withWorkspaceProviders(
        <TopBarTaskWithProjectRunsHarness projectRuns={[retryRun]} />,
        repository,
      ),
    );

    expect(screen.getAllByText(/^排队中( · 已用 [\d:]+)?$/).length).toBeGreaterThan(0);
    const statusCard = screen.getByTestId("generation-transcript");
    expect(within(statusCard).queryByText("运行关系")).not.toBeInTheDocument();
    expect(within(statusCard).queryByText("重试自 server-run-failed")).not.toBeInTheDocument();
  });

  it("shows Chinese task stages and progress without streamed prose in the task drawer", async () => {
    let completeRun!: () => void;
    const snapshot = createRunSnapshot({
      runId: "run-task-details",
      requirementText: "生成 UML",
      rules: [
        {
          id: "r1",
          type: "functional" as const,
          text: "系统生成 UML。",

        },
      ],
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-task-details" })),
      subscribeToRun: vi.fn(
        async (_runId, onEvent) => {
          onEvent({ type: "queued" });
          onEvent({ type: "stage_started", stage: "extract_rules" });
          onEvent({
            type: "stage_progress",
            stage: "extract_rules",
            progress: 20,
            message: "正在抽取需求规则",
          });
          onEvent({
            type: "llm_chunk",
            stage: "extract_rules",
            chunk: "正在分析需求文本",
          });
          await new Promise<void>((resolve) => {
            completeRun = () => {
              onEvent({ type: "completed", snapshot });
              resolve();
            };
          });
        },
      ),
      getRunSnapshot: vi.fn(async () => snapshot),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarTaskHarness />, repository));

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    await user.click(await screen.findByRole("button", { name: "开始测试任务" }));

    expect((await screen.findAllByText("抽取需求规则")).length).toBeGreaterThan(0);
    expect(screen.queryByText("修复需求规则")).not.toBeInTheDocument();
    const stageSection = document.querySelector('[data-slot="ai-conversation"]');
    expect(stageSection).toBeTruthy();
    expect(within(stageSection as HTMLElement).getAllByText("抽取需求规则").length).toBeGreaterThan(
      0,
    );
    expect(within(stageSection as HTMLElement).queryByText("修复需求规则")).not.toBeInTheDocument();
    expect(within(stageSection as HTMLElement).queryByText("生成需求模型")).not.toBeInTheDocument();
    expect(within(stageSection as HTMLElement).queryByText("生成图源码")).not.toBeInTheDocument();
    expect(within(stageSection as HTMLElement).queryByText("渲染图像")).not.toBeInTheDocument();
    expect(screen.queryByText("执行详情")).not.toBeInTheDocument();
    expect(screen.queryByText("用户摘要")).not.toBeInTheDocument();
    expect(screen.getByText("正在抽取需求规则")).toBeInTheDocument();
    expect(screen.queryByText("正在分析需求文本")).not.toBeInTheDocument();
    expect(screen.queryByText("收到模型输出")).not.toBeInTheDocument();
    expect(screen.queryByText("extract_rules")).not.toBeInTheDocument();
    expect(screen.queryByText("llm_chunk")).not.toBeInTheDocument();
    expect(screen.queryByText("stage_started")).not.toBeInTheDocument();

    completeRun();
    await waitFor(() => {
      expect(screen.getAllByText("已完成").length).toBeGreaterThan(0);
    });
    const completedStageSection = document.querySelector('[data-slot="ai-conversation"]');
    expect(completedStageSection).toBeTruthy();
    expect(
      within(completedStageSection as HTMLElement).queryByText("生成需求模型"),
    ).not.toBeInTheDocument();
    expect(
      within(completedStageSection as HTMLElement).queryByText("生成图源码"),
    ).not.toBeInTheDocument();
    expect(
      within(completedStageSection as HTMLElement).queryByText("渲染图像"),
    ).not.toBeInTheDocument();
  });

  it("shows no-visible-stream heartbeat text in execution details before model chunks arrive", async () => {
    let completeRun!: () => void;
    const snapshot = createRunSnapshot({
      runId: "run-heartbeat-details",
      requirementText: "生成 UML",
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-heartbeat-details" })),
      subscribeToRun: vi.fn(
        async (_runId, onEvent) => {
          onEvent({ type: "queued" });
          onEvent({ type: "stage_started", stage: "extract_rules" });
          onEvent({
            type: "stage_progress",
            stage: "extract_rules",
            progress: 20,
            message: "模型正在生成，当前供应商暂未返回可见流式内容",
          });
          await new Promise<void>((resolve) => {
            completeRun = () => {
              onEvent({ type: "completed", snapshot });
              resolve();
            };
          });
        },
      ),
      getRunSnapshot: vi.fn(async () => snapshot),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarTaskHarness />, repository));

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    await user.click(await screen.findByRole("button", { name: "开始测试任务" }));

    const transcript = screen.getByTestId("generation-transcript");
    expect(within(transcript).getByText("模型正在生成，当前供应商暂未返回可见流式内容")).toBeInTheDocument();
    expect(screen.queryByTestId("generation-task-execution-box")).not.toBeInTheDocument();

    completeRun();
    await waitFor(() => {
      expect(screen.getAllByText("已完成").length).toBeGreaterThan(0);
    });
  });

  it("renders only executed model steps as compact conversation rows", async () => {
    let completeRun!: () => void;
    const snapshot = createRunSnapshot({
      runId: "run-model-stage-todo",
      requirementText: "生成 UML",
      selectedDiagrams: ["usecase", "class", "activity"],
      rules: [
        { id: "r2", type: "data" as const, text: "系统记录模型名称与模型内容。" },
        {
          id: "r1",
          type: "functional" as const,
          text: "系统生成 UML。",

        },
      ],
      models: [
        { summary: "", title: "用例模型", relationships: [], systemBoundaries: [],  notes: [], diagramKind: "usecase", actors: [], useCases: [] },
        { summary: "", title: "类图", relationships: [], interfaces: [], enums: [],  notes: [], diagramKind: "class", classes: [] },
      ],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {
        activity: {
          stage: "generate_models",
          error: {
            code: "RUN_STRUCTURED_OUTPUT_INVALID",
            message: "界面关系 traceability 缺失",
            category: "generation",
            retryable: true,
          },
        },
      },
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [
        { id: "r2", type: "data" as const, text: "系统记录模型名称与模型内容。" },
            {
              id: "r1",
              type: "functional" as const,
              text: "系统生成 UML。",

            },
          ],
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-model-stage-todo" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "stage_started", stage: "generate_models" });
        onEvent({
          type: "stage_progress",
          stage: "generate_models",
          progress: 35,
          diagramKind: "usecase",
          subtaskId: "usecase",
          subtaskLabel: "用例模型",
          subtaskStatus: "running",
          message: "正在生成：用例模型",
        });
        onEvent({
          type: "stage_progress",
          stage: "generate_models",
          progress: 36,
          diagramKind: "class",
          subtaskId: "class",
          subtaskLabel: "领域概念模型",
          subtaskStatus: "pending_review",
          message: "领域概念模型存在待确认追踪关系",
        });
        onEvent({
          type: "stage_progress",
          stage: "generate_models",
          progress: 37,
          diagramKind: "activity",
          subtaskId: "activity",
          subtaskLabel: "界面关系",
          subtaskStatus: "queued",
          queueReason: "project",
          queueAhead: 0,
          waitMs: 12_000,
          estimatedWaitMs: 60_000,
          message: "正在排队：界面关系",
        });
        await new Promise<void>((resolve) => {
          completeRun = () => {
            onEvent({ type: "completed", snapshot });
            resolve();
          };
        });
      }),
      getRunSnapshot: vi.fn(async () => snapshot),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarDiagramTaskHarness />, repository));

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    await user.click(await screen.findByRole("button", { name: "开始模型任务" }));
    await user.click(await screen.findByRole("button", { name: "确认生成" }));

    const stageSection = document.querySelector('[data-slot="ai-conversation"]');
    expect(stageSection).toBeTruthy();
    expect(within(stageSection as HTMLElement).getByText("需求建模助手")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正在思考" })).toHaveAttribute("aria-expanded", "true");
    expect(within(stageSection as HTMLElement).queryByText("生成图形描述")).not.toBeInTheDocument();
    expect(within(stageSection as HTMLElement).queryByText("生成图形预览")).not.toBeInTheDocument();
    expect(within(stageSection as HTMLElement).getByRole("heading", { name: "生成用例模型" })).toBeInTheDocument();
    expect(within(stageSection as HTMLElement).getByRole("heading", { name: "生成领域概念模型" })).toBeInTheDocument();
    expect(within(stageSection as HTMLElement).queryByText(/领域概念模型存在待确认追踪关系/)).not.toBeInTheDocument();
    expect(within(stageSection as HTMLElement).getAllByText("待确认").length).toBeGreaterThan(0);
    expect(screen.queryByText("模型子任务")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "排队进度" })).getByText("界面关系")).toBeInTheDocument();

    completeRun();
    const resultDialog = await screen.findByRole("dialog", { name: "部分生成成功" });
    expect(resultDialog).toHaveTextContent("生成成功：用例模型、领域概念模型。");
    expect(resultDialog).toHaveTextContent("生成失败：总体业务流程。");
    await user.click(within(resultDialog).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "输出总结" })).toHaveTextContent("生成结果格式错误，请重试。"));
    const updatedStageSection = document.querySelector('[data-slot="ai-conversation"]');
    expect(updatedStageSection).toBeTruthy();
    expect(within(updatedStageSection as HTMLElement).queryByRole("button", { name: "重试此模型" })).not.toBeInTheDocument();
    expect(
      within(updatedStageSection as HTMLElement).queryByText("界面关系 traceability 缺失"),
    ).not.toBeInTheDocument();
    expect(
      within(updatedStageSection as HTMLElement).getAllByText("未完成").length,
    ).toBeGreaterThan(0);
  });

  it("does not offer a separate instance-level rerun for a partially failed task", async () => {
    let completeRun!: () => void;
    const rules = [
      {
        id: "r1",
        type: "functional" as const,
        text: "用户可以查看图书。",

      },
    ];
    const requirementText = "用户可以查看图书。";
    const fingerprint = snapshotInputFingerprint({ requirementText, rules });
    const snapshot = createRunSnapshot({
      runId: "run-analysis-instance",
      requirementText,
      selectedDiagrams: ["analysis"],
      analysisTargetUseCaseIds: ["uc_view_books"],
      rules,
      models: [
        {
          diagramKind: "usecase",
          title: "用例模型", summary: "读者查看图书", notes: [],
          actors: [{ id: "reader", name: "读者", actorType: "human", responsibilities: [] }],
          useCases: [{ id: "uc_view_books", name: "查看图书", goal: "查看图书", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [], systemBoundaryId: "library" }],
          systemBoundaries: [{ id: "library", name: "图书馆" }],
          relationships: [{ id: "view", type: "association", sourceId: "reader", targetId: "uc_view_books" }],
        },
      ],
      currentStage: "generate_plantuml",
      status: "completed",
    });
    (
      snapshot.diagramErrors as Record<
        string,
        (typeof snapshot.diagramErrors)["analysis"]
      >
    )["analysis:uc_view_books"] = {
      stage: "generate_plantuml",
      error: {
        code: "RUN_RENDER_FAILED",
        message: "PlantUML 修复失败",
        category: "render",
        retryable: true,
      },
    };
    const startRun = vi
      .fn()
      .mockResolvedValueOnce({ runId: "run-analysis-instance" })
      .mockResolvedValueOnce({ runId: "run-analysis-retry" });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText,
          rules,
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
          requirementInputFingerprint: fingerprint,
          generatedDiagramTypes: ["usecase"],
          diagramInputFingerprints: { usecase: fingerprint },
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例模型", summary: "读者查看图书", notes: [],
              actors: [{ id: "reader", name: "读者", actorType: "human", responsibilities: [] }],
              useCases: [{ id: "uc_view_books", name: "查看图书", goal: "查看图书", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [], systemBoundaryId: "library" }],
              systemBoundaries: [{ id: "library", name: "图书馆" }],
              relationships: [{ id: "view", type: "association", sourceId: "reader", targetId: "uc_view_books" }],
            },
          },
        }),
      ),

      startRun,
      subscribeToRun: vi.fn(async (runId, onEvent) => {
        if (runId !== "run-analysis-instance") return;
        onEvent({ type: "queued" });
        onEvent({ type: "stage_started", stage: "generate_plantuml" });
        onEvent({
          type: "stage_progress",
          stage: "generate_plantuml",
          progress: 64,
          diagramKind: "analysis",
          modelId: "analysis:uc_view_books",
          subtaskLabel: "查看图书分析模型",
          subtaskStatus: "failed",
          message: "PlantUML 修复失败",
        });
        await new Promise<void>((resolve) => {
          completeRun = () => {
            onEvent({ type: "completed", snapshot });
            resolve();
          };
        });
      }),
      getRunSnapshot: vi.fn(async () => snapshot),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TopBarAnalysisTaskHarness />, repository));

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
    });
    await user.click(await screen.findByRole("button", { name: "开始分析模型任务" }));
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    completeRun();

    await user.click(await screen.findByRole("button", { name: "我知道了" }));
    expect(screen.getByRole("region", { name: "输出总结" })).toHaveTextContent("绘图器故障，请重试。");
    expect(screen.queryByRole("button", { name: "重试全部同类模型" })).not.toBeInTheDocument();
    expect(startRun).toHaveBeenCalledTimes(1);
  });

});
