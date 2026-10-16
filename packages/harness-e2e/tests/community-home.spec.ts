// Verifies direct community entry for signed-in and signed-out users across viewports and languages.
import { expect, test } from '@playwright/test';
import { mockProjectApi } from './fixtures/project-workspace';

for (const width of [375, 1440]) {
  for (const locale of ['zh-CN', 'en']) {
    test(`community entry fits ${width}px in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(value => {
        localStorage.setItem('uml-lab-locale-preference', value);
        localStorage.setItem('admincn-ui-theme', 'light');
      }, locale);
      await mockProjectApi(page);
      await page.goto('/');
      await expect(page).toHaveURL(/\/projects$/);
      await expect(page.getByRole('heading', { name: locale === 'en' ? 'Projects' : '项目首页', exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-template', 'admincn');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
      await page.route('**/api/auth/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
      await page.goto('/');
      await expect(page).toHaveURL(/\/login\?redirect=%2Fprojects/);
      await expect(page.getByTestId('auth-shell')).toBeVisible();
      await expect(page.getByRole('button', { name: /返回官网|Back to website/ })).toHaveCount(0);
    });
  }
}

test('entry redirects before rendering and crawler files exclude private pages', async ({ request }) => {
  const response = await request.get('/', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/projects');
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Disallow: /');
  expect(await robots.text()).not.toContain('Sitemap:');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain('<loc>');
  for (const path of ['/exam']) {
    expect((await request.get(path)).status()).toBe(404);
  }
});
