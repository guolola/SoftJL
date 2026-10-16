// Verifies actual SVG colors across app surfaces in the community browser pages.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockProjectApi } from './fixtures/project-workspace';

async function mockBrandPage(page: Page) {
  await mockProjectApi(page);

}
async function colors(logo: Locator) {
  return logo.evaluate((svg) => {
    const context = document.createElement('canvas').getContext('2d')!;
    const rgb = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const badge = svg.querySelector('rect');
    return {
      badge: badge ? rgb(getComputedStyle(badge).fill) : null,
      glyph: rgb(getComputedStyle(svg.querySelector('path')!).fill),
    };
  });
}

for (const path of ['/', '/projects']) {
  test(`brand colors follow the theme on ${path}`, async ({ page }) => {
    await mockBrandPage(page);
    await page.route('**/*.mp4', (route) => route.abort());
    await page.addInitScript(() => {
      if (!localStorage.getItem('admincn-ui-theme')) localStorage.setItem('admincn-ui-theme', 'light');
      localStorage.setItem('uml-lab-locale-preference', 'zh-CN');
    });
    await page.goto(path);
    const logo = page.locator('svg[data-slot="product-logo"]').first();
    await expect(logo).toBeVisible();
    await expect.poll(() => colors(logo)).toEqual({ badge: null, glyph: [24, 24, 27] });
    await page.getByRole('button', { name: /切换明暗主题|切换到深色/ }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect.poll(() => colors(logo)).toEqual({ badge: null, glyph: [244, 244, 245] });
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect.poll(() => colors(logo)).toEqual({ badge: null, glyph: [244, 244, 245] });
    await page.getByRole('button', { name: /切换明暗主题|切换到浅色/ }).click();
    await expect.poll(() => colors(logo)).toEqual({ badge: null, glyph: [24, 24, 27] });
  });
}

