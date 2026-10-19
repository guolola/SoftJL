// Verifies workspace repository persistence, remote API mapping, history compaction, and subscription behavior.
import { createRenderMeta } from "@/test/contract-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AtomicRequirement,
  DiagramModelSpec,
  RequirementBaseline,
} from "@uml-platform/contracts";
import {
  buildApiUrl,
  createHttpWorkspaceRepository,
  createMockWorkspaceRepository,
  type StartDocumentRunInput,
  createStartRunInput,
} from "./index";
import {
  RUN_HISTORY_LIMIT,
  RUN_HISTORY_STORAGE_KEY,
} from "../../entities/run-history";
import { createRunSnapshot } from "../../test/workspace-test-utils";
import {
  designInputFingerprint,
  snapshotInputFingerprint,
} from "../../shared/lib/fingerprint";

const managedProviderSettings = {
  providerConfigId: "provider-config-1",
  model: "gpt-5.5",
};

function storeManagedUserSettings() {
  localStorage.setItem(
    "uml-lab-settings",
    JSON.stringify({
      providerConfigId: managedProviderSettings.providerConfigId,
      defaultModel: managedProviderSettings.model,
      providerModelOptions: [managedProviderSettings.model],
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}


function createAtomicRequirement(
  overrides: Partial<AtomicRequirement> = {},
): AtomicRequirement {
  return {
    id: "REQ-001",
    sourceRuleId: "r1",
    sourceFragment: "用户提交订单。",
    sourceLocation: { section: "input", startOffset: 0, endOffset: 12 },
    type: "functional" as const,
    actor: null,
    subject: "系统",
    action: "允许提交",
    object: "订单",
    condition: null,
    outcome: "系统创建订单",
    confidence: 0.56,
    status: "pending-review",
    criticality: "high",
    acceptanceCriteria: ["用户提交订单后系统创建订单。"],
    priority: "must",
    fieldProvenance: {},
    ...overrides,
  };
}

function createRequirementBaseline(
  requirements: AtomicRequirement[],
): RequirementBaseline {
  return {
      id: "baseline-test",
      version: 1,
      sourceInputFingerprint: "test-source-input",
    runId: "run-baseline",
    sourceDocumentId: "inline-requirement",
    schemaVersion: 3 as const,

      rules: (requirements).map(item => ({ id: item.sourceRuleId ?? item.id, requirementId: item.id, text: item.sourceFragment, type: "functional" as const, origin: "generated" as const })),
    assumptions: [],
    conflicts: [],
    qualityReport: {
      runId: "run-baseline",
      status: "pending-review",
      summary: "存在待确认字段。",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: requirements.map((item) => item.id),
    },
    createdAt: "2026-05-27T00:00:00.000Z",
  };
}

describe("createStartRunInput", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it("rejects real generation when no managed provider is selected", () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "",
        defaultModel: "gpt-5.5",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );

    expect(() => createStartRunInput("生成 UML", ["usecase"])).toThrow("未选择模型供应商");
  });

  it("rejects real generation when only stale plaintext settings remain", () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        apiBaseUrl: "https://ai.comfly.org/v1/chat/completions",
        apiKey: "sk-demo",
        defaultModel: "gpt-5.5",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );

    expect(() => createStartRunInput("生成 UML", ["usecase"])).toThrow("未选择模型供应商");
  });

  it("includes only managed provider config references when selected", () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        providerConfigId: "provider-config-1",
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-stale",
        defaultModel: "gpt-5.5",
        providerModelOptions: ["gpt-5.5"],
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );

    expect(createStartRunInput("生成 UML", ["usecase"])).toMatchObject({
      providerSettings: {
        providerConfigId: "provider-config-1",
        model: "gpt-5.5",
      },
    });
  });

});

describe("createHttpWorkspaceRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it.each(["provider", "offline-demo"])("loads project generation mode with permissions: %s", async (generationExecutionMode) => {
    const fetchMock = vi.fn(async (_url: unknown) => new Response(JSON.stringify({
      capabilities: ["update_project", "start_runs"], generationExecutionMode,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const repository = createHttpWorkspaceRepository({ projectId: "project-mode" });
    expect(await repository.getProjectAccess!()).toEqual({
      capabilities: ["update_project", "start_runs"],
      generationExecutionMode,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/projects/project-mode");
  });

  it.each([undefined, "unknown"])("rejects missing or unknown project generation mode: %s", async generationExecutionMode => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ capabilities: ["start_runs"], generationExecutionMode }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(createHttpWorkspaceRepository({ projectId: "current" }).getProjectAccess!()).rejects.toThrow();
  });

  it("requires project scope for subscriptions and history reads", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("uml-run-history", JSON.stringify([{ id: "old-run" }]));
    const repository = createHttpWorkspaceRepository();
    await expect(repository.subscribeToRun("run-1", vi.fn())).rejects.toThrow("请先登录并进入项目");
    await expect(repository.getRunHistoryItem("old-run")).rejects.toThrow("请先登录并进入项目");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects document operations when no project scope is available", async () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-demo",
        defaultModel: "gpt-5.5",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository();
    await expect(repository.listDocuments!()).rejects.toThrow(
      "请先登录并进入项目",
    );
    await expect(
      repository.startDocumentRun!({
        documentKind: "requirementsSpec",
        requirementText: "生成说明书",
        rules: [],
        requirementModels: [],
        requirementModelTraceability: [],
        requirementPlantUml: [],
        requirementSvgArtifacts: [],
        designModels: [],
        designPlantUml: [],
        designSvgArtifacts: [],
        providerSettings: managedProviderSettings,
        useAiText: true,
      }),
    ).rejects.toThrow("请先登录并进入项目");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds project headers to project workspace run and document requests", async () => {
    storeManagedUserSettings();

    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        void url;
        queueMicrotask(() => {
          this.onerror?.();
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      void options;
      if (url.endsWith("/api/runs")) {
        return new Response(JSON.stringify({ runId: "run-project-1" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/runs/run-project-1")) {
        return new Response(
          JSON.stringify({
            runId: "run-project-1",
            operationType: "requirement_modeling",
            outputManifest: [],
            requirementText: "生成 UML",
            selectedDiagrams: ["usecase"],
            rules: [],
            models: [],
            requirementModelTraceability: [],
            plantUml: [],
            svgArtifacts: [],
            diagramErrors: {},
            requirementTrace: [],
            currentStage: "render_svg",
            status: "completed",
            error: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.endsWith("/api/document-runs")) {
        return new Response(JSON.stringify({ runId: "document-run-1" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/design-runs")) {
        return new Response(JSON.stringify({ runId: "design-run-1" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/code-runs")) {
        return new Response(JSON.stringify({ runId: "code-run-1" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/projects/library-booking/documents")) {
        return new Response(JSON.stringify({ documents: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(new Blob(["docx"]), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });

    await repository.startRun(createStartRunInput("生成 UML", ["usecase"]));
    await repository.subscribeToRun("run-project-1", () => {});
    await repository.startDesignRun!({
      requirementBaseline: createRequirementBaseline([]),
      requirementModels: [],
      requirementModelTraceability: [],
      selectedDiagrams: ["sequence"],
      requestedDiagrams: ["sequence"],
      existingDesignModels: [],
      existingDesignModelTraceability: [],
      existingDesignPlantUml: [],
      existingDesignSvgArtifacts: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc-demo",
          svg: "<svg>large</svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: "2026-05-22T02:00:00.000Z",
            sourceLength: 10,
            durationMs: 1,
          },
        },
      ],
      providerSettings: managedProviderSettings,
    });
    await repository.startDocumentRun!({
      documentKind: "requirementsSpec",
      requirementText: "生成说明书",
      rules: [],
      requirementModels: [],
      requirementModelTraceability: [],
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings: managedProviderSettings,
      useAiText: true,
    });
    await repository.listDocuments!();
    await repository.downloadDocument!("doc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/documents"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/projects/library-booking/documents/doc-1/download",
      ),
      expect.anything(),
    );
    const projectRunEventsCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/runs/run-project-1/events"),
    );
    expect(projectRunEventsCall?.[1]?.credentials).toBe("include");
    const startRunCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/runs"),
    );
    const startRunBody = JSON.parse(String(startRunCall?.[1]?.body));
    expect(startRunBody).toEqual({
      projectId: "library-booking",
      reasoning: false,
      selectedDiagrams: ["usecase"],
      requestedDiagrams: ["usecase"],
      dependencyDiagrams: [],
      analysisTargetUseCaseIds: [],
      providerSettings: managedProviderSettings,
    });
    const startDocumentCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/document-runs"),
    );
    const startDocumentBody = JSON.parse(String(startDocumentCall?.[1]?.body));
    expect(startDocumentBody).toEqual({
      projectId: "library-booking",
      documentKind: "requirementsSpec",
      providerSettings: managedProviderSettings,
      useAiText: true,
    });
    expect(startDocumentBody.requirementSvgArtifacts).toBeUndefined();
    expect(startDocumentBody.designSvgArtifacts).toBeUndefined();
    const startDesignCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/design-runs"),
    );
    const startDesignBody = JSON.parse(String(startDesignCall?.[1]?.body));
    expect(startDesignBody).toEqual({
      projectId: "library-booking",
      selectedDiagrams: ["sequence"],
      requestedDiagrams: ["sequence"],
      providerSettings: managedProviderSettings,
    });
    expect(startDesignBody.existingDesignSvgArtifacts).toBeUndefined();

    for (const [, options] of fetchMock.mock.calls) {
      const headers = options?.headers as Record<string, string>;
      expect(headers["X-UML-Project-Id"]).toBe("library-booking");
      expect(headers["X-UML-Workspace-Id"]).toBeUndefined();
      expect(headers["X-UML-Workspace-Secret"]).toBeUndefined();
    }
  });

  it("loads and saves the shared project workspace with an optimistic version", async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 2,
            updatedAt: "2026-05-22T02:00:00.000Z",
            updatedByUserId: "teacher-1",
            state: {
              requirementText: "已保存的项目需求",
              rules: [
                {
                  id: "FR1",
                  text: "日历仅供公众使用。",
                  type: "business-rule" as const,

                },
              ],
              selectedDiagramTypes: ["usecase"],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 3,
            updatedAt: "2026-05-22T02:05:00.000Z",
            updatedByUserId: "teacher-1",
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    const workspace = await repository.loadWorkspace();
    expect(workspace.requirementText).toBe("已保存的项目需求");
    expect(workspace.rules[0]?.id).toBe("FR1");
    expect(workspace.selectedDiagramTypes).toEqual(["usecase"]);

    await repository.updateRequirementText("团队成员更新的需求");

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    expect(saveCall).toBeTruthy();
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.baseVersion).toBe(2);
    expect(body.state.requirementText).toBe("团队成员更新的需求");
  });


  it("persists requirement rule freshness metadata through project conflict retries", async () => {
    const requirementText = "订单需求";
    const originalRule = {
      id: "r1",
      type: "functional" as const,
      text: "用户提交订单。",

    };
    const updatedRule = {
      ...originalRule,
      text: "用户提交订单并收到确认消息。",
    };
    const updatedFingerprint = snapshotInputFingerprint({
      requirementText,
      rules: [updatedRule],
    });
    const oldRequirement = createAtomicRequirement({
      id: "REQ-001",
      sourceRuleId: originalRule.id,
    });
    const oldBaseline = createRequirementBaseline([oldRequirement]);
    let workspaceReads = 0;
    let workspaceWrites = 0;
    const savedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        workspaceReads += 1;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: workspaceReads === 1 ? 4 : 5,
            state: {
              requirementText,
              rules: [originalRule],
              rulesVersion: 4,
              rulesBasedOnTextVersion: 0,
              requirementBaseline: oldBaseline,
              requirementQualityReport: oldBaseline.qualityReport,

              requirementInputFingerprint: snapshotInputFingerprint({
                requirementText,
                rules: [originalRule],
              }),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        workspaceWrites += 1;
        savedBodies.push(JSON.parse(String(options.body)));
        if (workspaceWrites === 1) {
          return new Response(
            JSON.stringify({
              message: "项目已由其他成员更新，请刷新最新状态后再保存。",
              currentVersion: 5,
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 6,
            state: savedBodies.at(-1)?.state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    storeManagedUserSettings();
    await repository.loadWorkspace();
    await repository.updateRequirementRules?.([updatedRule], {
      requirementBaseline: null,
      requirementInputFingerprint: updatedFingerprint,
      requirementModelTraceability: [
        {
          ruleId: updatedRule.id,
          target: {
            diagramKind: "usecase",
            elementId: "uc_view_books",
            elementKind: "usecase",
            label: "查看图书",
          },
        },
      ],
      requirementQualityReport: null,

      rulesBasedOnTextVersion: 0,
      rulesVersion: 5,
    });

    expect(savedBodies).toHaveLength(2);
    const retriedState = savedBodies[1]?.state as Record<string, unknown>;
    expect(retriedState.rules).toEqual([updatedRule]);
    expect(retriedState.requirementInputFingerprint).toBe(updatedFingerprint);
    expect(retriedState.requirementModelTraceability).toEqual([
      expect.objectContaining({
        ruleId: updatedRule.id,
        target: expect.objectContaining({ elementId: "uc_view_books" }),
      }),
    ]);
    expect(retriedState.requirementBaseline).toBeNull();
    expect(retriedState.requirementQualityReport).toBeNull();
    expect(retriedState.rulesBasedOnTextVersion).toBe(0);
    expect(retriedState.rulesVersion).toBe(5);
  });

  it("keeps requirement rule freshness metadata in the mock repository", async () => {
    const requirementText = "订单需求";
    const rule = {
      id: "r1",
      type: "functional" as const,
      text: "用户提交订单。",

    };
    const fingerprint = snapshotInputFingerprint({
      requirementText,
      rules: [rule],
    });
    const oldRequirement = createAtomicRequirement({
      id: "REQ-001",
      sourceRuleId: rule.id,
    });
    const oldBaseline = createRequirementBaseline([oldRequirement]);
    const repository = createMockWorkspaceRepository({
      requirementText,
      requirementBaseline: oldBaseline,
      requirementQualityReport: oldBaseline.qualityReport,

    });

    await repository.updateRequirementRules?.([rule], {
      requirementBaseline: null,
      requirementInputFingerprint: fingerprint,
      requirementModelTraceability: [
        {
          ruleId: rule.id,
          target: {
            diagramKind: "usecase",
            elementId: "uc_submit_order",
            elementKind: "usecase",
            label: "提交订单",
          },
        },
      ],
      requirementQualityReport: null,

      rulesBasedOnTextVersion: 0,
      rulesVersion: 1,
    });

    const workspace = await repository.loadWorkspace();
    expect(workspace.rules).toEqual([rule]);
    expect(workspace.requirementInputFingerprint).toBe(fingerprint);
    expect(workspace.requirementModelTraceability).toEqual([
      expect.objectContaining({
        ruleId: rule.id,
        target: expect.objectContaining({ elementId: "uc_submit_order" }),
      }),
    ]);
    expect(workspace.requirementBaseline).toBeNull();
    expect(workspace.requirementQualityReport).toBeNull();
    expect(workspace.rulesBasedOnTextVersion).toBe(0);
    expect(workspace.rulesVersion).toBe(1);
  });


  it("does not start a project run when the pending workspace save failed", async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 2,
            updatedAt: "2026-05-22T02:00:00.000Z",
            updatedByUserId: "teacher-1",
            state: {
              requirementText: "已保存的项目需求",
              rules: [],
              selectedDiagramTypes: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(JSON.stringify({ message: "保存失败" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/runs")) {
        return new Response(JSON.stringify({ runId: "should-not-start" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    storeManagedUserSettings();
    await repository.loadWorkspace();
    await expect(
      repository.updateRequirementText("本地还没成功保存的需求"),
    ).rejects.toThrow();

    await expect(
      repository.startRun(createStartRunInput("生成 UML", ["usecase"])),
    ).rejects.toThrow();
    const startCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/runs"),
    );
    expect(startCalls).toHaveLength(0);
  });

  it("does not start a project requirement run when a rule category edit failed to save", async () => {
    const existingRule = {
      id: "r1",
      type: "functional" as const,
      text: "用户可以浏览公开活动。",

    };
    const mappedRule = {
      ...existingRule,
      type: "business-rule" as const,

    };
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 2,
            updatedAt: "2026-05-22T02:00:00.000Z",
            updatedByUserId: "teacher-1",
            state: {
              requirementText: "公开活动需求",
              rules: [existingRule],
              rulesVersion: 1,
              selectedDiagramTypes: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(JSON.stringify({ message: "保存失败" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/runs")) {
        return new Response(JSON.stringify({ runId: "should-not-start" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    storeManagedUserSettings();
    await repository.loadWorkspace();
    await expect(
      repository.updateRequirementRules?.([mappedRule], {
        requirementInputFingerprint: snapshotInputFingerprint({
          requirementText: "公开活动需求",
          rules: [mappedRule],
        }),
        rulesBasedOnTextVersion: 0,
        rulesVersion: 2,
      }),
    ).rejects.toThrow();

    await expect(
      repository.startRun(
        createStartRunInput("公开活动需求", ["class"], [mappedRule]),
      ),
    ).rejects.toThrow();
    const startCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/runs"),
    );
    expect(startCalls).toHaveLength(0);
  });

  it("waits for pending manual model saves before starting project design runs", async () => {
    let resolveSave!: (response: Response) => void;
    const savedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            updatedAt: "2026-05-22T02:00:00.000Z",
            updatedByUserId: "teacher-1",
            state: {
              requirementText: "已保存的项目需求",
              rules: [],
              selectedDiagramTypes: [],
              models: {},
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedBodies.push(JSON.parse(String(options.body)));
        return new Promise<Response>((resolve) => {
          resolveSave = resolve;
        });
      }
      if (url.endsWith("/api/design-runs")) {
        return new Response(JSON.stringify({ runId: "design-run-after-save" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          message: `unexpected request ${String(url)} ${options?.method ?? "GET"}`,
        }),
        { status: 500 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    storeManagedUserSettings();
    await repository.loadWorkspace();
    const editedModel: DiagramModelSpec = {
      diagramKind: "usecase",
      title: "编辑后的用例模型",
      summary: "用户查看图书。",
      notes: [],
      actors: [],
      useCases: [],
      systemBoundaries: [],
      relationships: [],
    };
    const savePromise = repository.saveRequirementModelEdit!(
      "usecase",
      editedModel,
      {
        status: "dirty",
        warning: "模型已手动修改",
        editedAt: "2026-06-21T00:00:00.000Z",
      },
    );

    await vi.waitFor(() => {
      expect(savedBodies).toHaveLength(1);
    });

    const startPromise = repository.startDesignRun!({
      requirementBaseline: createRequirementBaseline([]),
      requirementModels: [],
      requirementModelTraceability: [],
      selectedDiagrams: ["sequence"],
      requestedDiagrams: ["sequence"],
      existingDesignModels: [],
      existingDesignModelTraceability: [],
      existingDesignPlantUml: [],
      existingDesignSvgArtifacts: [],
      providerSettings: managedProviderSettings,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/design-runs"),
      ),
    ).toHaveLength(0);

    resolveSave(
      new Response(
        JSON.stringify({
          projectId: "library-booking",
          version: 5,
          updatedAt: "2026-05-22T02:05:00.000Z",
          updatedByUserId: "teacher-1",
          state: savedBodies[0]?.state,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await savePromise;
    await startPromise;
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/design-runs"),
      ),
    ).toHaveLength(1);
    expect((savedBodies[0]?.state as { models?: Record<string, unknown> }).models).toHaveProperty(
      "usecase",
    );
  });


  it("persists pruned traceability with manual requirement model edits", async () => {
    const savedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 6,
            updatedAt: "2026-05-22T02:00:00.000Z",
            updatedByUserId: "teacher-1",
            state: {
              requirementText: "已保存的项目需求",
              rules: [],
              selectedDiagramTypes: [],
              models: {},
              requirementModelTraceability: [
                {
                  ruleId: "REQ-old",
                  target: {
                    diagramKind: "class",
                    elementId: "deleted",
                    elementKind: "class",
                    label: "Deleted",
                  },
                },
              ],
              designModelTraceability: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        const body = JSON.parse(String(options.body));
        savedBodies.push(body);
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 7,
            updatedAt: "2026-05-22T02:05:00.000Z",
            updatedByUserId: "teacher-1",
            state: body.state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          message: `unexpected request ${String(url)} ${options?.method ?? "GET"}`,
        }),
        { status: 500 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    storeManagedUserSettings();
    await repository.loadWorkspace();
    await repository.saveRequirementModelEdit!(
      "class",
      {
        diagramKind: "class",
        title: "领域模型",
        summary: "订单。",
        notes: [],
        classes: [],
        interfaces: [],
        enums: [],
        relationships: [],
      } as unknown as DiagramModelSpec,
      {
        status: "dirty",
        warning: "模型已手动修改",
        editedAt: "2026-06-21T00:00:00.000Z",
      },
      {
        requirementModelTraceability: [],
        designModelTraceability: [],
      },
    );

    expect(savedBodies).toHaveLength(1);
    expect(savedBodies[0]?.state).toMatchObject({
      requirementModelTraceability: [],
      designModelTraceability: [],
      manualModelEditStatus: {
        class: expect.objectContaining({ status: "dirty" }),
      },
    });
  });

  it("replays manual requirement model edits after project workspace conflicts", async () => {
    let workspaceReads = 0;
    let workspaceWrites = 0;
    const savedBodies: Array<Record<string, unknown>> = [];
    const concurrentDesignModel = {
      diagramKind: "sequence",
      modelId: "sequence:uc_borrow_book",
      title: "其他成员刚更新的顺序图",
      summary: "借书流程。",
      notes: [],
      participants: [],
      messages: [],
      fragments: [],
    };
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        workspaceReads += 1;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: workspaceReads === 1 ? 6 : 7,
            updatedAt: "2026-05-22T02:00:00.000Z",
            updatedByUserId: "teacher-1",
            state: {
              requirementText:
                workspaceReads === 1
                  ? "原始需求"
                  : "其他成员刚更新的需求",
              rules: [],
              selectedDiagramTypes: [],
              models: {},
              designModels:
                workspaceReads === 1
                  ? {}
                  : { "sequence:uc_borrow_book": concurrentDesignModel },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        workspaceWrites += 1;
        const body = JSON.parse(String(options.body));
        savedBodies.push(body);
        if (workspaceWrites === 1) {
          return new Response(
            JSON.stringify({
              message: "项目已由其他成员更新，请刷新最新状态后再保存。",
              currentVersion: 7,
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 8,
            updatedAt: "2026-05-22T02:05:00.000Z",
            updatedByUserId: "teacher-1",
            state: body.state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          message: `unexpected request ${String(url)} ${options?.method ?? "GET"}`,
        }),
        { status: 500 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    storeManagedUserSettings();
    await repository.loadWorkspace();
    await repository.saveRequirementModelEdit!(
      "class",
      {
        diagramKind: "class",
        title: "手动编辑后的领域模型",
        summary: "保留成员并发更新后保存。",
        notes: [],
        classes: [],
        interfaces: [],
        enums: [],
        relationships: [],
      } as unknown as DiagramModelSpec,
      {
        status: "dirty",
        warning: "模型已手动修改",
        editedAt: "2026-06-21T00:00:00.000Z",
      },
    );

    expect(workspaceReads).toBe(2);
    expect(workspaceWrites).toBe(2);
    expect(savedBodies[1]?.baseVersion).toBe(7);
    expect(savedBodies[1]?.state).toMatchObject({
      requirementText: "其他成员刚更新的需求",
      designModels: {
        "sequence:uc_borrow_book": concurrentDesignModel,
      },
      manualModelEditStatus: {
        class: expect.objectContaining({ status: "dirty" }),
      },
    });
    expect(
      ((savedBodies[1]?.state as Record<string, unknown>).models as Record<
        string,
        { title?: string }
      >).class?.title,
    ).toBe("手动编辑后的领域模型");
  });

  it("serializes concurrent project workspace saves with the latest base version", async () => {
    const savedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 2,
            updatedAt: "2026-05-22T02:00:00.000Z",
            updatedByUserId: "teacher-1",
            state: {
              requirementText: "已保存的项目需求",
              rules: [],
              selectedDiagramTypes: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedBodies.push(JSON.parse(String(options.body)));
        const nextVersion = 2 + savedBodies.length;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: nextVersion,
            updatedAt: "2026-05-22T02:05:00.000Z",
            updatedByUserId: "teacher-1",
            state: savedBodies.at(-1)?.state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          message: `unexpected request ${String(url)} ${options?.method ?? "GET"}`,
        }),
        { status: 500 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.loadWorkspace();

    await Promise.all([
      repository.updateRequirementText("第一次需求"),
      repository.updateRequirementText("第二次需求"),
    ]);

    expect(savedBodies).toHaveLength(2);
    expect(savedBodies[0]?.baseVersion).toBe(2);
    expect(savedBodies[1]?.baseVersion).toBe(3);
    expect(
      (savedBodies[0]?.state as Record<string, unknown>).requirementText,
    ).toBe("第一次需求");
    expect(
      (savedBodies[1]?.state as Record<string, unknown>).requirementText,
    ).toBe("第二次需求");
  });

  it("does not confirm an obsolete visual check after a workspace conflict", async () => {
    let reads = 0;
    let writes = 0;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (!url.endsWith("/api/projects/library-booking/workspace")) return new Response("not found", { status: 404 });
      if (options?.method === "PUT") {
        writes += 1;
        return new Response(JSON.stringify({ message: "项目已由其他成员更新" }), { status: 409, headers: { "Content-Type": "application/json" } });
      }
      reads += 1;
      return new Response(JSON.stringify({ projectId: "library-booking", version: reads, state: {
        requirementText: "预约需求",
        visualReviews: { "requirements:usecase": { findings: [], status: "pending_review", issues: ["标签不可读"], reason: "请人工确认", attempts: 3, checkedAt: reads === 1 ? "check-old" : "check-new" } },
      } }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const repository = createHttpWorkspaceRepository({ projectId: "library-booking" });
    await repository.loadWorkspace();
    await expect(repository.confirmVisualReview!("requirements:usecase", "check-old")).rejects.toThrow("视觉检查结果已更新");
    expect(reads).toBe(2);
    expect(writes).toBe(1);
  });


  it("loads an empty workspace without restoring historical runs", async () => {
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify({
      projectId: "library-booking", version: 0, state: {},
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const repository = createHttpWorkspaceRepository({ projectId: "library-booking" });
    const workspace = await repository.loadWorkspace();
    expect(workspace.requirementText).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/projects/library-booking/workspace");
    expect(repository).not.toHaveProperty("restoreRunHistory");
  });

  it("lists project run history from summaries without hydrating run details", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/projects/library-booking/runs")) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            runs: [
              {
                runId: "run-active",
                status: "running",
                stage: "generate_models",
                createdAt: "2026-05-22T01:00:00.000Z",
                snapshotAvailable: true,
              },
              { operationType: "requirement_modeling" as const,
                runId: "run-complete",
                status: "completed",
                stage: "render_svg",
                runKind: "requirements",
                errorMessage: "部分图表渲染失败",
                diagramErrorCount: 1,
                diagramErrorSummary: [
                  {
                    diagramId: "activity",
                    stage: "render_svg",
                    message: "PlantUML 修复失败",
                  },
                ],
                partialFailure: true,
                createdAt: "2026-05-22T00:00:00.000Z",
                snapshotAvailable: true,
              },
              { operationType: "requirement_modeling" as const,
                runId: "run-interrupted",
                status: "interrupted",
                stage: "generate_models",
                runKind: "requirements",
                derivedRunIds: ["run-retry"],
                latestAction: "retry",
                latestActionRunId: "run-retry",
                latestActionAt: "2026-05-21T23:40:00.000Z",
                createdAt: "2026-05-21T23:30:00.000Z",
                snapshotAvailable: true,
              },
              { operationType: "requirement_modeling" as const,
                runId: "run-retry",
                status: "queued",
                stage: "generate_models",
                runKind: "requirements",
                sourceRunId: "run-interrupted",
                sourceAction: "retry",
                sourceRunStatus: "interrupted",
                createdAt: "2026-05-21T23:40:00.000Z",
                snapshotAvailable: true,
              },
              { operationType: "document_generation" as const,
                runId: "run-doc-failed",
                status: "failed",
                stage: "render_document_file",
                runKind: "document",
                documentKind: "requirementsSpec",
                errorMessage: "证据包组装失败",
                documentDownloadAvailable: true,
                createdAt: "2026-05-21T23:00:00.000Z",
                snapshotAvailable: true,
              },
              { operationType: "document_generation" as const,
                runId: "run-doc-warning",
                status: "completed",
                stage: "render_document_file",
                runKind: "document",
                documentKind: "requirementsSpec",
                documentDownloadAvailable: true,
                documentId: "doc-1",
                documentFileName: "requirements-renamed.docx",
                documentVersion: 2,
                documentStatus: "active",
                documentByteLength: 2048,
                missingArtifactCount: 2,
                missingArtifactSummary: [
                  "用例图：缺少可嵌入图片源",
                  "类图：PNG 渲染失败",
                ],
                createdAt: "2026-05-21T22:00:00.000Z",
                snapshotAvailable: true,
              },
              { operationType: "document_generation" as const,
                runId: "run-doc-deleted",
                status: "completed",
                stage: "render_document_file",
                runKind: "document",
                documentKind: "requirementsSpec",
                documentDownloadAvailable: false,
                documentId: "doc-deleted",
                documentFileName: "requirements-deleted.docx",
                documentVersion: 1,
                documentStatus: "deleted",
                documentRestoreAvailable: true,
                documentByteLength: 2048,
                createdAt: "2026-05-21T21:00:00.000Z",
                snapshotAvailable: true,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/projects/library-booking/runs/run-active")) {
        return new Response(
          JSON.stringify({
            run: { runId: "run-active", model: "gpt-5.4" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/projects/library-booking/runs/run-complete")) {
        return new Response(
          JSON.stringify({
            run: {
              runId: "run-complete",
              model: "gpt-5.4",
              startedAt: "2026-05-22T00:00:00.000Z",
            },
            snapshot: createRunSnapshot({
              runId: "run-complete",
              requirementText: "图书馆预约需求",
            }),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    const history = await repository.listRunHistory();

    expect(history).toHaveLength(7);
    expect(history.map((item) => item.id)).toEqual([
      "run-active",
      "run-complete",
      "run-interrupted",
      "run-retry",
      "run-doc-failed",
      "run-doc-warning",
      "run-doc-deleted",
    ]);
    expect(history[0]?.snapshot).toBeNull();
    expect(history[1]?.providerModel).toBe("默认模型");
    expect(history[1]).toMatchObject({
      errorMessage: "任务遇到内部错误，请联系管理员。",
      diagramErrorCount: 1,
      partialFailure: true,
    });
    expect(history[1]?.diagramErrorSummary).toEqual([
      {
        diagramId: "activity",
        stage: "render_svg",
        message: "PlantUML 修复失败",
      },
    ]);
    expect(history[1]?.summary).toContain("失败原因 任务遇到内部错误，请联系管理员。");
    expect(history[1]?.summary).toContain(
      "图级失败 1 张图：总体业务流程（图表生成失败，请稍后重试。）",
    );
    expect(history[2]).toMatchObject({
      status: "interrupted",
      runKind: "requirements",
      stage: "generate_models",
      snapshotAvailable: true,
    });
    expect(history[2]?.summary).toContain("服务中断，可重试");
    expect(history[2]?.summary).toContain("阶段 generate_models");
    expect(history[2]).toMatchObject({
      derivedRunIds: ["run-retry"],
      latestAction: "retry",
      latestActionRunId: "run-retry",
      latestActionAt: "2026-05-21T23:40:00.000Z",
    });
    expect(history[2]?.summary).toContain("已重试为 run-retry");
    expect(history[3]).toMatchObject({
      sourceRunId: "run-interrupted",
      sourceAction: "retry",
      sourceRunStatus: "interrupted",
    });
    expect(history[3]?.summary).toContain("重试自 run-interrupted");
    expect(history[4]).toMatchObject({
      status: "failed",
      documentDownloadAvailable: false,
    });
    expect(history[4]?.summary).toContain("失败原因 任务遇到内部错误，请联系管理员。");
    expect(history[4]?.summary).not.toContain("文档可下载");
    expect(history[4]?.summary).not.toContain("快照可恢复");
    expect(history[5]).toMatchObject({
      status: "completed",
      documentKind: "requirementsSpec",
      documentId: "doc-1",
      documentFileName: "requirements-renamed.docx",
      documentVersion: 2,
      documentStatus: "active",
      documentByteLength: 2048,
      documentDownloadAvailable: true,
      missingArtifactCount: 2,
      missingArtifactSummary: [
        "用例图：缺少可嵌入图片源",
        "类图：PNG 渲染失败",
      ],
    });
    expect(history[5]?.summary).toContain(
      "缺失图 2 项：用例图：缺少可嵌入图片源、类图：PNG 渲染失败",
    );
    expect(history[5]?.summary).toContain("文档可下载");
    expect(history[5]?.summary).not.toContain("快照可恢复");
    expect(history[6]).toMatchObject({
      status: "completed",
      documentKind: "requirementsSpec",
      documentId: "doc-deleted",
      documentFileName: "requirements-deleted.docx",
      documentStatus: "deleted",
      documentRestoreAvailable: true,
      documentDownloadAvailable: false,
    });
    expect(history[6]?.summary).not.toContain("文档可下载");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears project run history through the project runs collection endpoint", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/runs") &&
        init?.method === "DELETE"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            deletedRunIds: ["run-1"],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.clearRunHistory();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain("/api/projects/library-booking/runs");
    expect(init?.method).toBe("DELETE");
    expect(new Headers(init?.headers).get("X-UML-Project-Id")).toBe(
      "library-booking",
    );
  });

  it("persists requirement run snapshots incrementally with diagram versions", async () => {
    const existingUseCase = {
      diagramKind: "usecase",
      modelId: "req-usecase",
      title: "借书用例",
      summary: "保存已有需求模型",
      notes: [],
      systemBoundaries: [],
      actors: [],
      useCases: [],
      relationships: [],
    };
    const generatedClass = {
      diagramKind: "class",
      modelId: "req-class",
      title: "借书领域类图",
      summary: "保存本次领域模型",
      notes: [],
      interfaces: [],
      enums: [],
      classes: [],
      relationships: [],
    };
    const snapshot = createRunSnapshot({
      runId: "run-class",
      requirementText: "图书馆需求",
      selectedDiagrams: ["class"],
      rules: [
        {
          id: "R1",
          type: "functional" as const,
          text: "系统应支持借书。",

        },
      ],
      models: [generatedClass as never],
      plantUml: [{ diagramKind: "class", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "class",
          svg: "<svg />",
          renderMeta: createRenderMeta({
            generatedAt: "2026-05-24T00:00:00.000Z",
          }),
        },
      ],
    });
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 7,
            state: {
              requirementText: "图书馆需求",
              rulesVersion: 1,
              rulesBasedOnTextVersion: 0,
              diagramVersions: { usecase: 1 },
              generatedDiagramTypes: ["usecase"],
              models: { usecase: existingUseCase },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 8,
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.state.rulesVersion).toBe(1);
    expect(body.state.diagramVersions).toEqual({ usecase: 1, class: 1 });
    expect(body.state.generatedDiagramTypes).toEqual(["usecase", "class"]);
    expect(body.state.models.usecase).toEqual(existingUseCase);
    expect(body.state.models["req-class"]).toEqual(generatedClass);
  });

  it("retries terminal snapshot persistence after project workspace conflicts", async () => {
    const concurrentUseCase = {
      diagramKind: "usecase",
      modelId: "req-usecase",
      title: "借书用例",
      summary: "保存成员更新的需求模型",
      notes: [],
      systemBoundaries: [],
      actors: [],
      useCases: [],
      relationships: [],
    };
    const generatedClass = {
      diagramKind: "class",
      modelId: "req-class",
      title: "借书领域类图",
      summary: "保存本次领域模型",
      notes: [],
      interfaces: [],
      enums: [],
      classes: [],
      relationships: [],
    };
    const concurrentRule = {
      id: "R-current",
      type: "functional" as const,
      text: "其他成员刚补充最新借书需求。",

    };
    const snapshot = createRunSnapshot({
      runId: "run-terminal-class",
      requirementText: "生成开始时的图书馆需求",
      selectedDiagrams: ["class"],
      rules: [
        {
          id: "R-old",
          type: "functional" as const,
          text: "系统应支持借书。",

        },
      ],
      models: [generatedClass as never],
      plantUml: [{ diagramKind: "class", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "class",
          svg: "<svg />",
          renderMeta: createRenderMeta({
            generatedAt: "2026-05-24T00:00:00.000Z",
          }),
        },
      ],
    });
    let workspaceReads = 0;
    let workspaceWrites = 0;
    const savedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        workspaceReads += 1;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: workspaceReads === 1 ? 2 : 3,
            state: {
              requirementText:
                workspaceReads === 1
                  ? "旧的图书馆需求"
                  : "其他成员刚更新的图书馆需求",
              rules: workspaceReads === 1 ? [] : [concurrentRule],
              rulesVersion: 1,
              rulesBasedOnTextVersion: 0,
              diagramVersions: { usecase: 1 },
              generatedDiagramTypes: ["usecase"],
              models:
                workspaceReads === 1
                  ? {}
                  : { usecase: concurrentUseCase },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        workspaceWrites += 1;
        const body = JSON.parse(String(options.body));
        savedBodies.push(body);
        if (workspaceWrites === 1) {
          return new Response(
            JSON.stringify({
              message: "项目已由其他成员更新，请刷新最新状态后再保存。",
              currentVersion: 3,
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            state: body.state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    expect(workspaceReads).toBe(2);
    expect(workspaceWrites).toBe(2);
    expect(savedBodies[1]?.baseVersion).toBe(3);
    expect(savedBodies[1]?.sourceRunId).toBe("run-terminal-class");
    expect(savedBodies[1]?.state).toMatchObject({
      requirementText: "其他成员刚更新的图书馆需求",
      rules: [concurrentRule],
      generatedDiagramTypes: ["usecase", "class"],
      models: {
        usecase: concurrentUseCase,
        "req-class": generatedClass,
      },
    });
  });

  it("does not mark failed requirement diagrams as generated when persisting partial snapshots", async () => {
    const generatedActivity = {
      diagramKind: "activity",
      modelId: "req-activity",
      title: "总体业务流程",
      summary: "报名流程",
      notes: [],
      swimlanes: [],
      nodes: [{ id: "start", type: "start" }, { id: "end", type: "end" }],
      relationships: [{ id: "finish", type: "control_flow", sourceId: "start", targetId: "end" }],
    };
    const snapshot = createRunSnapshot({
      runId: "run-partial-failed",
      requirementText: "活动日历需求",
      selectedDiagrams: ["activity", "prototype"],
      rules: [
        {
          id: "R1",
          type: "functional" as const,
          text: "用户可以浏览活动页面。",

        },
      ],
      models: [generatedActivity as never],
      plantUml: [{ diagramKind: "activity", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "activity",
          svg: "<svg />",
          renderMeta: createRenderMeta({
            generatedAt: "2026-05-24T00:00:00.000Z",
          }),
        },
      ],
      diagramErrors: {
        prototype: {
          stage: "generate_models",
          error: {
            code: "RUN_DEPENDENCY_MISSING",
            message: "原型界面关系生成失败",
            category: "generation",
            retryable: false,
          },
        },
      },
      currentStage: "generate_models",
      status: "failed",
      error: {
        code: "RUN_DEPENDENCY_MISSING",
        message: "原型界面关系生成失败",
        category: "generation",
        retryable: false,
      },
    });
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 3,
            state: {
              requirementText: "活动日历需求",
              rulesVersion: 1,
              generatedDiagramTypes: ["usecase"],
              models: {
                usecase: {
                  diagramKind: "usecase",
                  modelId: "req-usecase",
                  title: "活动日历用例",
                  summary: "保存已有需求模型",
                  notes: [],
                  systemBoundaries: [],
                  actors: [],
                  useCases: [],
                  relationships: [],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.state.generatedDiagramTypes).toEqual(["usecase", "activity"]);
    expect(body.state.models["req-activity"]).toEqual(generatedActivity);
    expect(body.state.models.prototype).toBeUndefined();
    expect(body.state.diagramErrors.prototype.error.code).toBe(
      "RUN_DEPENDENCY_MISSING",
    );
    expect(body.state.diagramVersions).toEqual({ activity: 1 });
  });

  it("does not clear existing artifacts when a completed snapshot only reports a selected diagram error", async () => {
    const contextUseCase = {
      diagramKind: "usecase",
      title: "用例模型",
      summary: "既有用例。",
      notes: [],
      actors: [],
      useCases: [],
      systemBoundaries: [],
      relationships: [],
    };
    const contextClass = {
      diagramKind: "class",
      title: "领域概念模型",
      summary: "既有领域模型。",
      notes: [],
      classes: [],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const contextDeployment = {
      diagramKind: "deployment",
      title: "部署需求模型",
      summary: "上一子任务成功生成。",
      notes: [],
      nodes: [],
      databases: [],
      components: [],
      externalSystems: [],
      artifacts: [],
      relationships: [],
    };
    const snapshot = createRunSnapshot({
      runId: "run-activity-timeout",
      requirementText: "活动日历需求",
      selectedDiagrams: ["activity"],
      rules: [],
      models: [contextUseCase, contextClass, contextDeployment] as never,
      diagramErrors: {
        activity: {
          stage: "generate_models",
          error: {
            code: "PLATFORM_PROVIDER_TIMEOUT",
            message: "当前模型服务响应超时，请稍后重试。",
            category: "platform_provider",
            retryable: true,
          },
        },
      },
      currentStage: "render_svg",
      status: "completed",
      error: null,
    });
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 18,
            state: {
              requirementText: "活动日历需求",
              rulesVersion: 1,
              generatedDiagramTypes: ["usecase", "class", "deployment"],
              models: {
                usecase: contextUseCase,
                class: contextClass,
                deployment: contextDeployment,
              },
              plantUml: {
                usecase: "@startuml\nusecase Existing\n@enduml",
                class: "@startuml\nclass Existing\n@enduml",
                deployment: "@startuml\nnode Existing\n@enduml",
              },
              svgArtifacts: {
                usecase: { diagramKind: "usecase", renderMeta: createRenderMeta(), svg: "<svg>usecase</svg>" },
                class: { diagramKind: "class", renderMeta: createRenderMeta(), svg: "<svg>class</svg>" },
                deployment: {
                  diagramKind: "deployment",
                  renderMeta: createRenderMeta(),
                  svg: "<svg>deployment</svg>",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 19,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.5",
      durationMs: 100,
    });

    expect(savedState?.generatedDiagramTypes).toEqual([
      "usecase",
      "class",
      "deployment",
    ]);
    expect(
      Object.keys(
        (savedState?.plantUml as Record<string, unknown>) ?? {},
      ).sort(),
    ).toEqual(["class", "deployment", "usecase"]);
    expect(
      Object.keys(
        (savedState?.svgArtifacts as Record<string, unknown>) ?? {},
      ).sort(),
    ).toEqual(["class", "deployment", "usecase"]);
    expect(
      (savedState?.models as Record<string, unknown>).activity,
    ).toBeUndefined();
    expect(
      (
        (savedState?.diagramErrors as Record<
          string,
          { error: { code: string } }
        >) ?? {}
      ).activity.error.code,
    ).toBe("PLATFORM_PROVIDER_TIMEOUT");
  });

  it("preserves existing requirement SVG assets when an analysis-only snapshot carries context models", async () => {
    const existingUseCase = {
      diagramKind: "usecase",
      title: "既有用例模型",
      summary: "既有用例",
      notes: [],
      actors: [{ id: "viewer", name: "用户", actorType: "human", responsibilities: [] }],
      useCases: [{ id: "uc_view", name: "查看活动", goal: "浏览活动", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [] }],
      systemBoundaries: [],
      relationships: [{ id: "view-activities", type: "association", sourceId: "viewer", targetId: "uc_view" }],
    };
    const snapshotContextUseCase = {
      ...existingUseCase,
      title: "上下文用例模型",
    };
    const existingClass = {
      diagramKind: "class",
      title: "领域概念模型",
      summary: "领域概念",
      notes: [],
      classes: [],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const existingDeployment = {
      diagramKind: "deployment",
      title: "部署需求模型",
      summary: "部署需求",
      notes: [],
      nodes: [],
      databases: [],
      components: [],
      externalSystems: [],
      artifacts: [],
      relationships: [],
    };
    const existingPrototype = {
      diagramKind: "prototype",
      modelId: "proto-1",
      title: "原型界面关系",
      summary: "原型关系",
      notes: [],
      nodes: [],
      relationships: [],
    };
    const analysisModel = {
      diagramKind: "analysis",
      modelId: "analysis:uc_view",
      sourceUseCaseId: "uc_view",
      title: "查看活动需求分析",
      summary: "用例事件流分析",
      notes: [],
      participants: [],
      messages: [],
      fragments: [],
    };
    const snapshot = createRunSnapshot({
      runId: "run-analysis-only",
      requirementText: "日历需求",
      selectedDiagrams: ["analysis"],
      rules: [],
      models: [
        snapshotContextUseCase,
        existingClass,
        existingDeployment,
        existingPrototype,
        analysisModel,
      ] as never,
      plantUml: [
        {
          diagramKind: "analysis",
          modelId: "analysis:uc_view",
          source: "@startuml\n@enduml",
        },
      ],
      svgArtifacts: [
        {
          diagramKind: "analysis",
          modelId: "analysis:uc_view",
          svg: "<svg>analysis</svg>",
          renderMeta: createRenderMeta({
            generatedAt: "2026-06-08T00:00:00.000Z",
          }),
        },
      ],
    });
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 7,
            state: {
              requirementText: "日历需求",
              rulesVersion: 1,
              rulesBasedOnTextVersion: 0,
              diagramVersions: {
                usecase: 1,
                class: 1,
                deployment: 1,
                prototype: 1,
              },
              generatedDiagramTypes: [
                "usecase",
                "class",
                "deployment",
                "prototype",
              ],
              models: {
                usecase: existingUseCase,
                class: existingClass,
                deployment: existingDeployment,
                "proto-1": existingPrototype,
              },
              plantUml: {
                usecase: "@startuml\nusecase\n@enduml",
                class: "@startuml\nclass\n@enduml",
                deployment: "@startuml\ndeployment\n@enduml",
                "proto-1": "@startuml\nprototype\n@enduml",
              },
              svgArtifacts: {
                usecase: { diagramKind: "usecase", renderMeta: createRenderMeta(), svg: "<svg>usecase</svg>" },
                class: { diagramKind: "class", renderMeta: createRenderMeta(), svg: "<svg>class</svg>" },
                deployment: {
                  diagramKind: "deployment",
                  renderMeta: createRenderMeta(),
                  svg: "<svg>deployment</svg>",
                },
                "proto-1": {
                  diagramKind: "prototype",
                  modelId: "proto-1",
                  renderMeta: createRenderMeta(),
                  svg: "<svg>prototype</svg>",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 8,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    expect(savedState?.models).toMatchObject({
      usecase: existingUseCase,
      class: existingClass,
      deployment: existingDeployment,
      "proto-1": existingPrototype,
      "analysis:uc_view": analysisModel,
    });
    expect(
      (savedState?.models as Record<string, { title: string }>).usecase.title,
    ).toBe("既有用例模型");
    expect(savedState?.plantUml).toMatchObject({
      usecase: "@startuml\nusecase\n@enduml",
      class: "@startuml\nclass\n@enduml",
      deployment: "@startuml\ndeployment\n@enduml",
      "proto-1": "@startuml\nprototype\n@enduml",
      "analysis:uc_view": "@startuml\n@enduml",
    });
    expect(savedState?.svgArtifacts).toMatchObject({
      usecase: { svg: "<svg>usecase</svg>" },
      class: { svg: "<svg>class</svg>" },
      deployment: { svg: "<svg>deployment</svg>" },
      "proto-1": { svg: "<svg>prototype</svg>" },
      "analysis:uc_view": { svg: "<svg>analysis</svg>" },
    });
    expect(savedState?.diagramVersions).toEqual({
      usecase: 1,
      class: 1,
      deployment: 1,
      prototype: 1,
      analysis: 1,
    });
    const receipts = savedState?.diagramInputFingerprints as Record<string, string>;
    expect(receipts["analysis:uc_view"]).toBe(snapshotInputFingerprint({ requirementText: snapshot.requirementText, rules: snapshot.rules }));
    for (const id of ["usecase", "class", "deployment", "prototype"]) expect(receipts[id]).toBe("stale:unknown");

  });

  it("preserves the explicit generated baseline", async () => {
    const rule = {
      id: "r1",
      type: "functional" as const,
      text: "用户提交订单。",

    };
    const reviewedRequirement = createAtomicRequirement({
      actor: "用户",
      status: "accepted",
    });
    const reviewedBaseline = createRequirementBaseline([reviewedRequirement]);
    const snapshotBaseline = createRequirementBaseline([
      createAtomicRequirement({ actor: null, status: "pending-review" }),
    ]);
    const snapshot = createRunSnapshot({
      runId: "run-usecase",
      requirementText: "订单需求",
      selectedDiagrams: ["usecase"],
      rules: [rule],
      requirementBaseline: snapshotBaseline,
      models: [
        {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "用户提交订单。",
          notes: [],
          actors: [],
          useCases: [],
          systemBoundaries: [],
          relationships: [],
        },
      ],
    });
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            state: {
              requirementText: "订单需求",
              rules: [rule],
              requirementBaseline: reviewedBaseline,
              requirementQualityReport: reviewedBaseline.qualityReport,

            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 5,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.5",
      durationMs: 100,
    });

    expect(savedState?.requirementBaseline).toEqual(snapshot.requirementBaseline);
    expect(savedState?.generatedDiagramTypes).toContain("usecase");
    expect(
      (savedState?.diagramInputFingerprints as Partial<Record<string, string>>)
        .usecase,
    ).toBeTruthy();
  });

  it("uses current reviewed rules and returned models when persisting requirement model snapshots", async () => {
    const currentRule = {
      id: "r1",
      type: "functional" as const,
      text: "用户提交当前订单。",

    };
    const snapshotRule = {
      ...currentRule,
      text: "用户提交旧订单。",
    };
    const snapshot = createRunSnapshot({
      runId: "run-usecase",
      requirementText: "订单需求",
      selectedDiagrams: ["usecase"],
      rules: [snapshotRule],
      models: [
        {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "用户提交订单。",
          notes: [],
          actors: [],
          useCases: [],
          systemBoundaries: [],
          relationships: [],
        },
      ],
    });
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            state: {
              requirementText: "订单需求",
              rules: [currentRule],
              generatedDiagramTypes: [],
              selectedDiagramTypes: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 5,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.5",
      durationMs: 100,
    });

    const expectedWorkspaceFingerprint = snapshotInputFingerprint({
      requirementText: "订单需求",
      rules: [currentRule],
    });
    const expectedSnapshotFingerprint = snapshotInputFingerprint({
      requirementText: "订单需求",
      rules: [snapshotRule],
    });
    expect(savedState?.generatedDiagramTypes).toContain("usecase");
    expect(savedState?.selectedDiagramTypes).toEqual([]);
    expect(savedState?.requirementInputFingerprint).toBe(
      expectedWorkspaceFingerprint,
    );
    expect(
      (savedState?.diagramInputFingerprints as Partial<Record<string, string>>)
        .usecase,
    ).toBe(expectedSnapshotFingerprint);
  });

  it("discards retired server-synced repair candidates after a rules-only run", async () => {
    const requirement = createAtomicRequirement();
    const baseline = createRequirementBaseline([requirement]);
    const snapshot = createRunSnapshot({
      runId: "run-rules",
      requirementText: "订单需求",
      selectedDiagrams: [],
      rules: [
        {
          id: "r1",
          type: "functional" as const,
          text: "用户提交订单。",

        },
      ],
      requirementBaseline: baseline,
    });
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            sourceRunId: "run-rules",
            state: {
              requirementText: "订单需求",
              rules: snapshot.rules,
              requirementBaseline: baseline,

            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        throw new Error("Rules-only results must come from server sync");
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.5",
      durationMs: 100,
    });

    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
  });

  it("persists design run snapshots incrementally without deleting existing diagrams", async () => {
    const requirementModel = {
      diagramKind: "usecase",
      modelId: "usecase",
      title: "座位预约用例",
      summary: "学生预约座位",
      notes: [],
      actors: [{ id: "student", name: "学生", actorType: "human", responsibilities: [] }],
      useCases: [{ id: "uc-book-seat", name: "预约座位", goal: "完成座位预约", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [] }],
      systemBoundaries: [],
      relationships: [{ id: "book-seat", type: "association", sourceId: "student", targetId: "uc-book-seat" }],
    };
    const requirementModelTraceability = [
      {
        ruleId: "rule-book-seat",
        target: {
          modelId: "usecase",
          diagramKind: "usecase",
          elementId: "uc-book-seat",
          elementKind: "useCase",
          label: "预约座位",
        },
      },
    ];
    const currentDesignFingerprint = designInputFingerprint(
      [requirementModel as never],
      requirementModelTraceability as never,
    );
    const existingClass = {
      diagramKind: "class",
      modelId: "class",
      title: "预约设计类图",
      summary: "预约领域结构",
      notes: [],
      interfaces: [],
      enums: [],
      relationships: [],
      classes: [{ id: "class-booking", name: "Booking", attributes: [], operations: [], constraints: [] }],
    };
    const generatedTable = {
      diagramKind: "table",
      modelId: "table",
      title: "预约数据库表",
      summary: "持久化预约记录",
      notes: [],
      relationships: [],
      tables: [{ id: "table-bookings", name: "bookings", columns: [{ id: "id", name: "id", dataType: "bigint", nullable: false }], relationalConstraints: [{ id: "pk-bookings", type: "primary-key", columnIds: ["id"] }] }],
    };
    const existingClassTraceability = {
      source: {
        modelId: "class",
        diagramKind: "class",
        elementId: "class-booking",
        elementKind: "class",
        label: "Booking",
      },
      targets: [
        {
          modelId: "usecase",
          diagramKind: "usecase",
          elementId: "uc-book-seat",
          elementKind: "useCase",
          label: "预约座位",
        },
      ],
      mappingSource: "llm",
    };
    const generatedTableTraceability = {
      source: {
        modelId: "table",
        diagramKind: "table",
        elementId: "table-bookings",
        elementKind: "table",
        label: "bookings",
      },
      targets: [
        {
          modelId: "usecase",
          diagramKind: "usecase",
          elementId: "uc-book-seat",
          elementKind: "useCase",
          label: "预约座位",
        },
      ],
      mappingSource: "llm",
    };
    const snapshot = {
      runId: "design-table",
      operationType: "design_modeling",
      outputManifest: [{ kind: "model", id: "table", diagramKind: "table" }],
      requirementText: "图书馆需求",
      rules: [
        {
          id: "rule-book-seat",
          text: "用户可以预约座位。",
          type: "functional" as const,
        },
      ],
      selectedDiagrams: ["table"],
      requirementModels: [requirementModel],
      requirementModelTraceability,
      models: [generatedTable],
      designModelTraceability: [generatedTableTraceability],
      plantUml: [{ diagramKind: "table", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "table",
          renderMeta: createRenderMeta({ generatedAt: "2026-05-24T00:00:00.000Z" }),
          svg: "<svg />",
        },
      ],
      diagramErrors: {},
      designTrace: [],
      currentStage: "render_svg",
      status: "completed",
      error: null,
    };
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 9,
            state: {
              requirementText: "图书馆需求",
              generatedDesignDiagramTypes: ["class"],
              models: { usecase: requirementModel },
              requirementModelTraceability,
              designModels: { class: existingClass },
              designPlantUml: { class: "@startuml\n@enduml" },
              designSvgArtifacts: {
                class: {
                  diagramKind: "class",
                  renderMeta: createRenderMeta({ generatedAt: "2026-05-24T00:00:00.000Z" }),
                  svg: "<svg />",
                },
              },
              designInputFingerprints: { class: currentDesignFingerprint },
              designModelTraceability: [existingClassTraceability],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 10,
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot as never, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.state.generatedDesignDiagramTypes).toEqual(["class", "table"]);
    expect(body.state.designModels.class).toEqual(existingClass);
    expect(body.state.designModels.table).toEqual(generatedTable);
  });

  it("replaces old design records for the same successful design kind", async () => {
    const oldSequence = {
      diagramKind: "sequence",
      modelId: "sequence:uc_old",
      title: "已有用例实现设计",
      summary: "上一版本交互",
      notes: [],
      sourceUseCaseId: "uc_old",
      participants: [],
      messages: [],
      fragments: [],
    };
    const newSequence = {
      diagramKind: "sequence",
      modelId: "sequence:uc-1",
      title: "新生成用例实现设计",
      summary: "当前版本交互",
      notes: [],
      sourceUseCaseId: "uc-1",
      participants: [],
      messages: [],
      fragments: [],
    };
    const existingClass = {
      diagramKind: "class",
      modelId: "class",
      title: "已有设计类图",
      summary: "保留已有设计结构",
      notes: [],
      interfaces: [],
      enums: [],
      relationships: [],
      classes: [],
    };
    const snapshot = {
      runId: "design-sequence",
      operationType: "design_modeling",
      outputManifest: [{ kind: "model", id: "sequence:uc-1", diagramKind: "sequence" }],
      requirementText: "图书馆需求",
      rules: [],
      selectedDiagrams: ["sequence"],
      requestedDiagrams: ["sequence"],
      requirementModels: [],
      requirementModelTraceability: [],
      models: [newSequence],
      designModelTraceability: [
        {
          source: {
            diagramKind: "usecase",
            elementId: "uc-1",
            elementKind: "useCase",
            label: "查看座位",
          },
          targets: [
            {
              modelId: "sequence:uc-1",
              diagramKind: "sequence",
              elementId: "message-1",
              elementKind: "message",
              label: "查看座位",
            },
          ],
        },
      ],
      plantUml: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc-1",
          source: "@startuml\n@enduml",
        },
      ],
      svgArtifacts: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc-1",
          svg: "<svg />",
          renderMeta: {
            engine: "plantuml",
            generatedAt: "2026-06-10T00:00:00.000Z",
            sourceLength: 16,
            durationMs: 1,
          },
        },
      ],
      diagramErrors: {},
      designTrace: [],
      currentStage: "render_svg",
      status: "completed",
      error: null,
    };
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 9,
            state: {
              requirementText: "图书馆需求",
              generatedDesignDiagramTypes: ["sequence", "class"],
              designModels: {
                "sequence:uc_old": oldSequence,
                class: existingClass,
              },
              designPlantUml: {
                "sequence:uc_old": "@startuml\n' old\n@enduml",
                class: "@startuml\nclass Existing\n@enduml",
              },
              designSvgArtifacts: {
                "sequence:uc_old": {
                  diagramKind: "sequence",
                  modelId: "sequence:uc_old",
                  renderMeta: createRenderMeta(),
                  svg: "<svg data-old />",
                },
                class: { diagramKind: "class", renderMeta: createRenderMeta(), svg: "<svg />" },
              },
              designInputFingerprints: {
                "sequence:uc_old": "old-fp",
                class: "class-fp",
              },
              designModelTraceability: [
                {
                  source: {
                    diagramKind: "usecase",
                    elementId: "uc_old",
                    elementKind: "useCase",
                    label: "旧用例",
                  },
                  targets: [
                    {
                      modelId: "sequence:uc_old",
                      diagramKind: "sequence",
                      elementId: "old-message",
                      elementKind: "message",
                      label: "旧消息",
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 10,
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot as never, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(Object.keys(body.state.designModels).sort()).toEqual([
      "class",
      "sequence:uc-1",
    ]);
    expect(Object.keys(body.state.designPlantUml).sort()).toEqual([
      "class",
      "sequence:uc-1",
    ]);
    expect(Object.keys(body.state.designSvgArtifacts).sort()).toEqual([
      "class",
      "sequence:uc-1",
    ]);
    expect(body.state.designInputFingerprints["sequence:uc_old"]).toBeUndefined();
    expect(
      body.state.designModelTraceability.some((entry: {
        targets: Array<{ modelId?: string }>;
      }) =>
        entry.targets.some((target) => target.modelId === "sequence:uc_old"),
      ),
    ).toBe(false);
  });

  it.each(["usecase", "custom-usecase"])("prunes orphan use-case scoped records with the usecase stored under %s", async (modelKey) => {
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 9,
            state: {
              requirementText: "座位预约需求",
              generatedDiagramTypes: ["usecase", "analysis"],
              generatedDesignDiagramTypes: ["sequence"],
              models: {
                [modelKey]: {
                  diagramKind: "usecase",
                  modelId: modelKey,
                  title: "座位预约用例",
                  summary: "查询和预约座位",
                  notes: [],
                  actors: [{ id: "student", name: "学生", actorType: "human", responsibilities: [] }],
                  useCases: [
                    { id: "uc-1", name: "查询座位", goal: "获取空闲座位", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [] },
                    { id: "uc-2", name: "预约座位", goal: "完成预约", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [] },
                  ],
                  systemBoundaries: [],
                  relationships: [
                    { id: "query-seat", type: "association", sourceId: "student", targetId: "uc-1" },
                    { id: "book-seat", type: "association", sourceId: "student", targetId: "uc-2" },
                  ],
                },
                "analysis:uc-1": {
                  diagramKind: "analysis",
                  modelId: "analysis:uc-1",
                  title: "查询座位分析",
                  summary: "当前用例分析",
                  notes: [],
                  sourceUseCaseId: "uc-1",
                  participants: [],
                  messages: [],
                  fragments: [],
                },
                "analysis:uc_old": {
                  diagramKind: "analysis",
                  modelId: "analysis:uc_old",
                  title: "已删除用例分析",
                  summary: "不再被当前用例引用",
                  notes: [],
                  sourceUseCaseId: "uc_old",
                  participants: [],
                  messages: [],
                  fragments: [],
                },
              },
              plantUml: {
                "analysis:uc-1": "@startuml\n@enduml",
                "analysis:uc_old": "@startuml\n' old\n@enduml",
              },
              svgArtifacts: {
                "analysis:uc-1": {
                  diagramKind: "analysis",
                  modelId: "analysis:uc-1",
                  renderMeta: createRenderMeta(),
                  svg: "<svg />",
                },
                "analysis:uc_old": {
                  diagramKind: "analysis",
                  modelId: "analysis:uc_old",
                  renderMeta: createRenderMeta(),
                  svg: "<svg data-old />",
                },
              },
              diagramInputFingerprints: {
                "analysis:uc-1": "current-fp",
                "analysis:uc_old": "old-fp",
              },
              diagramVersions: {
                "analysis:uc-1": 2,
                "analysis:uc_old": 1,
              },
              requirementModelTraceability: [
                {
                  ruleId: "r-current",
                  target: {
                    modelId: "analysis:uc-1",
                    diagramKind: "analysis",
                    elementId: "m-current",
                    elementKind: "message",
                    label: "当前消息",
                  },
                },
                {
                  ruleId: "r-old",
                  target: {
                    modelId: "analysis:uc_old",
                    diagramKind: "analysis",
                    elementId: "m-old",
                    elementKind: "message",
                    label: "旧消息",
                  },
                },
              ],
              designModels: {
                "sequence:uc-1": {
                  diagramKind: "sequence",
                  modelId: "sequence:uc-1",
                  title: "查询座位设计",
                  summary: "当前用例设计",
                  notes: [],
                  sourceUseCaseId: "uc-1",
                  participants: [],
                  messages: [],
                  fragments: [],
                },
                "sequence:uc_old": {
                  diagramKind: "sequence",
                  modelId: "sequence:uc_old",
                  title: "已删除用例设计",
                  summary: "不再被当前用例引用",
                  notes: [],
                  sourceUseCaseId: "uc_old",
                  participants: [],
                  messages: [],
                  fragments: [],
                },
              },
              designPlantUml: {
                "sequence:uc-1": "@startuml\n@enduml",
                "sequence:uc_old": "@startuml\n' old\n@enduml",
              },
              designSvgArtifacts: {
                "sequence:uc-1": {
                  diagramKind: "sequence",
                  modelId: "sequence:uc-1",
                  renderMeta: createRenderMeta(),
                  svg: "<svg />",
                },
                "sequence:uc_old": {
                  diagramKind: "sequence",
                  modelId: "sequence:uc_old",
                  renderMeta: createRenderMeta(),
                  svg: "<svg data-old />",
                },
              },
              designInputFingerprints: {
                "sequence:uc-1": "current-design-fp",
                "sequence:uc_old": "old-design-fp",
              },
              designModelTraceability: [
                {
                  source: {
                    diagramKind: "usecase",
                    elementId: "uc-1",
                    elementKind: "useCase",
                    label: "查询座位",
                  },
                  targets: [
                    {
                      modelId: "sequence:uc-1",
                      diagramKind: "sequence",
                      elementId: "m-current",
                      elementKind: "message",
                      label: "当前消息",
                    },
                  ],
                },
                {
                  source: {
                    diagramKind: "usecase",
                    elementId: "uc_old",
                    elementKind: "useCase",
                    label: "旧用例",
                  },
                  targets: [
                    {
                      modelId: "sequence:uc_old",
                      diagramKind: "sequence",
                      elementId: "m-old",
                      elementKind: "message",
                      label: "旧消息",
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 10,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    const loaded = await repository.loadWorkspace();
    expect(loaded.models["analysis:uc_old"]).toBeUndefined();
    expect(loaded.designModels["sequence:uc_old"]).toBeUndefined();

    await repository.updateRequirementText("座位预约需求（修订）");

    expect(savedState?.models).not.toHaveProperty("analysis:uc_old");
    expect(savedState?.plantUml).not.toHaveProperty("analysis:uc_old");
    expect(savedState?.svgArtifacts).not.toHaveProperty("analysis:uc_old");
    expect(savedState?.designModels).not.toHaveProperty("sequence:uc_old");
    expect(savedState?.designPlantUml).not.toHaveProperty("sequence:uc_old");
    expect(savedState?.designSvgArtifacts).not.toHaveProperty("sequence:uc_old");
    expect(savedState?.diagramInputFingerprints).not.toHaveProperty("analysis:uc_old");
    expect(savedState?.designInputFingerprints).not.toHaveProperty("sequence:uc_old");
    expect(savedState?.requirementModelTraceability).toEqual([
      expect.objectContaining({ ruleId: "r-current" }),
    ]);
    expect(savedState?.designModelTraceability).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ elementId: "uc-1" }),
      }),
    ]);
  });

  it("keeps old design records when the selected design kind failed", async () => {
    const oldSequence = {
      diagramKind: "sequence",
      modelId: "sequence:uc_old",
      title: "已有用例实现设计",
      summary: "保留失败前的成功结果",
      notes: [],
      sourceUseCaseId: "uc_old",
      participants: [],
      messages: [],
      fragments: [],
    };
    const snapshot = {
      runId: "design-sequence-failed",
      operationType: "design_modeling",
      outputManifest: [],
      requirementText: "图书馆需求",
      rules: [],
      selectedDiagrams: ["sequence"],
      requestedDiagrams: ["sequence"],
      requirementModels: [],
      requirementModelTraceability: [],
      models: [],
      designModelTraceability: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {
        sequence: {
          stage: "generate_design_models",
          error: {
            code: "PLATFORM_PROVIDER_TIMEOUT",
            message: "当前模型服务响应超时，请稍后重试。",
            category: "platform_provider",
            retryable: true,
          },
        },
      },
      designTrace: [],
      currentStage: "generate_design_models",
      status: "failed",
      error: {
        code: "PLATFORM_PROVIDER_TIMEOUT",
        message: "当前模型服务响应超时，请稍后重试。",
        category: "platform_provider",
        retryable: true,
      },
    };
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 9,
            state: {
              requirementText: "图书馆需求",
              generatedDesignDiagramTypes: ["sequence"],
              designModels: { "sequence:uc_old": oldSequence },
              designPlantUml: {
                "sequence:uc_old": "@startuml\n' old\n@enduml",
              },
              designSvgArtifacts: {
                "sequence:uc_old": {
                  diagramKind: "sequence",
                  modelId: "sequence:uc_old",
                  renderMeta: createRenderMeta(),
                  svg: "<svg data-old />",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 10,
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot as never, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(Object.keys(body.state.designModels)).toEqual(["sequence:uc_old"]);
    expect(Object.keys(body.state.designPlantUml)).toEqual([
      "sequence:uc_old",
    ]);
    expect(body.state.designDiagramErrors.sequence).toBeTruthy();
  });

  it("keeps every mock document generation as a separate document", async () => {
    const repository = createMockWorkspaceRepository();
    const input: StartDocumentRunInput = {
      documentKind: "requirementsSpec",
      requirementText: "生成需求规格说明书",
      rules: [],
      requirementModels: [],
      requirementModelTraceability: [],
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings: managedProviderSettings,
      useAiText: true,
    };

    const first = await repository.startDocumentRun!(input);
    const second = await repository.startDocumentRun!(input);
    const firstSnapshot = await repository.getDocumentRunSnapshot!(first.runId);
    const secondSnapshot = await repository.getDocumentRunSnapshot!(
      second.runId,
    );
    const documents = await repository.listDocuments!();
    const requirementDocuments = documents.filter(
      (document) => document.documentKind === "requirementsSpec",
    );

    expect(requirementDocuments).toHaveLength(2);
    expect(firstSnapshot.documentId).toBeTruthy();
    expect(secondSnapshot.documentId).toBeTruthy();
    expect(firstSnapshot.documentId).not.toBe(secondSnapshot.documentId);
    expect(
      new Set(requirementDocuments.map((document) => document.id)).size,
    ).toBe(2);
    expect(
      requirementDocuments.every((document) => document.version === 1),
    ).toBe(true);
  });

  it("stores mock run history in localStorage with the configured limit", async () => {
    const repository = createMockWorkspaceRepository();
    for (let index = 0; index < RUN_HISTORY_LIMIT + 2; index += 1) {
      await repository.saveRunHistory(
        createRunSnapshot({
          runId: `run-${index}`,
          requirementText: `需求 ${index}`,
        }),
        { providerModel: "gpt-5.5" },
      );
    }

    const history = await repository.listRunHistory();
    expect(history).toHaveLength(RUN_HISTORY_LIMIT);
    expect(history[0].id).toBe(`run-${RUN_HISTORY_LIMIT + 1}`);
    expect(localStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toContain("gpt-5.5");
  });


  it("prunes older mock history items when localStorage quota is exceeded", async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function setItemWithTinyQuota(key, value) {
        if (
          key === RUN_HISTORY_STORAGE_KEY &&
          typeof value === "string" &&
          value.length > 8_000
        ) {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      });

    const repository = createMockWorkspaceRepository();
    for (let index = 0; index < 6; index += 1) {
      await repository.saveRunHistory(
        createRunSnapshot({
          runId: `quota-run-${index}`,
          requirementText: "x".repeat(3_000),
        }),
        { providerModel: "gpt-5.5" },
      );
    }

    const history = await repository.listRunHistory();
    expect(history[0]?.id).toBe("quota-run-5");
    expect(history.length).toBeLessThan(6);
    expect(setItemSpy).toHaveBeenCalled();
  });

  it("renders PlantUML through the API proxy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              svg: "<svg><text>ok</text></svg>",
              renderMeta: {
                engine: "plantuml",
                generatedAt: new Date().toISOString(),
                sourceLength: 26,
                durationMs: 3,
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
      ),
    );

    const repository = createHttpWorkspaceRepository({
      projectId: "render-project",
    });
    const rendered = await repository.renderPlantUml(
      "class",
      "@startuml\nclass User\n@enduml",
    );

    expect(rendered.svg).toContain("<svg>");
    expect(fetch).toHaveBeenCalledWith(
      "/api/render/svg",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-UML-Project-Id": "render-project",
        }),
        method: "POST",
      }),
    );
  });


});

describe("buildApiUrl", () => {
  it("keeps same-origin api paths stable without a configured base", () => {
    expect(buildApiUrl("/api/runs", "")).toBe("/api/runs");
  });

  it("does not duplicate api when the configured base is /api", () => {
    expect(buildApiUrl("/api/runs", "/api")).toBe("/api/runs");
    expect(buildApiUrl("/api/runs", "/api/")).toBe("/api/runs");
  });

  it("appends api paths to origin-only absolute bases", () => {
    expect(buildApiUrl("/api/runs", "https://example.com")).toBe(
      "https://example.com/api/runs",
    );
  });
});
