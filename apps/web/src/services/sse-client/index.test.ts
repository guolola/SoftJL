import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToRunEvents } from "./index";

describe("sse-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves when a completed event is received", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        expect(url).toBe("/api/runs/run-1/events");
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: "completed",
              snapshot: {
                runId: "run-1",
                requirementText: "",
                selectedDiagrams: [],
                rules: [],
                models: [],
                plantUml: [],
                svgArtifacts: [],
                diagramErrors: {},
                requirementTrace: [],
                currentStage: null,
                status: "completed",
                errorMessage: null,
              },
            }),
          } as MessageEvent<string>);
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    const events: string[] = [];
    const subscription = subscribeToRunEvents("/api/runs/run-1/events", {
      onEvent: (event) => events.push(event.type),
    });

    await expect(subscription.closed).resolves.toBeUndefined();
    expect(events).toEqual(["completed"]);
  });

  it("rejects with a localized streamed failure and preserves its code", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        void url;
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: "failed",
              error: {
                code: "PLATFORM_PROVIDER_UNAVAILABLE",
                message: "LLM request failed",
                category: "platform_provider",
                retryable: true,
              },
            }),
          } as MessageEvent<string>);
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    const subscription = subscribeToRunEvents("/api/runs/run-1/events", {
      onEvent: () => {},
    });

    await expect(subscription.closed).rejects.toMatchObject({
      message: "当前模型服务暂不可用，请稍后重试。",
      runError: { code: "PLATFORM_PROVIDER_UNAVAILABLE" },
    });
  });

  it("resolves when a cancelled event is received", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        void url;
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: "cancelled",
              message: "Run cancelled by user",
            }),
          } as MessageEvent<string>);
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    const events: string[] = [];
    const subscription = subscribeToRunEvents("/api/runs/run-1/events", {
      onEvent: (event) => events.push(event.type),
    });

    await expect(subscription.closed).resolves.toBeUndefined();
    expect(events).toEqual(["cancelled"]);
  });
});
