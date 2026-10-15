// Verifies the single-server LLM scheduler gates real model calls before pipelines use it.
import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderSettings } from "@uml-platform/contracts";
import {
  createInMemoryLlmScheduler,
  createScheduledLlmTransport,
  type LlmScheduleContext,
} from "./llm-scheduler.js";
import type { LlmTransport, StreamChatCompletionInput } from "../../llm.js";

function context(patch: Partial<LlmScheduleContext> = {}): LlmScheduleContext {
  return {
    runId: "run-1",
    projectId: "project-1",
    userId: "user-1",
    providerConfigId: "provider-1",
    model: "gpt-5.4",
    taskType: "design_modeling",
    stage: "generate_design_models",
    ...patch,
  };
}

const providerSettings: ProviderSettings = {
  apiBaseUrl: "https://llm.test",
  apiKey: "test-key",
  model: "test-model",
};

test("in-memory LLM scheduler enforces global, project, user, provider and run limits", async () => {
  const scheduler = createInMemoryLlmScheduler({
    globalConcurrency: 2,
    providerConcurrency: 2,
    projectConcurrency: 1,
    userConcurrency: 1,
    runConcurrency: 1,
  });
  const started: string[] = [];
  const releases: Array<() => void> = [];

  const first = scheduler.run(context(), async () => {
    started.push("first");
    await new Promise<void>((resolve) => releases.push(resolve));
    return "first";
  });
  await Promise.resolve();
  assert.deepEqual(started, ["first"]);

  const sameProject = scheduler.run(context({ runId: "run-2", userId: "user-2" }), async () => {
    started.push("same-project");
    return "same-project";
  });
  const sameUser = scheduler.run(context({ runId: "run-3", projectId: "project-2" }), async () => {
    started.push("same-user");
    return "same-user";
  });
  const sameRun = scheduler.run(context({ projectId: "project-2", userId: "user-2" }), async () => {
    started.push("same-run");
    return "same-run";
  });

  await Promise.resolve();
  assert.deepEqual(started, ["first"]);
  assert.equal(scheduler.snapshot().queued, 3);

  releases.shift()?.();
  assert.equal(await first, "first");
  assert.equal(await sameProject, "same-project");
  assert.equal(await sameUser, "same-user");
  assert.equal(await sameRun, "same-run");
  assert.deepEqual(started, ["first", "same-project", "same-user", "same-run"]);
});

test("in-memory LLM scheduler cancels queued work before it calls the provider", async () => {
  const scheduler = createInMemoryLlmScheduler({
    globalConcurrency: 1,
    providerConcurrency: 1,
    projectConcurrency: 1,
    userConcurrency: 1,
    runConcurrency: 1,
  });
  let queuedCalled = false;
  let releaseFirst!: () => void;

  const first = scheduler.run(context(), async () => {
    await new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
  });
  await Promise.resolve();

  const queued = scheduler.run(context({ runId: "run-2" }), async () => {
    queuedCalled = true;
  });
  scheduler.cancelRun("run-2");
  releaseFirst();
  await first;

  await assert.rejects(queued, /cancelled/i);
  assert.equal(queuedCalled, false);
});

test("scheduled LLM transport forwards abort signals to the provider transport", async () => {
  const scheduler = createInMemoryLlmScheduler({
    globalConcurrency: 1,
    providerConcurrency: 1,
    projectConcurrency: 1,
    userConcurrency: 1,
    runConcurrency: 1,
  });
  const controller = new AbortController();
  let receivedInput: StreamChatCompletionInput | undefined;
  const providerTransport: LlmTransport = {
    async *streamChatCompletion(input) {
      receivedInput = input;
      yield "ok";
    },
  };
  const scheduledTransport = createScheduledLlmTransport({
    transport: providerTransport,
    scheduler,
    context: context(),
  });

  const chunks: string[] = [];
  for await (const chunk of scheduledTransport.streamChatCompletion({
    providerSettings,
    messages: [{ role: "user", content: "hello" }],
    abortSignal: controller.signal,
  })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ["ok"]);
  assert.equal(receivedInput?.abortSignal, controller.signal);
});

test("stream scheduling applies backpressure until chunks are consumed", async () => {
  const scheduler = createInMemoryLlmScheduler({
    globalConcurrency: 1,
    providerConcurrency: 1,
    projectConcurrency: 1,
    userConcurrency: 2,
    runConcurrency: 1,
  });
  const started: string[] = [];
  let releaseFirstChunk!: () => void;

  const first = scheduler.stream(
    context({ runId: "run-1", userId: "user-1" }),
    async function* () {
      started.push("first");
      yield "a";
      await new Promise<void>((resolve) => {
        releaseFirstChunk = resolve;
      });
      yield "b";
    },
  );
  const second = scheduler.stream(
    context({ runId: "run-2", userId: "user-2" }),
    async function* () {
      started.push("second");
      yield "c";
    },
  );

  const firstIterator = first[Symbol.asyncIterator]();
  assert.equal((await firstIterator.next()).value, "a");
  const secondIterator = second[Symbol.asyncIterator]();
  const secondNext = secondIterator.next();
  await Promise.resolve();

  assert.deepEqual(started, ["first"]);
  releaseFirstChunk();
  assert.equal((await firstIterator.next()).value, "b");
  assert.equal((await firstIterator.next()).done, true);
  assert.equal((await secondNext).value, "c");
  assert.deepEqual(started, ["first", "second"]);
});
