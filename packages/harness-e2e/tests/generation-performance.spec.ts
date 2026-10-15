// Stresses the production task drawer in Chromium while measuring click-to-frame response.
import { expect, test } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";

test("30,000 provider fragments do not accumulate in progress UI and click P95 stays below 200ms", async ({ page }, info) => {
  await mockProjectApi(page);
  const runId = "run-performance";
  const createdAt = new Date().toISOString();
  const run = { runId, projectId, runKind: "design", status: "running", stage: "generate_design_models", createdAt };
  const events = Array.from({ length: 20 }, (_, index) => ({ type: "run_activity", runId, eventId: `start-${index}`, sequence: index + 1, callId: `call-${index}`, stage: "generate_design_models", subtaskId: `model-${index}`, subtaskLabel: `模型 ${index}`, format: "technical", phase: "started", createdAt }));
  await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
  await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run, events, cursor: 20 } }));
  await page.addInitScript(({ runId, createdAt }) => {
    const original = window.fetch.bind(window);
    let controller: ReadableStreamDefaultController<Uint8Array>;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      if (url.pathname !== `/api/design-runs/${runId}/events`) return original(input, init);
      (window as any).performanceStreamUrl = url.href;
      return new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { "Content-Type": "text/event-stream" } });
    };
    (window as any).startPerformanceFeed = async () => {
      const encoder = new TextEncoder();
      for (let start = 0; start < 30000; start += 250) {
        let body = "";
        for (let index = start; index < start + 250; index++) body += `data: ${JSON.stringify({ type: "run_activity", runId, createdAt, eventId: `body-${index}`, sequence: index + 21, callId: `call-${index % 20}`, stage: "generate_design_models", format: "technical", phase: "output", text: "DO_NOT_RETAIN_PROVIDER_TEXT".repeat(20) })}\n\n`;
        controller.enqueue(encoder.encode(body));
        await new Promise(requestAnimationFrame);
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stage_finished", stage: "generate_design_models", eventId: "stage-end", status: "cancelled" })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "cancelled", runId, eventId: "end", sequence: 30021, message: "压力测试完成" })}\n\n`));
      (window as any).performanceFeedFinished = true;
    };
  }, { runId, createdAt });
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  const transcript = page.getByTestId("generation-transcript");
  await expect(transcript).toBeVisible();
  await page.waitForFunction(() => Boolean((window as any).performanceStreamUrl));
  expect(await page.evaluate(() => (window as any).performanceStreamUrl)).toContain("view=progress");
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.textContent = "浏览器响应测量"; button.dataset.perfProbe = "true";
    button.style.cssText = "position:fixed;left:8px;top:8px;z-index:2147483647";
    (window as any).clickFrameSamples = [];
    button.onclick = () => { const started = performance.now(); requestAnimationFrame(() => (window as any).clickFrameSamples.push(performance.now() - started)); };
    document.body.append(button);
    void (window as any).startPerformanceFeed();
  });
  for (let index = 0; index < 60; index++) await page.locator("[data-perf-probe]").click();
  await page.waitForFunction(() => (window as any).performanceFeedFinished);
  await expect(transcript.locator('[data-slot="spinner"]')).toHaveCount(0);
  await expect(transcript.getByText(/DO_NOT_RETAIN_PROVIDER_TEXT/)).toHaveCount(0);
  const samples: number[] = await page.evaluate(() => (window as any).clickFrameSamples);
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)];
  expect(samples.length).toBeGreaterThanOrEqual(50);
  expect(p95).toBeLessThan(200);
  const result = { providerEventCount: 30000, parallelCalls: 20, samples: samples.length, clickToFrameP95Ms: p95 };
  console.log(JSON.stringify(result));
  await info.attach("generation-performance", { body: JSON.stringify(result), contentType: "application/json" });
});
