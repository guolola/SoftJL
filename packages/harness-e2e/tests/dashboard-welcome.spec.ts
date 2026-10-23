// Verifies authenticated first-visit welcome, a persisted confirmation flag, and real dashboard restoration.
import { expect, test, type Page } from "@playwright/test";
import { dashboardFixture } from "../../../apps/web/src/features/dashboard/testing/dashboard-fixture";
import { dashboardWelcomeKey } from "../../../apps/web/src/features/dashboard/lib/dashboard-welcome-storage";

const dashboardPath = "/dashboard";
const welcomeTitle = "欢迎来到工作台🎉";
const confirmLabel = "确认，进入工作台";

test.use({ viewport: { width: 1440, height: 1000 }, contextOptions: { reducedMotion: "no-preference" } });

test.beforeEach(async ({ page }) => {
  const summary = dashboardFixture();
  await page.addInitScript(() => {
    localStorage.setItem('admincn-ui-theme', 'dark');
    localStorage.setItem('uml-lab-locale-preference', 'zh-CN');
  });
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (pathname === '/api/auth/me' || pathname === '/api/account/profile') body = {
      user: { id: 'welcome-owner', username: 'welcome_owner', displayName: '项目负责人', status: 'active', mfaEnabled: false,
        avatarUrl: null, systemRoles: [], createdAt: summary.generatedAt, updatedAt: summary.generatedAt, lastLoginAt: summary.generatedAt },
      session: { id: 'welcome-session', userId: 'welcome-owner', createdAt: summary.generatedAt, expiresAt: '2027-10-10T00:00:00Z', lastSeenAt: summary.generatedAt, ipAddress: null, userAgent: null },
      mfa: { enabled: false, enforcement: 'totp' },
      generationUsage: { usedToday: 0, limit: null, remaining: null, windowSeconds: 86400, limited: false, scope: 'user' },
    };
    else if (pathname === '/api/dashboard/summary') body = summary;
    else if (pathname === '/api/projects') body = { projects: [] };
    else if (pathname === '/api/account/onboarding') body = { emptyWorkspace: 'completed', firstProject: 'completed', firstProjectId: 'p-0' };
    else if (pathname === '/api/inbox') body = { messages: [], unreadCount: 0 };
    else if (pathname === '/api/system-notices') body = { generatedAt: summary.generatedAt, notices: [], unreadCount: 0 };
    else if (pathname === '/api/provider-configs') body = { generatedAt: summary.generatedAt, providerConfigs: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
});

function dashboardElements(page: Page) {
  const stage = page.getByTestId("welcome-stage");
  const grid = page.getByTestId("dashboard-06-grid");
  return {
    stage,
    grid,
    cards: grid.locator(':scope > [data-welcome-card]'),
    heading: page.getByRole("heading", { name: welcomeTitle, exact: true }),
    confirm: page.getByRole("button", { name: confirmLabel, exact: true }),
    replay: page.getByRole("button", { name: "重新体验", exact: true }),
  };
}

async function expectFloating(page: Page) {
  const { stage, cards, heading, confirm } = dashboardElements(page);
  await expect(stage).toHaveAttribute("data-welcome-phase", "floating");
  await expect(heading).toBeVisible();
  await expect(confirm).toBeVisible();
  await expect(cards).toHaveCount(12);
}

async function expectSettled(page: Page) {
  const { stage, grid, cards, heading, replay } = dashboardElements(page);
  await expect(stage).toHaveAttribute("data-welcome-phase", "settled");
  await expect(heading).toBeHidden();
  await expect(replay).toHaveCount(0);
  await expect(cards).toHaveCount(12);
  expect(await grid.evaluate(element => element.closest("[inert]") !== null)).toBe(false);
  await expect(grid.locator("[inert]")).toHaveCount(0);

}

test("real cards keep their identity and interactions; confirmation is remembered across reloads", async ({ page }) => {
  await page.goto(dashboardPath);
  const { stage, cards, grid, confirm } = dashboardElements(page);
  await expectFloating(page);
  await expect(page).toHaveURL(new RegExp(`${dashboardPath}$`));
  // An account with existing data must also see the example until confirmation, then regain its real values.
  await expect(cards.nth(3).getByText('3', { exact: true })).toBeVisible();
  await expect(cards.nth(7).getByText('91.3%', { exact: true })).toBeVisible();
  expect(await grid.evaluate(element => element.closest('[aria-hidden="true"]') !== null)).toBe(true);
  expect(await grid.evaluate(element => element.closest("[inert]") !== null)).toBe(false);
  // Effect shells receive pointer movement while business controls stay inaccessible during welcome.
  expect(await grid.locator("button, input, [role='combobox']").evaluateAll(elements =>
    elements.length > 0 && elements.every(element => element.closest("[inert]") !== null))).toBe(true);
  await page.mouse.move(900, 500);
  await page.mouse.wheel(0, 600);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await confirm.click();
  await expectSettled(page);
  expect(await stage.evaluate(element => element.scrollTop)).toBe(0);
  await expect(cards.nth(3).getByText('7', { exact: true })).toBeVisible();
  await expect(cards.nth(7).getByText('66.7%', { exact: true })).toBeVisible();
  // Existing dashboard controls become usable again after the transition releases the background.
  const activityTab = page.getByRole("tab", { name: "月度任务", exact: true });
  await activityTab.click();
  await expect(activityTab).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expectSettled(page);
  expect(await page.evaluate(key => localStorage.getItem(key), dashboardWelcomeKey('welcome-owner'))).toBe('true');
});

test("welcome supports keyboard confirmation while shell navigation stays usable", async ({ page }) => {
  await page.goto(dashboardPath);
  const { stage, confirm } = dashboardElements(page);
  await expectFloating(page);
  await expect(confirm).toBeFocused();
  for (const shell of [page.locator('[data-slot="sidebar"]').first(), page.locator('[data-slot="sidebar-inset"] > header').first()]) {
    await expect(shell).toBeVisible();
    expect(await shell.evaluate(element => element.closest("[inert]") !== null)).toBe(false);
  }
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).not.toBeFocused();
  await confirm.press("Enter");
  // Dispatch in the same event turn to exercise the synchronous action guard, before React rerenders.
  await confirm.evaluate(element => {
    const button = element as HTMLButtonElement;
    button.click();
    button.click();
    button.click();
  });
  await expect(stage).toHaveAttribute("data-welcome-phase", "returning");
  await expectSettled(page);
  await expect(stage).toBeFocused();
});

test("floating and returning remain usable across narrow, tablet, and desktop resizes", async ({ page }, info) => {
  await page.goto(dashboardPath);
  const { stage, confirm } = dashboardElements(page);
  for (const [width, height] of [[390, 844], [768, 1000], [971, 552], [1440, 1000], [1920, 1000]]) {
    await page.setViewportSize({ width, height });
    await expectFloating(page);
    expect(await confirm.evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    if (width === 390 || width === 971) await page.screenshot({ path: info.outputPath(`welcome-floating-${width}.png`) });
  }

  await confirm.click();
  await expect(stage).toHaveAttribute("data-welcome-phase", "returning");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectSettled(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectSettled(page);
});

test("reduced motion keeps a static welcome and remembers confirmation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(dashboardPath);
  const { stage, heading, confirm } = dashboardElements(page);
  await expect(stage).toHaveAttribute("data-welcome-phase", "floating");
  await expect(heading).toBeVisible();
  await expect(confirm).toBeFocused();
  await confirm.press("Enter");
  await expectSettled(page);
  await page.reload();
  await expectSettled(page);
});

for (const theme of ['light', 'dark']) {
  test(`empty accounts see examples only during welcome and inherit the ${theme} theme`, async ({ page }, info) => {
    await page.addInitScript(theme => localStorage.setItem('admincn-ui-theme', theme), theme);
    await page.route('**/api/dashboard/summary', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(dashboardFixture(0)),
    }));
    await page.goto(dashboardPath);
    const { cards, confirm } = dashboardElements(page);
    await expectFloating(page);
    await expect(cards.nth(3).getByText('3', { exact: true })).toBeVisible();
    await expect(cards.nth(7).getByText('91.3%', { exact: true })).toBeVisible();
    await expect(page.getByText('A LITTLE SPACE FOR BIG IDEAS', { exact: true })).toHaveCount(0);
    await expect(page.getByText('确认后，卡片将回到各自的位置', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`welcome-empty-${theme}.png`) });
    const original = await cards.nth(3).locator('[data-slot="card"]').elementHandle();
    await confirm.click();
    await expectSettled(page);
    expect(await cards.nth(3).locator('[data-slot="card"]').evaluate((element, original) => element === original, original)).toBe(true);
    await original?.dispose();
    await expect(cards.nth(3).getByText('0', { exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: '项目列表', exact: true }).getByText('暂无项目或匹配结果', { exact: true })).toBeVisible();
    await expect(page.getByText('课程设计项目', { exact: true })).toHaveCount(0);
    await expect(page.getByText('91.3%', { exact: true })).toHaveCount(0);
  });
}

test('welcome allows actual header theme changes and sidebar navigation without completing the first visit', async ({ page }) => {
  await page.goto(dashboardPath);
  dashboardElements(page);
  await expectFloating(page);

  await page.getByRole('button', { name: '主题色板', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Classic Indigo', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('admincn-ui-theme-preset'))).toBe('classic-indigo');
  await expectFloating(page);
  await page.getByRole('button', { name: '切换到浅色', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expectFloating(page);
  await page.locator('[data-slot="sidebar"]').getByRole('link', { name: '项目', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect(await page.evaluate(key => localStorage.getItem(key), dashboardWelcomeKey('welcome-owner'))).toBeNull();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.goto(dashboardPath);
  await expectFloating(page);
});
