// Checks real generation confirmation flows, semantic colors, and bounded dialog scrolling.
import { expect, test, type Locator } from "@playwright/test";
import { projectId, mockProjectApi } from "./fixtures/project-workspace";

test.use({ reducedMotion: "reduce" });

async function expectToneColor(icon: Locator, token: string) {
  const colors = await icon.evaluate((node, token) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { actual: getComputedStyle(node).color, expected };
  }, token);
  expect(colors.actual).toBe(colors.expected);
}

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`${theme} ${width}px generation scope uses the shared status flow`, async ({ page }, info) => {
      await page.addInitScript(theme => localStorage.setItem("admincn-ui-theme", theme), theme);
      await mockProjectApi(page, {
        selectedDiagramTypes: ["usecase", "class"],
        rules: [{ id: "r1", text: "学生可以预约座位。", category: "功能需求", priority: "must", relatedDiagrams: ["usecase", "class"] }],
      });
      // The fixture explicitly enables fixed demo generation; no external model or run is needed.
      await page.route(`**/api/projects/${projectId}`, route => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          project: { id: projectId, name: "座位预约系统", status: "active", visibility: "private", ownerUserId: "user-1" },
          capabilities: ["update_project", "start_runs"], generationExecutionMode: "offline-demo",
        }),
      }));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/projects/${projectId}`);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await page.getByRole("navigation", { name: "项目导航" }).getByRole("button", { name: "需求模型", exact: true }).click();
      await page.getByRole("button", { name: "选择用例模型", exact: true }).click();
      await page.getByRole("button", { name: "选择领域概念模型", exact: true }).click();
      await expect(page.getByRole("button", { name: /应用变更/ })).toBeEnabled();
      await page.getByRole("button", { name: /应用变更/ }).click();
      const dialog = page.getByRole("dialog", { name: "确认生成需求模型" });
      await expect(dialog).toBeVisible();
      await page.setViewportSize({ width, height: 900 });
      // Capture the settled popup rather than a frame from its entrance transition.
      await dialog.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))));
      const flow = dialog.getByRole("list", { name: "模型生成范围" });
      await expect(flow.getByRole("heading")).toHaveText(["保留不变", "更新", "新增"]);
      for (const [category, token] of [["kept", "--success"], ["updated", "--warning"], ["added", "--info"]]) {
        const item = flow.locator(`[data-generation-category="${category}"]`);
        await expectToneColor(item.locator("svg"), token);
        expect(await item.evaluate(node => {
          const style = getComputedStyle(node);
          return { background: style.backgroundColor, border: style.borderTopWidth, shadow: style.boxShadow };
        })).toEqual({ background: "rgba(0, 0, 0, 0)", border: "0px", shadow: "none" });
      }
      await expect(flow.locator('[data-generation-category="updated"]')).toContainText("用例模型");
      await expect(flow.locator('[data-generation-category="added"]')).toContainText("领域概念模型");
      await page.screenshot({ path: info.outputPath("confirmation.png") });
      await page.setViewportSize({ width, height: 360 });
      const body = dialog.getByTestId("generation-confirmation-body");
      await expect.poll(() => body.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
      await dialog.getByRole("button", { name: "确认生成", exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole("heading", { name: "确认生成需求模型" })).toBeVisible();
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(360);
      await page.screenshot({ path: info.outputPath("scrolling.png") });
      await dialog.getByRole("button", { name: "取消", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    });
  }
}
