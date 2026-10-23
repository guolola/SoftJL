// Checks generation scope, confirmation cancellation, and access to actions in short viewports.
import { expect, test } from "@playwright/test";
import { projectId, mockProjectApi } from "./fixtures/project-workspace";
import { snapshotInputFingerprint } from "@uml-platform/contracts";

test.use({ contextOptions: { reducedMotion: "reduce" } });

for (const theme of ["light"]) {
  for (const width of [390, 1440]) {
    test(`${theme} ${width}px generation scope uses the shared status flow`, async ({ page }, info) => {
      await page.addInitScript(theme => localStorage.setItem("admincn-ui-theme", theme), theme);
      const requirementText = "学生可以预约座位。预约记录包含学生和座位信息。";
      const rules = [
        { id: "r1", text: "学生可以预约座位。", type: "functional" as const },
        { id: "r2", text: "预约记录包含学生和座位信息。", type: "data" as const },
      ];
      await mockProjectApi(page, {
        selectedDiagramTypes: ["usecase", "class"],
        requirementText, rules,
        requirementInputFingerprint: snapshotInputFingerprint({ requirementText, rules }),
        rulesVersion: 1, rulesBasedOnTextVersion: 0,
      });
      // The fixture explicitly enables fixed demo generation; no external model or run is needed.
      await page.route(`**/api/projects/${projectId}`, route => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          project: { id: projectId, name: "座位预约系统", status: "active",  ownerUserId: "user-1" },
          capabilities: ["update_project", "start_runs"], generationExecutionMode: "offline-demo",
        }),
      }));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/projects/${projectId}`);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await page.getByRole("navigation", { name: "项目导航" }).getByRole("button", { name: "需求模型", exact: true }).click();
      await page.getByRole("button", { name: "选择用例模型", exact: true }).click();
      await page.getByRole("button", { name: "选择领域概念模型", exact: true }).click();
      await expect(page.getByRole("button", { name: "生成", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "生成", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "确认生成需求模型" });
      await expect(dialog).toBeVisible();
      await page.setViewportSize({ width, height: 900 });
      const flow = dialog.getByRole("list", { name: "模型生成范围" });
      await expect(flow.getByRole("heading")).toHaveText(["保留不变", "更新", "新增"]);
      await expect(flow.locator('[data-generation-category="updated"]')).toContainText("用例模型");
      await expect(flow.locator('[data-generation-category="added"]')).toContainText("领域概念模型");
      await page.screenshot({ path: info.outputPath("confirmation.png") });
      await page.setViewportSize({ width, height: 360 });
      const body = dialog.getByTestId("generation-confirmation-body");
      await expect.poll(() => body.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
      await dialog.getByRole("button", { name: "确认生成", exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole("heading", { name: "确认生成需求模型" })).toBeVisible();
      await page.screenshot({ path: info.outputPath("scrolling.png") });
      await dialog.getByRole("button", { name: "取消", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    });
  }
}
