// Verifies the trimmed community footer, implementation guidance, and retired exam route in the browser.
import { expect, test } from '@playwright/test';

for (const width of [375, 1440]) {
  for (const locale of ['zh-CN', 'en']) {
    test(`community footer and implementation guide fit ${width}px in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(value => {
        localStorage.setItem('uml-lab-locale-preference', value);
        localStorage.setItem('admincn-ui-theme', 'light');
      }, locale);
      await page.route('**/api/auth/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
      await page.goto('/');
      const question = page.getByRole('button', { name: locale === 'en' ? 'How do I move from system design to code?' : '系统设计完成后，怎么衔接代码实现？' });
      await question.click();
      await expect(page.getByText(locale === 'en' ? /Use the saved designs, acceptance criteria and test cases/ : /导出 UML 图表和工程说明书，结合项目中已保存的设计/)).toBeVisible();
      const footer = page.getByRole('contentinfo');
      await expect(footer).not.toContainText(/©|ICP备|公网安备|洪老师|个人技术分享|All rights reserved|Contact the maintainer/i);
      await expect(footer.locator('a[href^="mailto:"], a[href*="beian."]')).toHaveCount(0);
      await expect(footer.getByRole('link', { name: locale === 'en' ? 'Guide' : '使用指南', exact: true })).toHaveAttribute('href', 'https://jianglisoftware.com/tutorial');
      await footer.scrollIntoViewIfNeeded();
      // The separator's decorative end caps extend past the border; the content grid must fit.
      expect(await footer.locator(':scope > div').last().evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await footer.screenshot({ path: test.info().outputPath('community-footer.png') });
    });
  }
}

test('retired exam URL returns a real 404', async ({ request }) => {
  const response = await request.get('/exam');
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain('exam-countdown');
});
