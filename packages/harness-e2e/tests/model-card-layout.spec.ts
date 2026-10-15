// Measures shared card geometry and semantic icon colors against the project workspace.
import { expect, test, type Locator } from "@playwright/test";
import { projectId, mockProjectApi } from "./fixtures/project-workspace";
import { themePresets } from "../../../apps/web/src/shared/ui/theme-presets";

async function expectSemanticColor(icon: Locator, token: string) {
  const colors = await icon.evaluate((node, token) => {
    // Resolve both colors through the browser so CSS minification (.154 vs 0.154) is irrelevant.
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
  for (const width of [390, 1440, 2048]) {
    test(`${theme} ${width}px model cards share dimensions and status colors`, async ({ page }, info) => {
      await page.addInitScript(({ theme }) => {
        localStorage.setItem("admincn-ui-theme", theme);
        localStorage.setItem("admincn-ui-theme-preset", "caffeine");
      }, { theme });
      await mockProjectApi(page, {
        designDiagramErrors: {
          class: { stage: "render_svg", error: { code: "RUN_RENDER_FAILED", category: "render", retryable: true, message: "重新生成失败，仍可查看上一版。".repeat(35) } },
        },
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/projects/${projectId}`);
      await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
      const sizes: Array<{ width: number; height: number }> = [];
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
          expect(box.height).toBe(width < 640 ? 212 : 236);
          expect(Math.abs(box.width - geometry[0].width)).toBeLessThan(1);
        }
        sizes.push(geometry[0]);
        if (width === 390) expect(geometry[0].width).toBe(175);
        await expect(grid.getByText(/^(未生成|已生成设计模型|等待生成)$/)).toHaveCount(0);
        if (label === "需求模型") {
          const success = grid.locator('[data-generation-status="completed"] svg').first();
          await expect(success).toBeVisible();
          await expectSemanticColor(success, '--success');
        }
        if (label === "设计模型") {
          const failed = grid.locator('[data-generation-status="failed"]');
          await expect(failed).toBeVisible();
          await expectSemanticColor(failed.locator('svg'), '--status-failure');
          const failureCard = cards.filter({ has: page.locator('[data-generation-status="failed"]') });
          await expect(failureCard.getByRole('button', { name: '查看', exact: true })).toBeVisible();
          expect(await failureCard.locator('.overflow-y-auto').evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
        }
        await grid.screenshot({ path: info.outputPath(`${label}.png`) });
      }
      expect(Math.abs(sizes[0].width - sizes[1].width)).toBeLessThan(1);
      expect(Math.abs(sizes[0].width - sizes[2].width)).toBeLessThan(1);
      await info.attach('card-dimensions', { contentType: 'application/json', body: JSON.stringify(sizes) });
    });
  }
}

test("switching theme palettes preserves green success and red failure icons", async ({ page }) => {
  await mockProjectApi(page, {
    diagramErrors: { class: { stage: "render_svg", error: { code: "RUN_RENDER_FAILED", category: "render", retryable: true, message: "生成失败" } } },
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
  const initialHeight = (await deploymentCard.boundingBox())?.height;

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
  expect((await deploymentCard.boundingBox())?.height).toBe(initialHeight);
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
  expect((await useCaseCard.boundingBox())?.height).toBe(initialHeight);
  await page.keyboard.press("Escape");
  await expect(linkedRulesPopover).toBeHidden();

  await page.setViewportSize({ width: 375, height: 844 });
  await autoFillTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(autoFillPopover).toBeVisible();
  await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(1);
  const popupBounds = await autoFillPopover.boundingBox();
  expect(popupBounds).not.toBeNull();
  expect(popupBounds!.x).toBeGreaterThanOrEqual(0);
  expect(popupBounds!.x + popupBounds!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("requirement-auto-fill-popover-mobile.png") });
});
