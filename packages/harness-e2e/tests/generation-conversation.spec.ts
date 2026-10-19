// Exercises progress-only replay and SSE without rendering or retaining provider fragments.
import { expect, test, type Page } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";
import { createEmptySnapshot } from "../../../apps/api/src/runs/records/snapshots";

async function liveTask(page: Page, runId: string) {
  await mockProjectApi(page);
  const createdAt = new Date().toISOString();
  const run = { runId, projectId, runKind: "requirements", status: "running", stage: "generate_models", createdAt };
  const events: Record<string, unknown>[] = [{ type: "stage_started", stage: "generate_models", eventId: "start", createdAt }];
  await page.addInitScript(({ runId }) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(url, location.origin).pathname !== `/api/runs/${runId}/events`) return original(input, init);
      return new Response(new ReadableStream({ start(controller) {
        (window as unknown as { emitDemoEvent: (event: unknown) => void }).emitDemoEvent = event => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      } }), { headers: { "Content-Type": "text/event-stream" } });
    };
  }, { runId });
  await page.route(`**/api/projects/${projectId}/runs`, route => route.fulfill({ json: { projectId, runs: [run] } }));
  await page.route(`**/api/projects/${projectId}/runs/${runId}*`, route => route.fulfill({ json: { projectId, run, events } }));
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  await page.waitForFunction(() => typeof (window as unknown as { emitDemoEvent?: unknown }).emitDemoEvent === "function");
  return {
    transcript: page.getByTestId("generation-transcript"),
    emit: async (event: Record<string, unknown>) => {
      const next = { ...event, eventId: `event-${events.length}`, runId, createdAt };
      events.push(next);
      await page.evaluate(event => (window as unknown as { emitDemoEvent: (event: unknown) => void }).emitDemoEvent(event), next);
    },
  };
}

for (const width of [1440, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${width} ${colorScheme}`, () => {
    test.use({ viewport: { width, height: 900 }, colorScheme });

    test("live progress stays expanded and hides provider prose across replay", async ({ page }) => {
      const { transcript, emit } = await liveTask(page, "run-progress-stream");
      const process = transcript.getByRole("button", { name: "正在思考", exact: true });
      await expect(process).toHaveAttribute("aria-expanded", "true");
      const base = { type: "run_activity", stage: "generate_models", callId: "usecase", subtaskLabel: "整理用例图", format: "text" };
      await emit({ ...base, phase: "started" });
      await emit({ ...base, phase: "reasoning", text: "PRIVATE_REASONING" });
      await emit({ ...base, phase: "output", text: "PRIVATE_PROVIDER_OUTPUT" });
      await emit({ type: "stage_progress", stage: "generate_models", progress: 50, subtaskId: "usecase", subtaskLabel: "用例模型", subtaskStatus: "running" });
      await expect(transcript.getByText("正在处理", { exact: true }).first()).toBeVisible();
      await expect(transcript.getByText(/PRIVATE_/)).toHaveCount(0);
      await process.click();
      await expect(process).toHaveAttribute("aria-expanded", "false");
      await process.click();
      await emit({ type: "stage_finished", stage: "generate_models", status: "completed" });
      await expect(transcript.getByText("已完成", { exact: true }).first()).toBeVisible();
      await page.reload();
      if (!(await transcript.isVisible())) await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已完成", { exact: true }).first()).toBeVisible();
      await expect(transcript.getByText(/PRIVATE_/)).toHaveCount(0);
    });

    test("one stage heading animates and respects reduced motion", async ({ page }) => {
      const { transcript, emit } = await liveTask(page, "run-progress-animation");
      await emit({ type: "stage_progress", stage: "generate_models", progress: 30, subtaskId: "usecase", subtaskLabel: "用例模型", subtaskStatus: "running" });
      const heading = transcript.getByTestId("generation-task-step").first().locator('[data-slot="ai-shimmer"]');
      await expect(heading).toHaveAttribute("data-slot", "ai-shimmer");
      await expect(transcript.locator('[data-slot="ai-shimmer"]')).toHaveCount(1);
      const spinner = transcript.getByTestId("generation-task-step").first().locator("svg.animate-spin");
      await expect(spinner).toBeVisible();
      await page.emulateMedia({ reducedMotion: "reduce" });
      const staticHeading = transcript.getByTestId("generation-task-step").first().locator("h3");
      await expect(staticHeading).toHaveCSS("animation-name", "none");
      await expect(spinner).toHaveCSS("animation-name", "none");
      expect(await staticHeading.evaluate(element => getComputedStyle(element).color)).not.toBe("rgba(0, 0, 0, 0)");
    });

    test("stage boundaries appear immediately without mounting streamed content", async ({ page }) => {
      const { transcript, emit } = await liveTask(page, "run-progress-stages");
      await emit({ type: "stage_started", stage: "render_svg" });
      await expect(transcript.getByTestId("generation-task-step")).toHaveCount(2);
      await emit({ type: "run_activity", stage: "generate_models", callId: "usecase", phase: "output", format: "text", text: "PRIVATE_LARGE_BODY".repeat(10000) });
      await emit({ type: "stage_finished", stage: "generate_models", status: "completed" });
      await expect(transcript.getByTestId("generation-task-step")).toHaveCount(2);
      await expect(transcript.locator('[data-slot="transcript-prose"]')).toHaveCount(0);
      await expect(transcript.getByText(/PRIVATE_LARGE_BODY/)).toHaveCount(0);
      expect(await transcript.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      const drawer = page.getByTestId("project-workspace-drawer");
      expect((await drawer.boundingBox())!.width).toBeLessThanOrEqual(768);
    });

    test("progress replay omits reasoning, payloads and input images", async ({ page }) => {
      const { transcript, emit } = await liveTask(page, "run-progress-privacy");
      let imageRequests = 0;
      await page.route("https://images.example.test/private.png", route => { imageRequests++; return route.fulfill({ status: 404 }); });
      await emit({ type: "stage_started", stage: "verify_diagram_visual" });
      const base = { type: "run_activity", stage: "verify_diagram_visual", callId: "review", format: "technical" };
      await emit({ ...base, phase: "started", inputImages: [{ url: "https://images.example.test/private.png", caption: "PRIVATE_INPUT_IMAGE" }] });
      await emit({ ...base, phase: "reasoning", text: "PRIVATE_REASONING" });
      await emit({ ...base, phase: "output", text: '{"privatePayload":true}' });
      await emit({ type: "stage_finished", stage: "verify_diagram_visual", status: "completed" });
      await expect(transcript.getByText("模型结构检查", { exact: true })).toBeVisible();
      await expect(transcript.getByText(/PRIVATE_|privatePayload/)).toHaveCount(0);
      await expect(transcript.getByRole("img")).toHaveCount(0);
      expect(imageRequests).toBe(0);
    });

    test("completed tasks restore the result summary without provider prose", async ({ page }) => {
      await mockProjectApi(page);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      const runId = "run-progress-completed";
      const createdAt = new Date().toISOString();
      const run = { runId, projectId, runKind: "requirements", status: "completed", stage: "render_svg", createdAt };
      const snapshot = createEmptySnapshot(runId, "用户可查询并预约座位", ["usecase", "activity"]);
      snapshot.status = "completed";
      snapshot.svgArtifacts = ["usecase", "activity"].map(diagramKind => ({ diagramKind, svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', renderMeta: { engine: "plantuml", generatedAt: createdAt, sourceLength: 0, durationMs: 20 } })) as typeof snapshot.svgArtifacts;
      const events = [
        { type: "stage_started", stage: "generate_models", eventId: "start", createdAt },
        { type: "run_activity", stage: "generate_models", runId, callId: "usecase", phase: "output", format: "text", text: "PRIVATE_PROVIDER_OUTPUT", eventId: "output", createdAt },
        { type: "stage_finished", stage: "generate_models", status: "completed", eventId: "done", createdAt },
        { type: "completed", snapshot, eventId: "complete", createdAt },
      ];
      await page.route(`**/api/projects/${projectId}/runs`, route => route.fulfill({ json: { projectId, runs: [run] } }));
      await page.route(`**/api/projects/${projectId}/runs/${runId}*`, route => route.fulfill({ json: { projectId, run, events, snapshot } }));
      await page.goto(`/projects/${projectId}`);
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      const transcript = page.getByTestId("generation-transcript");
      await expect(transcript.getByText("已生成 2 个图形预览。")).toBeVisible();
      await expect(transcript.getByText("PRIVATE_PROVIDER_OUTPUT")).toHaveCount(0);
      await expect(transcript.locator('[data-slot="card"], [data-slot="badge"]')).toHaveCount(0);
      expect(await transcript.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.reload();
      if (!(await transcript.isVisible())) await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已生成 2 个图形预览。")).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
