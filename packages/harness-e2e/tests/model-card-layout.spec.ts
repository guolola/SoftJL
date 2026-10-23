// Measures responsive card widths, content-driven heights and semantic status colors.
import { expect, test } from "@playwright/test";
import { themePresets } from "../../../apps/web/src/shared/ui/theme-presets";
import { projectId, mockProjectApi } from "./fixtures/project-workspace";

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440, 2048]) {
    test(`${theme} ${width}px model cards preserve responsive widths, readable guidance and status colors`, async ({ page }, info) => {
      await page.addInitScript(({ theme }) => {
        localStorage.setItem("admincn-ui-theme", theme);
        localStorage.setItem("admincn-ui-theme-preset", "caffeine");
      }, { theme });
      await mockProjectApi(page, {
        diagramInputFingerprints: {},
        designDiagramErrors: {
          class: { stage: "render_svg", error: { code: "RUN_RENDER_FAILED", category: "render", retryable: true, message: "重新生成失败，仍可查看上一版。".repeat(35) } },
        },
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/projects/${projectId}`);
      await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
      for (const label of ["需求模型", "可行性分析", "设计模型"]) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator('[data-slot="sidebar"]').getByRole("button", { name: label, exact: true }).click();
        const grid = page.locator('[data-mobile-card-density="model-targets"]');
        await expect(grid).toBeVisible();
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => document.fonts.ready);
        const cards = grid.locator(':scope > [data-slot="spotlight-card"]');
        const geometry = await cards.evaluateAll(nodes => nodes.map(node => {
          const bounds = node.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        }));
        for (const box of geometry) {
          expect(box.height).toBeGreaterThanOrEqual(width < 640 ? 260 : 284);
          expect(Math.abs(box.width - geometry[0].width)).toBeLessThan(1);
        }
        if (width === 390) {
          // Two columns must fill the available grid, including the platform scrollbar gutter.
          const availableWidth = await grid.evaluate(node => node.clientWidth - Number.parseFloat(getComputedStyle(node).columnGap));
          expect(Math.abs(geometry[0].width * 2 - availableWidth)).toBeLessThan(1);
        }
        await expect(grid.getByText(/^(未生成|已生成设计模型|等待生成)$/)).toHaveCount(0);
        if (label === "需求模型") {
          const stale = grid.locator('[data-generation-status="stale"]').first();
          await expect(stale).toBeVisible();
          await expect(stale).toHaveAttribute("aria-label", /需更新/);
        }
        if (label === "设计模型") {
          // A stale upstream takes status priority; the previous rendering failure remains visible inline.
          const failureCard = cards.filter({ has: page.getByRole('heading', { name: '设计类图', exact: true }) });
          await expect(failureCard.getByRole('heading', { name: '设计类图', exact: true })).toBeVisible();
          const guidance = failureCard.getByText('图形渲染失败，请检查模型结果后重试。', { exact: true });
          const layout = await guidance.evaluate(node => ({
            scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
            bottom: node.getBoundingClientRect().bottom,
            cardBottom: node.closest('[data-slot="spotlight-card"]')!.getBoundingClientRect().bottom,
          }));
          expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1);
          expect(layout.bottom).toBeLessThanOrEqual(layout.cardBottom);
        }
        await grid.screenshot({ path: info.outputPath(`${label}.png`) });
      }
    });
  }
}

test("switching theme palettes preserves green success and red failure icons", async ({ page }) => {
  await mockProjectApi(page, {
    diagramErrors: { "analysis:uc-3": { stage: "render_svg", error: { code: "RUN_RENDER_FAILED", category: "render", retryable: true, message: "生成失败" } } },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
  await page.getByRole("navigation", { name: "项目导航" }).getByRole("button", { name: "需求模型", exact: true }).click();
  const grid = page.locator('[data-mobile-card-density="model-targets"]');
  await expect(grid.locator('[data-generation-status="completed"]')).toBeVisible();
  await expect(grid.locator('[data-generation-status="failed"]')).toBeVisible();
  // Apply the same CSS variables as ThemeProvider, including presets with non-red destructive colors.
  for (const theme of ["light", "dark"] as const) {
    let baseline: string[] | undefined;
    for (const preset of Object.values(themePresets)) {
      const colors = await page.evaluate(({ theme, styles }) => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        Object.entries(styles).forEach(([key, value]) => document.documentElement.style.setProperty(`--${key}`, value));
        return ['completed', 'failed'].map(status => getComputedStyle(document.querySelector(`[data-mobile-card-density="model-targets"] [data-generation-status="${status}"] svg`)!).color);
      }, { theme, styles: preset.styles[theme] });
      if (!baseline) baseline = colors;
      expect(colors, `${preset.label} ${theme}`).toEqual(baseline);
    }
  }
});

test("requirement model cards disclose auto-fill and linked rules without expanding the cards", async ({ page }, info) => {
  await mockProjectApi(page, {
    autoGeneratedUpstreamReviews: {
      "requirement-rule:mapping:deployment": {
        id: "requirement-rule:mapping:deployment",
        artifactType: "requirement-rule",
        artifactId: "mapping:deployment",
        label: "部署需求模型规则映射",
        reason: "生成所选模型时缺少上游规则映射，系统自动补齐关联关系。",
        sourceRunId: "run-rules",
        status: "pending",
        createdAt: "2026-06-11T04:00:00.000Z",
      },
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
  await page.locator('[data-slot="sidebar"]').getByRole("button", { name: "需求模型", exact: true }).click();

  const requirementGrid = page.locator('[data-mobile-card-density="model-targets"]');
  const deploymentCard = requirementGrid.locator('[data-slot="spotlight-card"]').filter({
    has: page.locator("h3").filter({ hasText: /^部署需求模型$/ }),
  });
  const useCaseCard = requirementGrid.locator('[data-slot="spotlight-card"]').filter({
    has: page.locator("h3").filter({ hasText: /^用例模型$/ }),
  });

  await expect(deploymentCard.getByText("待审")).toBeVisible();
  await expect(deploymentCard.getByText("部署需求模型规则映射")).toHaveCount(0);
  const autoFillTrigger = deploymentCard.getByRole("button", {
    name: "查看部署需求模型自动补齐说明",
  });
  await autoFillTrigger.focus();
  await page.keyboard.press("Enter");
  const autoFillPopover = page.locator('[data-slot="popover-content"]').filter({
    hasText: "部署需求模型自动补齐说明",
  });
  await expect(autoFillPopover).toBeVisible();
  await expect(autoFillPopover.getByText("部署需求模型规则映射")).toBeVisible();
  await expect(autoFillPopover.getByText(/系统自动补齐关联关系/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("requirement-auto-fill-popover.png") });
  await page.keyboard.press("Escape");
  await expect(autoFillPopover).toBeHidden();
  await expect(autoFillTrigger).toBeFocused();

  await expect(useCaseCard.getByText("学生预约座位时系统必须校验座位可用并记录预约。")).toHaveCount(0);
  await page.getByRole("button", { name: "查看用例模型关联需求规则" }).click();
  const linkedRulesPopover = page.locator('[data-slot="popover-content"]').filter({
    hasText: "用例模型关联需求规则",
  });
  await expect(linkedRulesPopover).toBeVisible();
  await expect(linkedRulesPopover.getByText("r1")).toBeVisible();
  await expect(linkedRulesPopover.getByText("学生预约座位时系统必须校验座位可用并记录预约。")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(linkedRulesPopover).toBeHidden();

  await page.setViewportSize({ width: 375, height: 844 });
  await autoFillTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(autoFillPopover).toBeVisible();
  await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("requirement-auto-fill-popover-mobile.png") });
});
