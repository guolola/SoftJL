// Validates the task conversation against the real project shell with deterministic run events.
import { expect, test } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";
import { createEmptyFeasibilitySnapshot, createEmptySnapshot } from "../../../apps/api/src/runs/records/snapshots";
import { feasibilityInputsSchema } from "@uml-platform/contracts";

for (const width of [1440, 390]) for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${width} ${colorScheme}`, () => {
    test.use({ viewport: { width, height: 900 }, colorScheme });
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
      for (const status of await transcript.getByText("正在处理", { exact: true }).all()) {
        await expect(status).toHaveCSS("animation-name", "none");
      }
      await expect(transcript.getByText("正在核对参与者与预约规则。", { exact: true })).toHaveCount(0);
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
      await expect(transcript.getByText("正在处理", { exact: true }).first()).toBeVisible();
    });

    test("context task restores its stages and summary without provider payloads", async ({ page }, info) => {
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
      await expect(chain.getByText("展示学生和管理员与图书馆座位预约系统的交互关系。", { exact: true })).toHaveCount(0);
      const review = chain.getByTestId("generation-task-step").last();
      const image = review.getByRole("img", { name: "系统环境图使用的图片 1" });
      await expect(image).toHaveCount(0);
      await expect(review.getByRole("button", { name: "思考过程 · 系统环境图" })).toHaveCount(0);
      await expect(review.getByText("对照结构化模型核对学生、管理员与系统节点及其关系。")).toHaveCount(0);
      await expect(transcript.getByText(/查看技术原文/)).toHaveCount(0);
      await expect(transcript.getByText('{"passed":true,"issues":[]}', { exact: true })).toHaveCount(0);
      await expect(transcript.getByRole("region", { name: "输出总结" })).toBeVisible();
      await expect(chain.getByRole("region", { name: "输出总结" })).toHaveCount(0);
      expect(await transcript.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("context-chain.png") });
      await chain.getByRole("button", { name: "思考过程", exact: true }).click();
      await expect(chain.getByRole("heading", { name: "视觉检查", exact: true })).toBeHidden();
      await expect(transcript.getByRole("region", { name: "输出总结" })).toBeVisible();
    });

    test("completed task restores progress and summary without provider output", async ({ page }, info) => {
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
      await expect(transcript.getByText("已识别学生与管理员，整理了查询座位、预约和签到等操作。", { exact: true })).toHaveCount(0);
      await expect(transcript.getByText("已生成 2 个图形预览。")).toBeVisible();
      await expect(transcript.getByText("需求建模助手", { exact: true })).toHaveCount(1);
      await expect(transcript.locator('[data-slot="card"], [data-slot="badge"]')).toHaveCount(0);
      expect(await transcript.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("conversation.png") });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已识别学生与管理员，整理了查询座位、预约和签到等操作。", { exact: true })).toHaveCount(0);
      await expect(transcript.getByText("已生成 2 个图形预览。")).toBeVisible();
      await page.reload();
      if (!(await transcript.isVisible())) await page.getByRole("button", { name: "生成任务", exact: true }).click();
      await expect(transcript.getByText("已生成 2 个图形预览。")).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
