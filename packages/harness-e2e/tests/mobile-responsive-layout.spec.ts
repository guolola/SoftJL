// Verifies that the primary public, account, and project workflows do not create page-level horizontal overflow.
import { expect, test, type Page } from "@playwright/test";
import { dashboardFixture } from "../../../apps/web/src/features/dashboard/testing/dashboard-fixture";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";

const widths = [360, 375, 768, 1440] as const;

test("template page scroll keeps the workspace header visible", async ({ page }) => {
  await mockProjectApi(page);
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "user-1", email: "layout@example.test", displayName: "Layout Reviewer", status: "active", emailVerified: true, mfaEnabled: false },
        session: { id: "session-layout", userId: "user-1", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), lastSeenAt: new Date().toISOString(), ipAddress: "127.0.0.1", userAgent: "Playwright" },
      }),
    });
  });
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ projects: [] }) });
  });
  await page.setViewportSize({ width: 1440, height: 620 });

  await page.route("**/api/dashboard/summary", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboardFixture()) }));
  await page.goto("/dashboard");
  await expect(page.getByTestId('welcome-stage')).toHaveAttribute('data-welcome-phase', 'floating');
  await page.getByRole('button', { name: '确认，进入工作台', exact: true }).click();
  await expect(page.getByTestId('welcome-stage')).toHaveAttribute('data-welcome-phase', 'settled');
  await expect(page.getByTestId("dashboard-06-grid")).toBeVisible();
  const header = page.locator('[data-slot="sidebar-inset"] > header');
  await expect(header).toBeVisible();
  await expect(page.locator('[data-slot="sidebar-content"] [data-slot="scroll-area"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="sidebar-inset"] > main > [data-slot="scroll-area"]')).toHaveCount(0);
  await expectNoPageOverflow(page, "scrolling dashboard");
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect.poll(() => header.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(0);

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator("#workspace-active-panel")).toBeVisible();
  await expect(header).toBeVisible();
  await expect(page.locator('[data-slot="sidebar-inset"] > main > [data-slot="scroll-area"]')).toHaveCount(0);
  await expectNoPageOverflow(page, "project workspace");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/projects");
  await expect(page.getByTestId("projects-index-shell")).toBeVisible();
  await expect(page.locator('[data-slot="sidebar-inset"] [data-slot="scroll-area-scrollbar"]')).toHaveCount(0);
  const sidebarRange = await page.locator('[data-slot="sidebar-content"]').evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(sidebarRange).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
  await expectNoPageOverflow(page, "empty projects");
});

async function expectNoPageOverflow(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(
    () => page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
    { message: `${label} should not overflow the page horizontally` },
  ).toEqual(await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.clientWidth,
  })));
}

async function checkViewportMatrix(page: Page, label: string) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await expectNoPageOverflow(page, `${label} at ${width}px`);
  }
}

test("public home, dashboard, projects, and MFA fit the mobile viewport", async ({ page }, info) => {
  await mockProjectApi(page);
  await page.route("**/api/dashboard/summary", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboardFixture()) }));
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projects: [{
          id: projectId,
          name: "座位预约系统",
          description: "移动端布局验收项目",
          visibility: "private",
          status: "active",
          ownerUserId: "user-1",
          ownerDisplayName: "Model Nav Reviewer",
          updatedAt: "2026-09-22T02:00:00.000Z",
          memberCount: 1,
          memberPreviews: [],
        }],
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("项目概览", { exact: true })).toBeVisible();
  await checkViewportMatrix(page, "home");
  await page.screenshot({ path: info.outputPath("home-360.png"), fullPage: true });

  await page.goto("/dashboard");
  await expect(page.getByText("协作与任务活动", { exact: true })).toBeVisible();
  await expect(page.getByTestId("welcome-stage")).toHaveAttribute("data-welcome-phase", "floating");
  await page.getByRole("button", { name: "确认，进入工作台", exact: true }).click();
  await expect(page.getByTestId("welcome-stage")).toHaveAttribute("data-welcome-phase", "settled");
  await checkViewportMatrix(page, "dashboard");
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const activityCard = page.getByText("协作与任务活动", { exact: true }).locator("xpath=ancestor::*[@data-slot='card'][1]");
    const card = await activityCard.boundingBox();
    const tabs = await activityCard.getByRole("tablist").boundingBox();
    const content = await activityCard.getByRole("tabpanel").boundingBox();
    expect(card && tabs && content).toBeTruthy();
    expect(tabs!.y).toBeLessThan(content!.y);
    expect(tabs!.x).toBeGreaterThanOrEqual(card!.x);
    expect(tabs!.x + tabs!.width).toBeLessThanOrEqual(card!.x + card!.width + 1);
    expect(content!.x + content!.width).toBeLessThanOrEqual(card!.x + card!.width + 1);
  }
  await page.evaluate(() => { document.documentElement.classList.remove("light"); document.documentElement.classList.add("dark"); });
  await checkViewportMatrix(page, "dark dashboard");
  await page.evaluate(() => { document.documentElement.classList.remove("dark"); document.documentElement.classList.add("light"); });

  await page.goto("/projects");
  const filters = page.getByTestId("projects-filter-panel");
  await expect(filters).toBeVisible();
  await checkViewportMatrix(page, "projects");
  await page.setViewportSize({ width: 360, height: 844 });
  const scopeButtons = filters.getByRole("group", { name: "项目范围" }).getByRole("button");
  await expect(scopeButtons).toHaveCount(4);
  const scopeBoxes = await scopeButtons.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().width));
  expect(Math.max(...scopeBoxes) - Math.min(...scopeBoxes)).toBeLessThan(1);

  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mfaChallenge: {
          challengeId: "mobile-mfa",
          expiresAt: "2026-09-22T12:00:00.000Z",
        },
      }),
    });
  });
  await page.goto("/login");
  await page.getByLabel("邮箱或用户名").fill("mobile@example.test");
  await page.locator("#auth-password").fill("not-a-real-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.locator('[data-slot="input-otp-group"]')).toBeVisible();
  await checkViewportMatrix(page, "MFA login");
  await page.setViewportSize({ width: 360, height: 844 });
  const mfaSlots = page.locator('[data-slot="input-otp-slot"]');
  await expect(mfaSlots).toHaveCount(6);
  // OTP slots animate their responsive size; measure after the 40px -> 36px transition settles.
  await expect.poll(async () => mfaSlots.evaluateAll((slots) =>
    Math.max(...slots.map((slot) => Math.abs(slot.getBoundingClientRect().width - 36))),
  )).toBeLessThan(1);
});

test("workspace stages, details, tests, and account dialog fit the responsive viewport matrix", async ({ page }, info) => {
  await mockProjectApi(page, {
    testCases: [{
      id: "TC-1",
      title: "预约座位成功",
      description: "验证预约主流程",
      scenarioType: "normal",
      preconditions: [],
      steps: [],
      expectedResults: [],
      relatedRequirementRuleIds: ["r1"],
    }],
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
  const navigation = page.getByRole("navigation", { name: "项目导航" });

  await expect(page.locator("#requirement-text")).toBeVisible();
  await checkViewportMatrix(page, "system requirements");
  await page.setViewportSize({ width: 360, height: 844 });
  const requirementToolbar = page.getByTestId("requirements-input-toolbar");
  await expect(requirementToolbar).toBeVisible();
  expect((await requirementToolbar.boundingBox())!.width).toBeLessThanOrEqual(360);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "需求模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "需求模型", exact: true })).toBeVisible();
  await checkViewportMatrix(page, "requirement models");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "展开 需求模型" }).click();
  await navigation.getByRole("button", { name: "用例模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "用例模型", exact: true, level: 1 })).toBeVisible();
  await checkViewportMatrix(page, "model detail");
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("button", { name: /提示（\d+）/ }).click();
    const notice = page.getByRole("dialog", { name: "模型提示" });
    await expect(notice).toBeVisible();
    const bounds = await notice.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await expectNoPageOverflow(page, `model notice at ${width}px`);
    await notice.getByRole("button", { name: "知道了" }).click();
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "设计模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "设计模型", exact: true })).toBeVisible();
  await checkViewportMatrix(page, "design models");

  // Implementation now belongs to the external Coding Agent rather than a workspace code page.
  await expect(navigation.getByRole("button", { name: "代码", exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "测试", exact: true }).click();
  await expect(page.getByRole("heading", { name: "测试", exact: true })).toBeVisible();
  await checkViewportMatrix(page, "tests");
  await page.setViewportSize({ width: 360, height: 844 });
  const scenario = page.getByLabel("按测试场景筛选");
  const pageSize = page.getByLabel("每页条数");
  await expect(scenario).toBeVisible();
  await expect(pageSize).toBeVisible();
  expect(Math.abs((await scenario.boundingBox())!.y - (await pageSize.boundingBox())!.y)).toBeLessThanOrEqual(2);
  await expectNoPageOverflow(page, "tests at 360px");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "账号", exact: true }).click();
  await page.getByRole("menuitem", { name: "账号", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await checkViewportMatrix(page, "account settings");
  await page.setViewportSize({ width: 360, height: 844 });
  await expect(dialog.getByRole("tablist", { name: "设置" })).toBeVisible();
  await expect(dialog.getByRole("tablist", { name: "设置", exact: true }).getByRole("tab")).toHaveCount(7);
  await expectNoPageOverflow(page, "account settings at 360px");
  await page.screenshot({ path: info.outputPath("workspace-account-360.png"), fullPage: true });
});
