// Verifies authenticated first-visit welcome, a persisted confirmation flag, and real dashboard restoration.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { dashboardFixture } from "../../../apps/web/src/features/dashboard/testing/dashboard-fixture";
import { dashboardWelcomeKey } from "../../../apps/web/src/features/dashboard/lib/dashboard-welcome-storage";

const dashboardPath = "/dashboard";
const welcomeTitle = "欢迎来到工作台🎉";
const confirmLabel = "确认，进入工作台";

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });

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
      user: { id: 'welcome-owner', email: 'welcome@example.test', displayName: '项目负责人', status: 'active', emailVerified: true, mfaEnabled: false },
      session: { id: 'welcome-session', userId: 'welcome-owner', createdAt: summary.generatedAt, expiresAt: '2027-10-10T00:00:00Z', lastSeenAt: summary.generatedAt },
    };
    else if (pathname === '/api/dashboard/summary') body = summary;
    else if (pathname === '/api/projects') body = { projects: [] };
    else if (pathname === '/api/account/onboarding') body = { emptyWorkspace: 'completed', firstProject: 'completed', firstProjectId: 'p-0' };
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

async function expectFloating(page: Page, count: number) {
  const { stage, cards, heading, confirm } = dashboardElements(page);
  await expect(stage).toHaveAttribute("data-welcome-phase", "floating");
  await expect(heading).toBeVisible();
  await expect(confirm).toBeVisible();
  await expect(cards).toHaveCount(12);
  await expect.poll(() => cards.evaluateAll(elements => elements.map(element => Number(getComputedStyle(element).opacity) > 0.01)))
    .toEqual(Array.from({ length: 12 }, (_, index) => index < count));
}

async function expectSettled(page: Page) {
  const { stage, grid, cards, heading, replay } = dashboardElements(page);
  await expect(stage).toHaveAttribute("data-welcome-phase", "settled");
  await expect(heading).toBeHidden();
  await expect(replay).toHaveCount(0);
  await expect(cards).toHaveCount(12);
  await expect.poll(() => cards.evaluateAll(elements => elements.every(element => {
    const style = getComputedStyle(element);
    return style.transform === "none" && style.opacity === "1";
  }))).toBe(true);
  expect(await grid.evaluate(element => element.closest("[inert]") !== null)).toBe(false);
  await expect(grid.locator("[inert]")).toHaveCount(0);
  await expectStaticEffects(cards);
}

async function expectStaticEffects(cards: Locator) {
  await expect.poll(() => cards.evaluateAll(elements => elements.every(card => {
    const surface = card.querySelector(':scope > div > div');
    const glare = card.getAttribute('data-welcome-effect') === 'comet-card' ? surface?.lastElementChild : null;
    return [card, surface].every(element => !element || new DOMMatrixReadOnly(getComputedStyle(element).transform).isIdentity)
      && (!glare || getComputedStyle(glare).opacity === "0");
  }))).toBe(true);
}

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

async function translation(card: Locator) {
  return card.evaluate(element => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: transform.m41, y: transform.m42 };
  });
}

async function moveOverEffect(page: Page, card: Locator) {
  const box = await effectSurface(card).boundingBox();
  expect(box).not.toBeNull();
  // Floating cards intentionally never become position-stable, so use real pointer coordinates instead of hover's stability wait.
  await page.mouse.move(box!.x + box!.width * .72, box!.y + box!.height * .36);
}

function effectSurface(card: Locator) {
  // The source Comet component puts its interactive surface inside a perspective container.
  return card.locator(':scope > div > div').first();
}

test("every visible Comet card starts tilted, accepts hover, and becomes static after confirmation", async ({ page }, info) => {
  await page.goto(dashboardPath);
  const { cards, grid, confirm } = dashboardElements(page);
  await expectFloating(page, 8);
  await expect(grid.locator('[data-welcome-effect="3d-card"]')).toHaveCount(0);
  await expect(grid.locator('[data-welcome-effect="comet-card"]')).toHaveCount(12);
  const statisticCard = cards.first();
  const cometCard = cards.nth(6);
  const cometSurface = effectSurface(cometCard);
  const glare = cometSurface.locator(':scope > div:last-child');
  // Arrival must show the imported 3D effects before any pointer event, rather than waiting for hover.
  await expect.poll(() => cards.evaluateAll(elements => elements.slice(0, 8).every(card => {
    const surface = card.querySelector(':scope > div > div')!;
    return !new DOMMatrixReadOnly(getComputedStyle(surface).transform).isIdentity;
  }))).toBe(true);
  await page.screenshot({ path: info.outputPath("welcome-comet-initial.png") });

  for (let index = 0; index < 8; index++) {
    const card = cards.nth(index);
    const surface = effectSurface(card);
    const reflection = surface.locator(':scope > div:last-child');
    const originalGlare = await reflection.evaluate(element => getComputedStyle(element).backgroundImage);
    await moveOverEffect(page, card);
    await expect.poll(() => surface.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m43)).toBeGreaterThan(10);
    await expect.poll(() => reflection.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe(originalGlare);
    if (index === 0 || index === 6) await page.screenshot({ path: info.outputPath(`welcome-comet-hover-${index}.png`) });
  }

  await confirm.click();
  await expectSettled(page);
  await moveOverEffect(page, statisticCard);
  await expectStaticEffects(cards);
  await cometCard.scrollIntoViewIfNeeded();
  await moveOverEffect(page, cometCard);
  await expectStaticEffects(cards);
  await expect(glare).toHaveCSS("opacity", "0");
});

test("real cards keep their identity and interactions; confirmation is remembered across reloads", async ({ page }, info) => {
  await page.goto(dashboardPath);
  const { stage, cards, grid, confirm } = dashboardElements(page);
  await expectFloating(page, 8);
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

  // Sample rendered transforms over real frames so a static exploded layout cannot pass as floating.
  const firstCard = await cards.first().elementHandle();
  const originalContent = await cards.first().locator('[data-slot="card"]').elementHandle();
  const start = await translation(cards.first());
  await expect.poll(async () => {
    const current = await translation(cards.first());
    return Math.hypot(current.x - start.x, current.y - start.y);
  }).toBeGreaterThan(0.5);
  const scales = await cards.evaluateAll(elements => elements.slice(0, 8).map(element => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return Math.hypot(matrix.m11, matrix.m12, matrix.m13);
  }));
  expect(Math.max(...scales) - Math.min(...scales)).toBeGreaterThan(0.05);
  await page.screenshot({ path: info.outputPath("welcome-floating-desktop.png") });

  await confirm.click();
  await expectSettled(page);
  expect(await stage.evaluate(element => element.scrollTop)).toBe(0);
  await expect(cards.nth(3).getByText('7', { exact: true })).toBeVisible();
  await expect(cards.nth(7).getByText('66.7%', { exact: true })).toBeVisible();
  expect(await cards.first().evaluate((element, original) => element === original, firstCard)).toBe(true);
  expect(await cards.first().locator('[data-slot="card"]').evaluate((element, original) => element === original, originalContent)).toBe(true);
  await firstCard?.dispose();
  await originalContent?.dispose();
  // Existing dashboard controls become usable again after the transition releases the background.
  const activityTab = page.getByRole("tab", { name: "月度任务", exact: true });
  await activityTab.click();
  await expect(activityTab).toHaveAttribute("aria-selected", "true");
  await expectNoOverflow(page);

  await page.reload();
  await expectSettled(page);
  expect(await page.evaluate(key => localStorage.getItem(key), dashboardWelcomeKey('welcome-owner'))).toBe('true');
});

test("welcome supports keyboard confirmation while shell navigation stays usable", async ({ page }) => {
  await page.goto(dashboardPath);
  const { stage, confirm } = dashboardElements(page);
  await expectFloating(page, 8);
  const beam = confirm.locator('[data-slot="border-beam"] > div');
  await expect(beam).toBeAttached();
  const initialBeam = await beam.evaluate(element => getComputedStyle(element).offsetDistance);
  await expect.poll(() => beam.evaluate(element => getComputedStyle(element).offsetDistance)).not.toBe(initialBeam);
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
  const { stage, cards, heading, confirm } = dashboardElements(page);
  for (const [width, height] of [[390, 844], [768, 1000], [971, 552], [1440, 1000], [1920, 1000]]) {
    await page.setViewportSize({ width, height });
    const floatingCount = await stage.evaluate(element => element.clientWidth < 768 ? 4 : 8);
    await expectFloating(page, floatingCount);
    await expectNoOverflow(page);
    await expect.poll(() => cards.evaluateAll((elements, count) => {
      const stageBounds = elements[0].closest('[data-testid="welcome-stage"]')!.getBoundingClientRect();
      return elements.slice(0, count).flatMap((element, index) => {
        const cardBounds = element.querySelector('[data-slot="card"]')!.getBoundingClientRect();
        const clipped = cardBounds.left < stageBounds.left - 1 || cardBounds.right > stageBounds.right + 1
          || cardBounds.top < stageBounds.top - 1 || cardBounds.bottom > stageBounds.bottom + 1;
        return clipped ? [index] : [];
      });
    }, floatingCount), { message: `Original cards stay inside the welcome stage at ${width}×${height}` }).toEqual([]);
    for (const element of [heading, confirm]) {
      await expect.poll(async () => {
        const box = await element.boundingBox();
        return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1;
      }).toBe(true);
    }
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
  await expectNoOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectSettled(page);
  await expectNoOverflow(page);
});

test("reduced motion keeps a static welcome and remembers confirmation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(dashboardPath);
  const { stage, cards, heading, confirm } = dashboardElements(page);
  await expect(stage).toHaveAttribute("data-welcome-phase", "floating");
  await expect(heading).toBeVisible();
  await expect(confirm).toBeFocused();
  const beamSamples = await confirm.locator('[data-slot="border-beam"] > div').evaluate(async element => {
    const samples: string[] = [];
    for (let index = 0; index < 4; index++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      samples.push(getComputedStyle(element).offsetDistance);
    }
    return samples;
  });
  expect(new Set(beamSamples).size).toBe(1);
  // Inspect several rendering frames: reduced motion must never start the spatial floating loop.
  const transforms = await cards.evaluateAll(async elements => {
    const samples: string[][] = [];
    for (let frame = 0; frame < 4; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      samples.push(elements.map(element => getComputedStyle(element).transform));
    }
    return samples;
  });
  expect(transforms.every(frame => frame.length === 12 && frame.every(transform => transform === "none"))).toBe(true);
  await expectStaticEffects(cards);
  await moveOverEffect(page, cards.first());
  await expectStaticEffects(cards);
  await confirm.press("Enter");
  await expectSettled(page);
  const cometCard = cards.nth(6);
  await cometCard.scrollIntoViewIfNeeded();
  await moveOverEffect(page, cometCard);
  await expectStaticEffects(cards);
  await page.reload();
  await expectSettled(page);
  await expectNoOverflow(page);
});

for (const theme of ['light', 'dark']) {
  test(`empty accounts see examples only during welcome and inherit the ${theme} theme`, async ({ page }, info) => {
    await page.addInitScript(theme => localStorage.setItem('admincn-ui-theme', theme), theme);
    await page.route('**/api/dashboard/summary', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(dashboardFixture(0)),
    }));
    await page.goto(dashboardPath);
    const { stage, cards, confirm } = dashboardElements(page);
    await expectFloating(page, 8);
    await expect(cards.nth(3).getByText('3', { exact: true })).toBeVisible();
    await expect(cards.nth(7).getByText('91.3%', { exact: true })).toBeVisible();
    await expect(page.getByText('A LITTLE SPACE FOR BIG IDEAS', { exact: true })).toHaveCount(0);
    await expect(page.getByText('确认后，卡片将回到各自的位置', { exact: true })).toHaveCount(0);
    expect(await stage.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await stage.evaluate(element => element.classList.contains('dark'))).toBe(false);
    await page.screenshot({ path: info.outputPath(`welcome-empty-${theme}.png`) });
    // Changing the app theme token must change the original button-54 instead of leaving its fixed blue.
    await page.evaluate(() => document.documentElement.style.setProperty('--primary', 'rgb(140, 50, 200)'));
    await expect(confirm).toHaveCSS('background-color', 'rgb(140, 50, 200)');
    const original = await cards.nth(3).locator('[data-slot="card"]').elementHandle();
    await confirm.click();
    await expectSettled(page);
    expect(await cards.nth(3).locator('[data-slot="card"]').evaluate((element, original) => element === original, original)).toBe(true);
    await original?.dispose();
    await expect(cards.nth(3).getByText('0', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
    await expect(page.getByText('课程设计项目', { exact: true })).toHaveCount(0);
    await expect(page.getByText('91.3%', { exact: true })).toHaveCount(0);
    await expectNoOverflow(page);
  });
}

test('welcome allows actual header theme changes and sidebar navigation without completing the first visit', async ({ page }) => {
  await page.goto(dashboardPath);
  const { confirm } = dashboardElements(page);
  await expectFloating(page, 8);
  const originalColor = await confirm.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.getByRole('button', { name: '主题色板', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Classic Indigo', exact: true }).click();
  await expect.poll(() => confirm.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(originalColor);
  await expectFloating(page, 8);
  await page.getByRole('button', { name: '切换到浅色', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expectFloating(page, 8);
  await page.locator('[data-slot="sidebar"]').getByRole('link', { name: '项目', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect(await page.evaluate(key => localStorage.getItem(key), dashboardWelcomeKey('welcome-owner'))).toBeNull();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.goto(dashboardPath);
  await expectFloating(page, 8);
});
