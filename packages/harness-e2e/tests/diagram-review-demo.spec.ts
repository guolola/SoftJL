// Checks the offline review fixtures in the actual generation drawer, including images and replay.
import { test, expect } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";
import { createEmptySnapshot } from "../../../apps/api/src/runs/records/snapshots";
import type { RunRecord } from "../../../apps/api/src/runs/records/run-record-store";
import { completeOfflineDemoRequirementRun, completeOfflineDemoDesignRun } from "../../../apps/api/src/runs/demo/offline-demo-runs";
import { startRunRequestSchema, startDesignRunRequestSchema } from "@uml-platform/contracts";
import { librarySeatDemoFixture } from "../../../apps/api/src/runs/demo/fixtures/library-seat-demo-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
for (const kind of ["requirements", "design"] as const) {
  test(`${kind} mock review shows counts, accepted corrections and its own PNG in the drawer`, async ({ page }, info) => {
    const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
    process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
    const runId = `review-demo-${kind}`;
    const record: RunRecord = { snapshot: createEmptySnapshot(runId, "演示需求", ["usecase", "activity"]), events: [], listeners: new Set(), terminal: false };
    try {
      if (kind === "requirements") await completeOfflineDemoRequirementRun(record, startRunRequestSchema.parse({ requirementText: "演示需求", selectedDiagrams: ["usecase", "activity"] }));
      else await completeOfflineDemoDesignRun(record, startDesignRunRequestSchema.parse({
        selectedDiagrams: ["table", "sequence"], requirementBaseline: librarySeatDemoFixture.requirementSnapshot.requirementBaseline,
        requirementModels: librarySeatDemoFixture.requirementSnapshot.models,
        requirementModelTraceability: librarySeatDemoFixture.requirementSnapshot.requirementModelTraceability,
      }));
    } finally { if (previous === undefined) delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS; else process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous; }
    await mockProjectApi(page);
    const run = { runId, projectId, runKind: kind, status: "completed", stage: "verify_diagram_visual", model: "offline-demo-fixed-artifacts", createdAt: new Date().toISOString() };
    await page.route(`**/api/projects/${projectId}/runs`, (route) => route.fulfill({ json: { projectId, runs: [run] } }));
    await page.route(`**/api/projects/${projectId}/runs/${runId}*`, (route) => route.fulfill({ json: { projectId, run, events: record.events } }));
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "生成任务", exact: true }).click();
    const transcript = page.getByTestId("generation-transcript");
    await expect(transcript.getByText("offline-demo-fixed-artifacts", { exact: true })).toBeVisible();
    const detail = transcript.locator('[data-slot="diagram-review-details"]').filter({ hasText: "纠错尝试 1 次" });
    await expect(detail).toHaveCount(1);
    await expect(detail).toContainText(kind === "requirements" ? "结构核对 1 次 · 图片检查 2 次" : "结构核对 2 次 · 图片检查 1 次");
    await expect(detail).toContainText("已接受");
    await expect(transcript.getByText("停止原因：证据不足，保留待确认；未启动修复尝试").first()).toBeVisible();
    const images = transcript.locator('img[src^="data:image/png;base64,"]');
    await expect(images).not.toHaveCount(0);
    // Input images load lazily in the scrollable drawer, so bring each one into view.
    for (const image of await images.all()) {
      await image.locator("..").scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((item) => (item as HTMLImageElement).complete && (item as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await expect(image).toBeVisible();
    }
    await detail.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`${kind}-visual-review.png`) });
    await page.reload();
    if (!(await transcript.isVisible())) await page.getByRole("button", { name: "生成任务", exact: true }).click();
    await expect(detail).toHaveCount(1);
  });
}
