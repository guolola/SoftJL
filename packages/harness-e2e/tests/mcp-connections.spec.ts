// Verifies the reused connection page, project-scoped tokens and OAuth consent in real browsers.
import { expect, test } from '@playwright/test';
import { mockProjectApi } from './fixtures/project-workspace';

for (const width of [375, 1440]) {
  test(`project connection and explicit consent fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('uml-lab-locale-preference', 'zh-CN'));
    await mockProjectApi(page);
    const selectionRequests: unknown[] = [];
    await page.route('**/api/mcp/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/mcp/connections/tokens') {
        selectionRequests.push(route.request().postDataJSON());
        return route.fulfill({ json: { token: 'test-only-once-visible-token' } });
      }
      if (path === '/api/mcp/connections') return route.fulfill({ json: {
        enabled: true, serverUrl: 'http://localhost:3000/api/mcp', csrf: 'browser-test-csrf',
        projects: [{ id: 'selected-project', name: '图书管理系统' }, { id: 'another-project', name: '其他项目' }], connections: [],
      } });
      return route.fulfill({ json: { clientId: 'example-client', clientName: '测试编程助手' } });
    });
    await page.goto('/projects/connections?projectId=selected-project');
    await expect(page.getByRole('link', { name: '查看 MCP 文档' })).toHaveAttribute('href', 'https://jianglisoftware.com/tutorial');
    await page.getByRole('button', { name: '查看 DeepSeek Harness 接入指南' }).click();
    const dialog = page.getByRole('dialog', { name: '连接 DeepSeek Harness' });
    await expect(dialog.getByRole('checkbox', { name: '图书管理系统' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: '其他项目' })).not.toBeChecked();
    await dialog.getByLabel('连接名称').fill('我的客户端');
    await dialog.getByRole('button', { name: '创建 30 天个人令牌' }).click();
    await expect(dialog.getByLabel('新令牌（仅展示一次）')).toHaveValue('test-only-once-visible-token');
    expect(selectionRequests).toEqual([{ name: '我的客户端', projectScope: 'selected', projectIds: ['selected-project'] }]);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-only-once-visible-token');
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await dialog.screenshot({ path: test.info().outputPath('mcp-project-connection.png') });
    await dialog.getByRole('button', { name: '已保存，关闭展示' }).click();
    await expect(dialog.getByLabel('新令牌（仅展示一次）')).toHaveCount(0);

    await page.goto('/account/connections?interaction=test-interaction');
    await expect(page.getByRole('heading', { name: '授权给 测试编程助手' })).toBeVisible();
    await expect(page.getByRole('button', { name: '确认授权' })).toBeDisabled();
    await page.getByRole('checkbox', { name: '图书管理系统' }).check();
    await expect(page.getByRole('button', { name: '确认授权' })).toBeEnabled();
    await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('mcp-consent.png') });
  });
}
