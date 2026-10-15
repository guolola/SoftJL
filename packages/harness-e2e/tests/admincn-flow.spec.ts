// Checks template integration, responsive geometry and routed states with stable API fixtures.
import { expect, test } from '@playwright/test';
import { themePresets } from '../../../apps/web/src/shared/ui/theme-presets';
import { mockProjectApi, projectId } from './fixtures/project-workspace';

// Cover every viewport, locale and theme without repeating the complete route flow for their Cartesian product.
const scenarios = [
  {viewport:{width:1440,height:900},locale:'zh-CN',colorScheme:'light'},
  {viewport:{width:1920,height:1080},locale:'en',colorScheme:'dark'},
  {viewport:{width:768,height:1024},locale:'en',colorScheme:'light'},
  {viewport:{width:390,height:844},locale:'zh-CN',colorScheme:'dark'},
] as const;
for (const {viewport, locale, colorScheme} of scenarios) {
  test.describe(`${viewport.width} ${locale} ${colorScheme}`, () => {
    test.use({viewport, locale, colorScheme});
    test('AdminCN shell, controls, v2 auth and Flow homepage', async ({page}, info) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({locale}) => localStorage.setItem('uml-lab-locale-preference', locale), {locale});
      await mockProjectApi(page);
      await page.goto(`/projects/${projectId}`);
      await expect(page.locator('#requirement-text')).toBeVisible();
      await expect(page.getByTestId('platform-loading-screen')).toHaveCount(0);
      await expect(page.locator('html')).toHaveClass(new RegExp(colorScheme));
      const header = page.locator('[data-slot="sidebar-inset"] > header');
      await expect(header).toBeVisible();
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(await overflow()).toBeLessThanOrEqual(1);
      await expect(page.locator('#requirement-text')).toHaveAttribute('data-slot','textarea');
      const triggerBox = await page.getByRole('button',{name:'Toggle Sidebar'}).boundingBox();
      const actionsBox = await header.locator('.overflow-x-auto').boundingBox();
      const headerBox = (await header.boundingBox())!;
      expect(triggerBox!.y).toBeGreaterThanOrEqual(headerBox.y);
      expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(headerBox.y + headerBox.height);
      expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(actionsBox!.x);
      const assertSelectedNavigation = async () => {
        await expect(page.getByRole('navigation',{name:locale === 'en' ? 'Project navigation' : '项目导航'})
          .getByRole('button',{name:locale === 'en' ? 'System requirements' : '系统需求', exact:true})).toHaveAttribute('data-active','');
      };
      if (viewport.width >= 768) await assertSelectedNavigation();
      await page.screenshot({path:info.outputPath('workspace.png')});
      await page.getByRole('button',{name:'Toggle Sidebar'}).click();
      if(viewport.width >= 768) {
        await expect.poll(async () => (await page.locator('[data-slot="sidebar-container"]').boundingBox())?.width).toBe(48);
        await page.getByRole('button',{name:'Toggle Sidebar'}).click();
        await expect.poll(async () => (await page.locator('[data-slot="sidebar-container"]').boundingBox())?.width).toBe(256);
      } else {
        const sidebar = page.locator('[data-mobile="true"]');
        await expect(sidebar).toBeVisible();
        await assertSelectedNavigation();
        await page.screenshot({path:info.outputPath('mobile-sidebar.png')});
        await page.keyboard.press('Escape');
        await expect(sidebar).toHaveCount(0);
        await expect(page.getByRole('button',{name:'Toggle Sidebar'})).toBeFocused();
      }
      await page.goto('/login');
      await expect(page.getByTestId('auth-shell')).toHaveAttribute('data-auth-layout','admincn-v2');
      await expect(page.locator('input[data-slot="input"]').first()).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(1);
      await page.screenshot({path:info.outputPath('auth-v2.png')});
      await page.goto('/');
      await expect(page.getByTestId('flow-homepage')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const sections = await page.locator('main > section').evaluateAll(nodes => nodes.map(node => node.id));
      expect(sections).toEqual(['home','trusted-brands','features','benefits','testimonials','faq','cta']);
      expect(await overflow()).toBeLessThanOrEqual(1);
      await expect(page.locator('html')).toHaveAttribute('data-template','flow');
      await page.screenshot({path:info.outputPath('flow-hero.png')});
      await page.goto('/features');
      await expect(page.getByRole('heading',{name:/404/})).toBeVisible();
      await expect(page.locator('html')).not.toHaveAttribute('data-template','flow');
      await page.screenshot({path:info.outputPath('template-404.png')});
      expect(errors).toEqual([]);
    });
  });
}

test('all retired marketing addresses render the template 404',async({page})=>{
  for(const path of ['/features','/workflow','/cases','/pricing']) {
    await page.goto(path);
    await expect(page.getByRole('heading',{name:/404/})).toBeVisible();
    await expect(page.getByTestId('flow-homepage')).toHaveCount(0);
    // Next also emits a noindex tag for its 404 boundary; every robots directive must exclude indexing.
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).not.toHaveCount(0);
    expect(await robots.evaluateAll(nodes => nodes.every(node => /noindex/.test(node.getAttribute('content') ?? '')))).toBe(true);
  }
});

test('marketing and workspace headers share the selected palette without responsive overflow', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('admincn-ui-theme', 'light');
    localStorage.setItem('uml-lab-locale-preference', 'zh-CN');
  });
  await mockProjectApi(page);

  await page.goto('/');
  const paletteButton = page.getByRole('button', {name:'主题色板'});
  const modeButton = page.getByRole('button', {name:'切换明暗主题'});
  await expect(paletteButton).toBeVisible();
  expect(await paletteButton.evaluate((palette, mode) => Boolean(
    palette.compareDocumentPosition(mode as Node) & Node.DOCUMENT_POSITION_FOLLOWING
  ), await modeButton.elementHandle())).toBe(true);
  await paletteButton.click();
  await page.getByRole('menuitemradio', {name:'Caffeine'}).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('admincn-ui-theme-preset'))).toBe('caffeine');
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--primary')))
    .toBe(themePresets.caffeine.styles.light.primary);
  await expect.poll(() => page.getByTestId('flow-homepage').evaluate(element =>
    getComputedStyle(element).getPropertyValue('--primary').trim()
  )).toBe(themePresets.caffeine.styles.light.primary);

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator('#requirement-text')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--primary')))
    .toBe(themePresets.caffeine.styles.light.primary);
  await page.getByRole('button', {name:'主题色板'}).click();
  await page.getByRole('menuitemradio', {name:'Classic Indigo'}).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('admincn-ui-theme-preset')))
    .toBe('classic-indigo');

  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--primary')))
    .toBe(themePresets['classic-indigo'].styles.light.primary);
  await expect.poll(() => page.getByTestId('flow-homepage').evaluate(element =>
    getComputedStyle(element).getPropertyValue('--primary').trim()
  )).toBe(themePresets['classic-indigo'].styles.light.primary);

  for (const width of [375, 1024, 1440]) {
    await page.setViewportSize({width, height: 900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('button', {name:'主题色板'}).click();
    const menu = page.locator('[data-slot="dropdown-menu-content"]');
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
  }
});
