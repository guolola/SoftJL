// Verifies run subscriptions recover from broken SSE streams by polling terminal snapshots.
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  
  DesignRunSnapshot,
  DocumentRunSnapshot,
  RunEvent,
  RunSnapshot,
} from "@uml-platform/contracts";
import {
  
  subscribeToDesignRunEvents,
  subscribeToDocumentRunEvents,
  subscribeToRequirementRunEvents,
  subscribeToFeasibilityRunEvents,
  streamProjectRunEvents,
} from "./run-subscriptions";
import { PROJECT_ID_HEADER } from "./project-scope";
import { feasibilityInputsSchema, feasibilityRunSnapshotSchema } from "@uml-platform/contracts";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function eventStreamResponse(events: RunEvent[]) {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

function requirementSnapshot(
  overrides: Partial<RunSnapshot> = {},
): RunSnapshot {
  return {
    runId: "run-req-1",
    requirementText: "生成订单系统 UML",
    selectedDiagrams: ["usecase"],
    analysisTargetUseCaseIds: [],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    visualReviews: {},
    currentStage: "generate_models",
    status: "running",
    error: null,
    ...overrides,
  };
}

function designSnapshot(
  overrides: Partial<DesignRunSnapshot> = {},
): DesignRunSnapshot {
  return {
    runId: "run-design-1",
    requirementText: "生成订单系统设计 UML",
    selectedDiagrams: ["navigation"],
    requestedDiagrams: ["navigation"],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    requirementModels: [],
    requirementModelTraceability: [],
    models: [],
    designModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    designTrace: [],
    visualReviews: {},
    currentStage: "generate_design_models",
    status: "running",
    error: null,
    ...overrides,
  };
}



function documentSnapshot(
  overrides: Partial<DocumentRunSnapshot> = {},
): DocumentRunSnapshot {
  return {
    runId: "run-doc-1",
    documentKind: "requirementsSpec",
    requirementText: "生成订单系统说明书",
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    documentId: "document-1",
    sections: [{ level: 1, title: "需求规定", body: ["正文"] }],
    fileName: "requirements.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 12,
    feasibilityImplementationPlan: null,
    feasibilityInputs: feasibilityInputsSchema.parse({}),
    missingArtifacts: [],
    currentStage: "render_document_file",
    status: "completed",
    error: null,
    ...overrides,
  };
}

function requestHasProjectHeader(init: RequestInit | undefined) {
  const headers = init?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has(PROJECT_ID_HEADER);
  if (Array.isArray(headers)) {
    return headers.some(
      ([key]) => key.toLowerCase() === PROJECT_ID_HEADER.toLowerCase(),
    );
  }
  return Object.prototype.hasOwnProperty.call(headers, PROJECT_ID_HEADER);
}

describe("run subscriptions", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    { kind: "requirements", path: "/api/runs", subscribe: subscribeToRequirementRunEvents, snapshot: requirementSnapshot() },
    { kind: "design", path: "/api/design-runs", subscribe: subscribeToDesignRunEvents, snapshot: designSnapshot() },
    { kind: "document", path: "/api/document-runs", subscribe: subscribeToDocumentRunEvents, snapshot: documentSnapshot({ status: "running" }) },
    { kind: "feasibility", path: "/api/feasibility-runs", subscribe: subscribeToFeasibilityRunEvents, snapshot: feasibilityRunSnapshotSchema.parse({
      runId: "run-feasibility-1", projectId: "project-a", selectedArtifacts: ["context"],
      providerSettings: { providerConfigId: "provider", model: "model" }, rules: [], requirementBaseline: null,
      inputs: {}, contextModel: null, contextPlantUml: null, contextSvg: null, implementationPlan: null,
      contextFingerprint: null, implementationFingerprint: null, currentStage: "generate_context", status: "running", error: null,
    }) },
  ])("restores a $kind snapshot before reconnecting SSE", async ({ path, subscribe, snapshot }) => {
    vi.useFakeTimers();
    let connections = 0;
    const onSnapshot = vi.fn();
    const events: RunEvent[] = [];
    const queued: RunEvent = { type: "queued", eventId: "queued-once" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.split("?")[0].endsWith(`${path}/${snapshot.runId}/events`)) {
        connections += 1;
        return eventStreamResponse(connections === 1 ? [queued] : [queued,
          { type: "completed", eventId: "completed-once", snapshot: { ...snapshot, status: "completed" } }]);
      }
      return jsonResponse(connections >= 2 ? { ...snapshot, status: "completed" } : snapshot);
    }));
    const subscription = subscribe({ runId: snapshot.runId, projectId: "project-a", onEvent: (event) => events.push(event), onSnapshot });
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));
    expect(connections).toBe(1);
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    await vi.advanceTimersByTimeAsync(1_000);
    await subscription;
    expect(connections).toBe(2);
    expect(events.filter((event) => event.type === "queued")).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("completed");
    expect(events.some((event) => event.type === "stage_progress" && event.message?.includes("轮询"))).toBe(false);
  });

  it("keeps synchronizing partial design results when repeated reconnects require polling", async () => {
    vi.useFakeTimers();
    let connections = 0;
    let reads = 0;
    const snapshots: DesignRunSnapshot[] = [];
    const events: RunEvent[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.split("?")[0].endsWith("/events")) {
        connections += 1;
        throw new TypeError("Failed to fetch");
      }
      reads += 1;
      return jsonResponse(designSnapshot({
        status: reads >= 7 ? "completed" : "running",
        svgArtifacts: reads >= 5 ? [{ diagramKind: "navigation", modelId: "nav-1", svg: `<svg>${reads}</svg>`, renderMeta: {
          engine: "plantuml", generatedAt: "2026-10-10T00:00:00.000Z", sourceLength: 18, durationMs: 1,
        } }] : [],
      }));
    }));
    const subscription = subscribeToDesignRunEvents({ runId: "run-design-1", projectId: "project-a",
      onEvent: (event) => events.push(event), onSnapshot: (snapshot) => { snapshots.push(snapshot); } });
    await vi.waitFor(() => expect(reads).toBe(1));
    await vi.advanceTimersByTimeAsync(7_000);
    expect(connections).toBe(4);
    expect(reads).toBe(5);
    expect(snapshots.at(-1)).toMatchObject({ status: "running", svgArtifacts: [{ modelId: "nav-1" }] });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(reads).toBe(6);
    expect(snapshots.at(-1)?.svgArtifacts[0].svg).toBe("<svg>6</svg>");
    await vi.advanceTimersByTimeAsync(2_250);
    await subscription;
    expect(events.at(-1)?.type).toBe("completed");
  });

  it.each([401, 403, 404])("does not reconnect or poll a forbidden or missing SSE endpoint (%s)", async (status) => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: "unavailable" }, status));
    vi.stubGlobal("fetch", fetchMock);
    await expect(subscribeToRequirementRunEvents({ runId: "run-req-1", projectId: "project-a", onEvent: vi.fn() })).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels reconnection when the recovered page is unmounted", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const onSnapshot = vi.fn();
    const fetchMock = vi.fn(async (url: string) => url.split("?")[0].endsWith("/events")
      ? eventStreamResponse([]) : jsonResponse(requirementSnapshot()));
    vi.stubGlobal("fetch", fetchMock);
    const subscription = subscribeToRequirementRunEvents({ runId: "run-req-1", projectId: "project-a", onEvent: vi.fn(), onSnapshot, signal: controller.signal });
    const rejected = expect(subscription).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("closes a stream immediately after its terminal event without waiting for a server EOF", async () => {
    const cancel = vi.fn();
    const snapshot = requirementSnapshot({ status: "completed" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "completed", snapshot })}\n\n`)); },
      cancel,
    }))));
    const onEvent = vi.fn();
    await streamProjectRunEvents("/api/runs/run-req-1/events", "project-a", onEvent);
    expect(onEvent).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("reconnects requirement SSE and deduplicates replay after an early disconnect", async () => {
    vi.useFakeTimers();
    let snapshotReads = 0;
    const events: RunEvent[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.split("?")[0].endsWith("/api/runs/run-req-1/events")) {
          return eventStreamResponse([{ type: "queued", eventId: "queued-1" }]);
        }
        if (url.split("?")[0].endsWith("/api/runs/run-req-1")) {
          snapshotReads += 1;
          return jsonResponse(
            snapshotReads === 1
              ? requirementSnapshot({
                  currentStage: "generate_models",
                  status: "running",
                })
              : requirementSnapshot({
                  currentStage: "render_svg",
                  status: "completed",
                }),
          );
        }
        return jsonResponse({ message: "unexpected request" }, 500);
      }),
    );

    const subscription = subscribeToRequirementRunEvents({
      runId: "run-req-1",
      projectId: "project-a",
      onEvent: (event) => events.push(event),
    });

    await vi.waitFor(() => expect(snapshotReads).toBe(1));
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(subscription).resolves.toBeUndefined();

    expect(events.map((event) => event.type)).toEqual([
      "queued",
      "stage_progress",
      "completed",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "completed",
      snapshot: { status: "completed", runId: "run-req-1" },
    });
  });

  it("preserves design diagram errors when polling returns a completed snapshot", async () => {
    const events: RunEvent[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.split("?")[0].endsWith("/api/design-runs/run-design-1/events")) {
          return eventStreamResponse([{ type: "queued" }]);
        }
        if (url.split("?")[0].endsWith("/api/design-runs/run-design-1")) {
          return jsonResponse(
            designSnapshot({
              currentStage: "render_svg",
              status: "completed",
              diagramErrors: {
                "activity:design-interface-relations": {
                  stage: "generate_design_models",
                  error: {
                    code: "RUN_DEPENDENCY_MISSING",
                    message: "界面关系图缺少前置设计模型",
                    category: "generation",
                    retryable: false,
                  },
                },
              },
            }),
          );
        }
        return jsonResponse({ message: "unexpected request" }, 500);
      }),
    );

    await expect(
      subscribeToDesignRunEvents({
        runId: "run-design-1",
        projectId: "project-a",
        onEvent: (event) => events.push(event),
      }),
    ).resolves.toBeUndefined();

    expect(events.at(-1)).toMatchObject({
      type: "completed",
      snapshot: {
        diagramErrors: {
          "activity:design-interface-relations": {
            error: { message: "界面关系图缺少前置设计模型" },
          },
        },
      },
    });
  });

  it("emits and rejects with the server snapshot error when polling reaches failed", async () => {
    const events: RunEvent[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.split("?")[0].endsWith("/api/design-runs/run-design-1/events")) {
          return eventStreamResponse([{ type: "queued" }]);
        }
        if (url.split("?")[0].endsWith("/api/design-runs/run-design-1")) {
          return jsonResponse(
            designSnapshot({
              status: "failed",
              error: {
                code: "RUN_INTERNAL_ERROR",
                message: "模型输出解析失败",
                category: "internal",
                retryable: true,
              },
            }),
          );
        }
        return jsonResponse({ message: "unexpected request" }, 500);
      }),
    );

    await expect(
      subscribeToDesignRunEvents({
        runId: "run-design-1",
        projectId: "project-a",
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow("生成任务失败，请稍后重试。");

    expect(events.map((event) => event.type)).toEqual([
      "queued",
      "failed",
    ]);
  });

  it.each([
    {
      label: "requirements",
      runId: "run-req-1",
      eventPath: "/api/runs/run-req-1/events",
      snapshotPath: "/api/runs/run-req-1",
      subscribe: subscribeToRequirementRunEvents,
      snapshot: requirementSnapshot({
        currentStage: "render_svg",
        status: "completed",
      }),
    },
    {
      label: "design",
      runId: "run-design-1",
      eventPath: "/api/design-runs/run-design-1/events",
      snapshotPath: "/api/design-runs/run-design-1",
      subscribe: subscribeToDesignRunEvents,
      snapshot: designSnapshot({
        currentStage: "render_svg",
        status: "completed",
      }),
    },
    
    {
      label: "document",
      runId: "run-doc-1",
      eventPath: "/api/document-runs/run-doc-1/events",
      snapshotPath: "/api/document-runs/run-doc-1",
      subscribe: subscribeToDocumentRunEvents,
      snapshot: documentSnapshot(),
    },
  ])(
    "polls $label snapshots after a legacy EventSource disconnect without project scope",
    async ({ runId, eventPath: _eventPath, snapshotPath, subscribe, snapshot }) => {
      const eventSourceUrls: string[] = [];
      const snapshotFetches: Array<{
        url: string;
        hasProjectHeader: boolean;
      }> = [];
      class MockEventSource {
        onmessage: ((event: MessageEvent<string>) => void) | null = null;
        onerror: (() => void) | null = null;

        close() {}

        constructor(url: string) {
          eventSourceUrls.push(url);
          queueMicrotask(() => {
            this.onerror?.();
          });
        }
      }
      vi.stubGlobal("EventSource", MockEventSource);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          if (url.split("?")[0].endsWith(snapshotPath)) {
            snapshotFetches.push({
              url,
              hasProjectHeader: requestHasProjectHeader(init),
            });
            return jsonResponse(snapshot);
          }
          return jsonResponse({ message: "unexpected request" }, 500);
        }),
      );
      const events: RunEvent[] = [];

      await expect(
        subscribe({
          runId,
          projectId: null,
          onEvent: (event) => events.push(event),
        }),
      ).resolves.toBeUndefined();

      expect(eventSourceUrls).toEqual([]);
      expect(snapshotFetches).toEqual([
        { url: snapshotPath, hasProjectHeader: false },
      ]);
      expect(events).toEqual([
        expect.objectContaining({
          type: "completed",
          snapshot: expect.objectContaining({ runId, status: "completed" }),
        }),
      ]);
    },
  );
});
