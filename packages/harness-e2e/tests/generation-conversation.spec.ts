// Validates the task conversation against the real project shell with deterministic run events.
import { expect, test } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";
import { createEmptyFeasibilitySnapshot, createEmptySnapshot } from "../../../apps/api/src/runs/records/snapshots";
import { feasibilityInputsSchema } from "@uml-platform/contracts";

for (const width of [1440, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${width} ${colorScheme}`, () => {
    test.use({ viewport: { width, height: 900 }, colorScheme });
    test("live process stays expanded and prose grows by received fragments", async ({ page }, info) => {
      await mockProjectApi(page);
      const runId = "run-demo-stream";
      const createdAt = new Date().toISOString();
      const run = { runId, projectId, runKind: "requirements", status: "running", stage: "generate_models", createdAt };
      const base = { type: "run_activity", runId, createdAt, stage: "generate_models", callId: "usecase", subtaskLabel: "整理用例图", format: "text" };
      const events = [{ ...base, eventId: "start", phase: "started", text: "" }, { ...base, eventId: "think", phase: "thinking", text: "" }];
      await page.addInitScript(({ runId }) => {
        const original = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (!url.endsWith(`/api/runs/${runId}/events`)) return original(input, init);
          return new Response(new ReadableStream({ start(controller) {
            (window as unknown as { emitDemoEvent: (event: unknown) => void }).emitDemoEvent = (event) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
          } }), { headers: { "Content-Type": "text/event-stream" } });
        };
      }, { runId });
      await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
      await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run, events } }));
      await page.goto(`/projects/${projectId}`);
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      const transcript = page.getByTestId("generation-transcript");
      await expect(transcript.getByRole("button", { name: "思考过程 · 整理用例图" })).toHaveCount(0);
      await page.waitForFunction(() => typeof (window as unknown as { emitDemoEvent?: unknown }).emitDemoEvent === "function");
      const emit = async (phase: string, text: string) => {
        const event = { ...base, eventId: `fragment-${events.length}`, phase, text };
        events.push(event);
        await page.evaluate((event) => (window as unknown as { emitDemoEvent: (event: unknown) => void }).emitDemoEvent(event), event);
      };
      await emit("reasoning", "先核对参与者。");
      await expect(transcript.getByText("正在分析", { exact: true })).toBeVisible();
      await expect(transcript.getByText("先核对参与者。", { exact: true })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath("task-progress.png") });
      await emit("reasoning", "然后整理预约关系。");
      await expect(transcript.getByText("先核对参与者。然后整理预约关系。", { exact: true })).toHaveCount(0);
      await expect(transcript.getByRole("button", { name: "思考过程 · 整理用例图" })).toHaveCount(0);
      await emit("output", "已读取学生");
      await expect(transcript.getByText("已读取学生", { exact: true })).toBeVisible();
      await expect(transcript.getByText("正在生成", { exact: true })).toBeVisible();
      const summary = transcript.getByRole("button", { name: "正在思考" });
      await expect(summary).toHaveAttribute("aria-expanded", "true");
      await emit("output", "与管理员的用例。");
      await expect(transcript.getByText("已读取学生与管理员的用例。", { exact: true })).toBeVisible();
      await summary.click();
      await expect(summary).toHaveAttribute("aria-expanded", "false");
      await expect(transcript.getByText("已读取学生与管理员的用例。", { exact: true })).toBeHidden();
      await summary.click();
      await emit("completed", "");
      await expect(transcript.locator('[data-slot="generation-call"] [data-slot="spinner"]')).toHaveCount(0);
      await page.reload();
      if (!(await transcript.isVisible())) await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已读取学生与管理员的用例。", { exact: true })).toHaveCount(1);
    });

    test("one stage title animates across parallel calls and respects reduced motion", async ({ page }, info) => {
      await mockProjectApi(page);
      const runId = "run-loading-animation";
      const createdAt = new Date().toISOString();
      const run = { runId, projectId, runKind: "requirements", status: "running", stage: "generate_models", createdAt };
      const title = "分析参与者与用例并核对预约规则以及用户操作范围";
      const event = { type: "run_activity", runId, createdAt, stage: "generate_models", callId: "usecase", subtaskLabel: title, format: "text" };
      const events = [
        { ...event, eventId: "started", phase: "started" },
        { ...event, eventId: "thinking", phase: "thinking" },
        { ...event, eventId: "output", phase: "output", text: "正在核对参与者与预约规则。" },
        { ...event, eventId: "other", callId: "activity", subtaskLabel: "生成预约活动图", phase: "completed" },
      ];
      await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
      await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run, events } }));
      await page.route(`**/api/runs/${runId}/events`, (route) => route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify(events[2])}\n\n` }));
      await page.goto(`/projects/${projectId}`);
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      const transcript = page.getByTestId("generation-transcript");
      const heading = transcript.locator("h3").getByText("生成需求模型", { exact: true });
      await expect(heading).toBeVisible();
      const spinner = transcript.getByTestId("generation-task-step").first().locator("svg.animate-spin");
      await expect(spinner).toBeVisible();
      await expect(heading).toHaveAttribute("data-slot", "ai-shimmer");
      await expect(transcript.getByText("生成预约活动图", { exact: true })).toHaveCSS("animation-name", "none");
      await expect(transcript.getByText("正在生成", { exact: true })).toHaveCSS("animation-name", "none");
      await expect(transcript.getByText("正在核对参与者与预约规则。", { exact: true })).toHaveCSS("animation-name", "none");
      // The shared AI Elements shimmer uses Motion's background tween, rather than CSS keyframes.
      const sweep = await heading.evaluate((element) => {
        return new Promise<{ positions: number[]; size: string }>((resolve) => {
          const positions: number[] = [];
          const sample = () => {
            positions.push(parseFloat(getComputedStyle(element).backgroundPositionX));
            if (positions.length < 5) setTimeout(sample, 100);
            else resolve({ positions, size: getComputedStyle(element).backgroundSize });
          };
          sample();
        });
      });
      expect(sweep.positions.some((position, index) => index > 0 && position < sweep.positions[index - 1])).toBe(true);
      expect(sweep.size).toBe("250% 100%, auto");
      expect(await transcript.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await expect(transcript.locator('[data-slot="ai-shimmer"]')).toHaveCount(1);
      await expect(transcript.locator('svg.animate-spin')).toHaveCount(1);
      await expect(transcript.getByText(title, { exact: true })).toHaveCSS("animation-name", "none");
      await page.screenshot({ path: info.outputPath("loading-animation.png") });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(heading).toHaveCSS("animation-name", "none");
      await expect(spinner).toHaveCSS("animation-name", "none");
      expect(await heading.evaluate((element) => getComputedStyle(element).color)).not.toBe("rgba(0, 0, 0, 0)");
      await expect(transcript.getByText("正在生成", { exact: true })).toBeVisible();
    });

    test("started stages appear immediately and long streaming prose leaves scroll control with the reader", async ({ page }, info) => {
      await mockProjectApi(page);
      const runId = "run-stage-reading";
      const createdAt = new Date().toISOString();
      const run = { runId, projectId, runKind: "requirements", status: "running", stage: "generate_models", createdAt };
      const base = { type: "run_activity", runId, createdAt, stage: "generate_models", callId: "usecase", subtaskLabel: "分析参与者与用例", format: "text" };
      const events: Record<string, unknown>[] = [
        { type: "stage_started", stage: "generate_models", tracksCompletion: true, eventId: "start", createdAt },
        { ...base, eventId: "call", phase: "started" },
        { ...base, eventId: "think", phase: "summary", text: "核对参与者和预约流程，随后整理结果。" },
      ];
      await page.addInitScript(({ runId }) => {
        const original = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (!url.endsWith(`/api/runs/${runId}/events`)) return original(input, init);
          return new Response(new ReadableStream({ start(controller) {
            (window as unknown as { emitDemoEvent: (event: unknown) => void }).emitDemoEvent = (event) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
          } }), { headers: { "Content-Type": "text/event-stream" } });
        };
      }, { runId });
      await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
      await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run, events } }));
      let releaseImage!: () => void;
      const imageReady = new Promise<void>((resolve) => { releaseImage = resolve; });
      await page.route("**/reading-test.svg", async (route) => {
        await imageReady;
        await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#899"/></svg>' });
      });
      await page.goto(`/projects/${projectId}`);
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await page.waitForFunction(() => typeof (window as unknown as { emitDemoEvent?: unknown }).emitDemoEvent === "function");
      const emit = async (event: Record<string, unknown>) => {
        const next = { ...event, eventId: `fragment-${events.length}`, createdAt };
        events.push(next);
        await page.evaluate((event) => (window as unknown as { emitDemoEvent: (event: unknown) => void }).emitDemoEvent(event), next);
      };
      const transcript = page.getByTestId("generation-transcript");
      const viewport = transcript.locator('[data-slot="scroll-area-viewport"]').first();
      await emit({ ...base, stage: "render_svg", callId: "render", phase: "output", text: "预览已在后台准备好。" });
      await expect(transcript.getByTestId("generation-task-step")).toHaveCount(2);
      await expect(transcript.getByText("预览已在后台准备好。")).toBeVisible();
      const longText = "## 预约流程\n\n![流程示意](/reading-test.svg)\n\n" + Array.from({ length: 45 }, (_, i) => `第 ${i + 1} 段：学生选择空闲座位，系统校验预约时间与可用状态，再确认预约结果。`).join("\n\n");
      await emit({ ...base, phase: "output", text: longText });
      await expect(transcript.getByRole("button", { name: "回到最新" })).toBeVisible();
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      // Measure both rects in one frame; the mobile drawer may still be animating.
      await expect.poll(() => viewport.evaluate((element) => {
        const anchor = element.querySelector("[data-reading-anchor]")!;
        return Math.abs(anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - 12);
      })).toBeLessThan(4);
      const top = await viewport.evaluate((element) => element.scrollTop);
      releaseImage();
      await expect.poll(() => transcript.getByAltText("流程示意").evaluate((element) => (element as HTMLImageElement).naturalHeight)).toBe(160);
      await emit({ ...base, phase: "output", text: "\n\n追加内容仍保留阅读位置。" });
      await expect(transcript.getByText("追加内容仍保留阅读位置。")).toHaveCount(1);
      expect(await viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(top, 0);
      await transcript.getByRole("button", { name: "回到最新" }).click();
      await expect.poll(() => viewport.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2);
      await viewport.hover();
      await page.mouse.wheel(0, -300);
      await expect(transcript.getByRole("button", { name: "回到最新" })).toBeVisible();
      const manualTop = await viewport.evaluate((element) => element.scrollTop);
      await emit({ ...base, phase: "output", text: "\n\n手动上滚后到达的新内容。" });
      await expect(transcript.getByText("手动上滚后到达的新内容。")).toHaveCount(1);
      expect(await viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(manualTop, 0);
      await emit({ type: "stage_finished", stage: "generate_models", status: "completed" });
      await expect(transcript.getByTestId("generation-task-step")).toHaveCount(2);
      await expect(transcript.getByText("预览已在后台准备好。")).toHaveCount(1);
      expect(await viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(manualTop, 0);
      const drawer = page.getByTestId("project-workspace-drawer");
      expect((await drawer.boundingBox())!.width).toBeLessThanOrEqual(768);
      // Vaul extends the drawer background by 200% with ::after; measure the reading surface.
      expect(await transcript.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      const scrollers = await drawer.evaluate((element) => [...element.querySelectorAll("*")].filter((node) => node.scrollHeight > node.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(node).overflowY)).length);
      expect(scrollers).toBe(1);
      await viewport.evaluate((element) => { element.scrollTop = 0; });
      const process = transcript.getByRole("button", { name: "正在思考" });
      await process.click();
      await expect(process).toHaveAttribute("aria-expanded", "false");
      await emit({ ...base, stage: "render_svg", callId: "render", phase: "output", text: "后续预览内容。" });
      await expect(transcript.getByText("预览已在后台准备好。后续预览内容。")).toHaveCount(1);
      expect(await viewport.evaluate((element) => element.scrollTop)).toBe(0);
      await process.click();
      await expect(transcript.locator('[data-slot="transcript-prose"]').first()).toHaveCSS("font-size", "14px");
      await expect(transcript.locator('[data-slot="transcript-prose"]').first()).toHaveCSS("line-height", "24px");
      if (width === 1440) expect((await drawer.boundingBox())!.width).toBeGreaterThan(700);
      await page.screenshot({ path: info.outputPath("stage-reading.png") });
    });

    test("context task keeps its stages and input image without reasoning or raw payloads", async ({ page }, info) => {
      await mockProjectApi(page);
      const runId = "run-context-chain";
      const createdAt = "2026-09-30T08:00:00.000Z";
      const run = { runId, projectId, runKind: "feasibility", status: "completed", stage: "verify_diagram_visual", createdAt };
      const snapshot = createEmptyFeasibilitySnapshot(runId, {
        projectId, selectedArtifacts: ["context"], rules: [], requirementBaseline: null,
        providerSettings: { providerConfigId: "test-provider", model: "test" }, inputs: feasibilityInputsSchema.parse({}),
      });
      snapshot.status = "completed";
      const imageUrl = "https://images.example.test/context.png";
      await page.route(imageUrl, (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="160"><rect width="520" height="160" rx="8" fill="#e5e7eb"/><g fill="#fff" stroke="#64748b"><rect x="20" y="55" width="90" height="50"/><rect x="180" y="45" width="160" height="70"/><rect x="410" y="55" width="90" height="50"/></g><path d="M110 80H180M340 80H410" stroke="#64748b"/><g text-anchor="middle" font-size="15" fill="#0f172a"><text x="65" y="85">学生</text><text x="260" y="85">图书馆座位预约系统</text><text x="455" y="85">管理员</text></g></svg>' }));
      const events = [
        { type: "stage_started", stage: "generate_context", tracksCompletion: true, eventId: "generate", createdAt },
        { type: "run_activity", stage: "generate_context", runId, callId: "context", subtaskLabel: "系统环境图", phase: "output", format: "technical", text: '{"summary":"展示学生和管理员与图书馆座位预约系统的交互关系。"}', eventId: "description", createdAt },
        { type: "stage_finished", stage: "generate_context", status: "completed", eventId: "generated", createdAt },
        { type: "stage_started", stage: "render_context", tracksCompletion: true, eventId: "render", createdAt },
        { type: "stage_finished", stage: "render_context", status: "completed", eventId: "rendered", createdAt },
        { type: "stage_started", stage: "verify_diagram_visual", tracksCompletion: true, eventId: "review", createdAt },
        { type: "run_activity", stage: "verify_diagram_visual", runId, callId: "visual", subtaskLabel: "系统环境图", phase: "started", format: "technical", inputImages: [{ url: imageUrl, caption: "系统环境图使用的图片 1" }], eventId: "image", createdAt },
        { type: "run_activity", stage: "verify_diagram_visual", runId, callId: "visual", phase: "reasoning", format: "technical", text: "对照结构化模型核对学生、管理员与系统节点及其关系。", eventId: "reasoning", createdAt },
        { type: "run_activity", stage: "verify_diagram_visual", runId, callId: "visual", phase: "output", format: "technical", text: '{"passed":true,"issues":[]}', eventId: "judgment", createdAt },
        { type: "stage_finished", stage: "verify_diagram_visual", status: "completed", eventId: "reviewed", createdAt },
        { type: "completed", snapshot, eventId: "complete", createdAt },
      ];
      await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
      await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run: { ...run, model: "deepseek-flash" }, events, snapshot } }));
      await page.goto(`/projects/${projectId}`);
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      const transcript = page.getByTestId("generation-transcript");
      const assistantHeader = transcript.locator('[data-slot="generation-assistant-header"]');
      await expect(assistantHeader).toHaveText("可研分析助手deepseek-flash");
      await expect(transcript.getByText(/任务状态：/)).toHaveCount(0);
      await expect(transcript.getByText("可行性分析生成", { exact: true })).toHaveCount(0);
      const chain = transcript.locator('[data-slot="chain-of-thought"]');
      await expect(chain).toHaveCount(1);
      await expect(chain.getByTestId("generation-task-step")).toHaveCount(3);
      await expect(chain.locator("h3")).toHaveText(["生成系统环境图", "渲染系统环境图", "视觉检查"]);
      const description = chain.locator('[data-slot="transcript-prose"]').first();
      await expect(description).toHaveCSS("font-size", "14px");
      const review = chain.getByTestId("generation-task-step").last();
      const image = review.getByRole("img", { name: "系统环境图使用的图片 1" });
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(520);
      await expect(review.getByRole("button", { name: "思考过程 · 系统环境图" })).toHaveCount(0);
      await expect(review.getByText("对照结构化模型核对学生、管理员与系统节点及其关系。")).toHaveCount(0);
      await expect(transcript.getByText(/查看技术原文/)).toHaveCount(0);
      await expect(transcript.getByText('{"passed":true,"issues":[]}', { exact: true })).toHaveCount(0);
      await expect(transcript.getByRole("region", { name: "输出总结" })).toBeVisible();
      await expect(chain.getByRole("region", { name: "输出总结" })).toHaveCount(0);
      expect(await transcript.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("context-chain.png") });
      await chain.getByRole("button", { name: "思考过程", exact: true }).click();
      await expect(description).toBeHidden();
      await expect(transcript.getByRole("region", { name: "输出总结" })).toBeVisible();
    });

    test("task transcript has no cards, restores replies and fits the drawer", async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await mockProjectApi(page);
      const runId = "run-conversation-preview";
      const createdAt = "2026-09-21T08:00:00.000Z";
      const run = { runId, projectId, runKind: "requirements", status: "completed", stage: "render_svg", createdAt };
      const snapshot = createEmptySnapshot(runId, "用户可查询并预约座位", ["usecase", "activity"]);
      snapshot.status = "completed";
      snapshot.svgArtifacts = ["usecase", "activity"].map((diagramKind) => ({ diagramKind, svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', renderMeta: { engine: "plantuml", generatedAt: createdAt, sourceLength: 0, durationMs: 20 } })) as typeof snapshot.svgArtifacts;
      let sequence = 0;
      const activity = (callId: string, phase: string, text?: string) => ({
        type: "run_activity", eventId: `event-${++sequence}`, runId, createdAt, stage: "generate_models", callId, subtaskId: callId,
        subtaskLabel: callId === "usecase" ? "分析参与者与用例" : "生成预约活动图", phase, text, format: "technical",
      });
      const events = [
        { type: "stage_started", stage: "generate_models", eventId: "start", createdAt },
        { type: "stage_progress", stage: "generate_models", progress: 60, message: "已读取当前需求，开始并行生成用例图与活动图。", eventId: "read", createdAt },
        activity("usecase", "started"), activity("activity", "started"),
        activity("usecase", "summary", "根据已确认需求，核对参与者及其操作范围。"),
        activity("usecase", "output", '{"summary":"已识别学生与管理员，整理了查询座位、预约和签到等操作。"}'), activity("usecase", "completed"),
        activity("activity", "output", '{"summary":"活动图包含查询、校验座位状态与提交预约三个环节。"}'), activity("activity", "completed"),
        { type: "stage_progress", stage: "render_svg", progress: 100, message: "模型检查已完成，两个图形预览已准备好。", eventId: "render", createdAt },
        { type: "completed", snapshot, eventId: "complete", createdAt },
      ];
      await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
      await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run, events, snapshot } }));
      await page.goto(`/projects/${projectId}`);
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      const transcript = page.getByTestId("generation-transcript");
      await expect(transcript.getByText("已识别学生与管理员，整理了查询座位、预约和签到等操作。", { exact: true })).toBeVisible();
      await expect(transcript.getByText("已生成 2 个图形预览。")).toBeVisible();
      await expect(transcript.getByText("需求建模助手", { exact: true })).toHaveCount(1);
      await expect(transcript.locator('[data-slot="card"], [data-slot="badge"]')).toHaveCount(0);
      expect(await transcript.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("conversation.png") });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已识别学生与管理员，整理了查询座位、预约和签到等操作。", { exact: true })).toHaveCount(1);
      await page.reload();
      if (!(await transcript.isVisible())) await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已生成 2 个图形预览。")).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
