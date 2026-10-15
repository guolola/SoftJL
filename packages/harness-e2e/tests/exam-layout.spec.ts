// Guards viewport fit and the glass countdown's overlap with both title lines in both languages.
import { expect, test } from '@playwright/test';

for (const locale of ['zh-CN', 'en']) {
  for (const viewport of [{ width: 390, height: 720 }, { width: 768, height: 720 }, { width: 1440, height: 620 }, { width: 1920, height: 900 }]) {
    for (const theme of ['light', 'dark']) {
      test(`exam countdown fits ${viewport.width}px in ${locale} and ${theme}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.addInitScript(({ locale, theme }) => {
          localStorage.setItem('uml-lab-locale-preference', locale);
          localStorage.setItem('admincn-ui-theme', theme);
        }, { locale, theme });
        await page.route('**/api/**', async route => {
          const pathname = new URL(route.request().url()).pathname;
          let body: unknown = {};
          if (pathname === '/api/auth/me' || pathname === '/api/account/profile') {
            body = {
              user: { id: 'exam-user', email: 'exam@example.test', displayName: 'Exam User', status: 'active', emailVerified: true, mfaEnabled: false },
              session: { id: 'exam-session', userId: 'exam-user', createdAt: '2026-10-10T00:00:00Z', expiresAt: '2027-10-10T00:00:00Z', lastSeenAt: '2026-10-10T00:00:00Z' },
            };
          } else if (pathname === '/api/projects') body = { projects: [] };
          else if (pathname === '/api/account/onboarding') body = { emptyWorkspace: 'completed', firstProject: 'completed', firstProjectId: null };
          else if (pathname === '/api/system-notices') body = { generatedAt: '2026-10-10T00:00:00Z', notices: [], unreadCount: 0 };
          else if (pathname === '/api/provider-configs') body = { generatedAt: '2026-10-10T00:00:00Z', providerConfigs: [] };
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.goto('/exam');
        const first = page.getByRole('heading', { name: locale === 'en' ? 'Get ready to' : '准备好迎接' });
        const second = page.getByRole('heading', { name: locale === 'en' ? 'experience innovation' : '创新体验' });
        await expect(second).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const countdown = page.locator('[data-slot="exam-countdown"]');
        const firstBox = (await first.boundingBox())!;
        const secondBox = (await second.boundingBox())!;
        const timerBox = (await countdown.boundingBox())!;
        expect(timerBox.y).toBeLessThan(firstBox.y + firstBox.height);
        expect(timerBox.y + timerBox.height).toBeGreaterThan(secondBox.y);
        // Preserve enough clear title text to keep the glass effect from hiding either line.
        expect(timerBox.y).toBeGreaterThan(firstBox.y + firstBox.height / 2);
        expect(timerBox.y + timerBox.height).toBeLessThan(secondBox.y + secondBox.height / 2);
        expect(Math.abs(timerBox.y + timerBox.height / 2 - (firstBox.y + firstBox.height + secondBox.y) / 2)).toBeLessThanOrEqual(1);
        expect(await countdown.evaluate(element => getComputedStyle(element).backdropFilter)).not.toBe('none');
        expect(Math.abs(timerBox.x + timerBox.width / 2 - firstBox.x - firstBox.width / 2)).toBeLessThanOrEqual(1);
        const overflow = await page.evaluate(() => ({
          horizontal: document.documentElement.scrollWidth - innerWidth,
          vertical: document.documentElement.scrollHeight - innerHeight,
        }));
        expect(overflow.horizontal).toBeLessThanOrEqual(1);
        expect(overflow.vertical).toBeLessThanOrEqual(1);
        await page.screenshot({ path: test.info().outputPath('exam.png'), fullPage: true });
      });
    }
  }
}
