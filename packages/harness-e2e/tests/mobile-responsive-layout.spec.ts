// Verifies that the community entry, account, and project workflows do not create page-level horizontal overflow.
import { expect, test, type Page } from "@playwright/test";
import { dashboardFixture } from "../../../apps/web/src/features/dashboard/testing/dashboard-fixture";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";

const widths = [360, 375, 768, 1440] as const;

test("project creation draws workflow connections on first open without resizing", async ({ page }) => {
  await mockProjectApi(page);
  await page.route("**/api/projects", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ projects: [] }),
  }));
  await page.goto("/projects");
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("button", { name: "新建项目", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "创建项目", exact: true });
    await expect(dialog).toBeVisible();
    const beams = dialog.locator('[data-project-mode-illustration="beam"] [data-workflow-connection] svg > path:first-child');
    await expect(beams).toHaveCount(8);
    // No resize follows opening: entry transforms alone must trigger the first measurement.
    await expect.poll(() => beams.evaluateAll(paths => paths.every(path => !!path.getAttribute("d")))).toBe(true);
    await expectNoPageOverflow(page, `project creation at ${width}px`);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("project cards expand without page shifts and keep overlays above the header", async ({ page }, info) => {
  await mockProjectApi(page);
  await page.route("**/api/projects", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      projects: Array.from({ length: 8 }, (_, index) => ({
        id: `compact-project-${index}`,
        projectMode: "professional",
        name: `布局验收项目 ${index + 1}`,
        status: "active",
        backgroundKey: "booking",
        ownerUserId: "user-1",
        ownerAvatarUrl: "/avatars/momonga-tail-wag.gif",
        updatedAt: "2026-09-22T02:00:00.000Z",
        memberCount: 1,
        memberPreviews: [],
      })),
    }),
  }));
  await page.setViewportSize({ width: 1920, height: 800 });
  await page.goto("/projects");
  const cards = page.getByTestId("projects-card-grid").getByRole("button");
  await expect(cards).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
  // Full-page capture can temporarily relayout Chromium. Finish it before measuring
  // the baseline so every sampled frame belongs to the actual preview interaction.
  await page.screenshot({ path: info.outputPath("project-cards-desktop.png"), fullPage: true });
  const initialGrid = (await page.getByTestId("projects-card-grid").boundingBox())!;
  expect((await cards.nth(3).boundingBox())!.y).toBe((await cards.nth(0).boundingBox())!.y);
  const initialScrollY = await page.evaluate(() => window.scrollY);
  // Sample every frame: a final-position check alone misses scrollbar jumps during the morph.
  await page.evaluate(() => {
    const state = {
      running: true,
      frames: [] as { x: number; width: number; scrollY: number }[],
      entryFrames: [] as { x: number; y: number; width: number; height: number; textHeight: number }[],
    };
    (window as any).__projectLayoutCheck = state;
    const sample = () => {
      if (!state.running) return;
      const box = document.querySelector('[data-testid="projects-card-grid"]')!.getBoundingClientRect();
      state.frames.push({ x: box.x, width: box.width, scrollY });
      const modal = document.querySelector<HTMLElement>('[role="dialog"]');
      const entry = modal?.querySelector<HTMLElement>('a[href]');
      if (modal && entry) {
        const modalBox = modal.getBoundingClientRect();
        // Once the surface reaches its natural size, its child must not continue drifting or scaling.
        if (Math.abs(modalBox.width - modal.offsetWidth) < 0.5 && Math.abs(modalBox.height - modal.offsetHeight) < 0.5 && Number(getComputedStyle(entry).opacity) >= 0.99) {
          const bounds = entry.getBoundingClientRect();
          // The shared button now starts with an aria-hidden reveal layer; measure its visible label.
          const label = entry.querySelector<HTMLElement>('span:not([aria-hidden])')!;
          state.entryFrames.push({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, textHeight: label.getBoundingClientRect().height });
        }
      }
      requestAnimationFrame(sample);
    };
    sample();
  });
  const previewTrigger = page.getByRole("button", { name: "查看项目 布局验收项目 1", exact: true });
  await previewTrigger.click();
  const preview = page.getByRole("dialog", { name: "布局验收项目 1", exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("link", { name: "进入项目 布局验收项目 1" })).toBeVisible();
  await preview.getByLabel(/^成员头像 /).first().hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await preview.getByRole("link").hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(previewTrigger).toBeFocused();
  const frames = await page.evaluate(() => {
    const state = (window as any).__projectLayoutCheck;
    state.running = false;
    return state as {
      frames: { x: number; width: number; scrollY: number }[];
      entryFrames: { x: number; y: number; width: number; height: number; textHeight: number }[];
    };
  });
  await info.attach("project-layout-samples", {
    contentType: "application/json",
    body: JSON.stringify({ initialGrid, initialScrollY, ...frames }),
  });
  for (const frame of frames.frames) {
    expect(Math.abs(frame.x - initialGrid.x)).toBeLessThan(1);
    expect(Math.abs(frame.width - initialGrid.width)).toBeLessThan(1);
    expect(frame.scrollY).toBe(initialScrollY);
  }
  expect(frames.entryFrames.length).toBeGreaterThan(0);
  const settledEntry = frames.entryFrames.at(-1)!;
  for (const frame of frames.entryFrames) {
    expect(Math.abs(frame.x - settledEntry.x)).toBeLessThan(1);
    expect(Math.abs(frame.y - settledEntry.y)).toBeLessThan(1);
    expect(frame.width).toBeCloseTo(104, 0);
    expect(frame.height).toBeCloseTo(44, 0);
    expect(frame.textHeight).toBeCloseTo(20, 0);
  }
  for (const width of [1920, 1440, 1024]) {
    await page.setViewportSize({ width, height: 1080 });
    // Desktop fills the available width with compact cards.
    await expect.poll(async () => (await cards.first().boundingBox())!.width).toBeLessThan(384);
    await expectNoPageOverflow(page, `compact project cards at ${width}px`);
  }
  await cards.last().scrollIntoViewIfNeeded();
  const scrolledPosition = await page.evaluate(() => window.scrollY);
  expect(scrolledPosition).toBeGreaterThan(0);
  await cards.last().click();
  const lastPreview = page.getByRole("dialog", { name: "布局验收项目 8", exact: true });
  await expect(lastPreview.getByRole("link")).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolledPosition);
  await page.keyboard.press("Escape");
  await expect(lastPreview).toBeHidden();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolledPosition);
  await page.setViewportSize({ width: 360, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await previewTrigger.click();
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("link")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(preview).toBeHidden();
  await previewTrigger.click();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
});

test("template page scroll keeps the workspace header visible", async ({ page }) => {
  await mockProjectApi(page);
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "user-1", username: "layout", displayName: "Layout Reviewer", status: "active", mfaEnabled: false,
          avatarUrl: null, systemRoles: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastLoginAt: null },
        session: { id: "session-layout", userId: "user-1", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), lastSeenAt: new Date().toISOString(), ipAddress: "127.0.0.1", userAgent: "Playwright" },
        mfa: { enabled: false, enforcement: "totp" },
        generationUsage: { usedToday: 0, limit: null, remaining: null, windowSeconds: 86400, limited: false, scope: "user" },
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
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect.poll(() => header.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(0);

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator("#workspace-active-panel")).toBeVisible();
  await expect(header).toBeVisible();
  await expect(page.locator('[data-slot="sidebar-inset"] > main > [data-slot="scroll-area"]')).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/projects");
  await expect(page.getByTestId("projects-index-shell")).toBeVisible();
  await expect(page.locator('[data-slot="sidebar-inset"] [data-slot="scroll-area-scrollbar"]')).toHaveCount(0);
  const sidebarRange = await page.locator('[data-slot="sidebar-content"]').evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(sidebarRange).toBeLessThanOrEqual(0);
  // The current empty state contains the product walkthrough and scrolls with the page.
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(() => header.evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
  await expectNoPageOverflow(page, "empty projects");
});

async function expectNoPageOverflow(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(
    // Stable scrollbar gutters may make scrollWidth smaller than clientWidth.
    // Only content extending beyond the viewport is a horizontal overflow.
    () => page.evaluate(() => Math.max(0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth)),
    { message: `${label} should not overflow the page horizontally` },
  ).toBe(0);
}

async function checkViewportMatrix(page: Page, label: string) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await expectNoPageOverflow(page, `${label} at ${width}px`);
  }
}

test("community entry, dashboard, projects, and MFA fit the mobile viewport", async ({ page }, info) => {
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
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "项目首页", exact: true })).toBeVisible();
  await checkViewportMatrix(page, "community entry");
  await page.screenshot({ path: info.outputPath("community-entry.png"), fullPage: true });

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
  await page.evaluate(() => { document.documentElement.classList.remove("dark"); document.documentElement.classList.add("light"); });

  await page.goto("/projects");
  const filters = page.getByTestId("projects-filter-panel");
  await expect(filters).toBeVisible();
  await page.setViewportSize({ width: 360, height: 844 });
  const scopeButtons = filters.getByRole("group", { name: "项目范围" }).getByRole("button");
  await expect(scopeButtons).toHaveCount(4);

  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mfa: {
          required: true,
          method: "totp",
          challengeId: "mobile-mfa-current",
          expiresAt: "2026-09-22T12:00:00.000Z",
        },
      }),
    });
  });
  await page.goto("/login");
  await page.getByLabel("用户名").fill("mobile");
  await page.locator("#auth-password").fill("not-a-real-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.locator('[data-slot="input-otp-group"]')).toBeVisible();
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
    testGenerationResult: { testCases: [{
      id: "TC-1",
      title: "预约座位成功",
      description: "验证预约主流程",
      scenarioType: "normal",
      priority: "P1",
      preconditions: [],
      steps: [{ order: 1, action: "提交有效座位预约", expectedResult: "预约成功" }],
      expectedResults: [],
      relatedRequirementRuleIds: ["r1"],
    }], coverageRelations: [] },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
  const navigation = page.getByRole("navigation", { name: "项目导航" });

  await expect(page.locator("#requirement-text")).toBeVisible();
  await page.setViewportSize({ width: 360, height: 844 });
  const requirementToolbar = page.getByTestId("requirements-input-toolbar");
  await expect(requirementToolbar).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "需求模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "需求模型", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "展开 需求模型" }).click();
  await navigation.getByRole("button", { name: "用例模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "用例模型", exact: true, level: 1 })).toBeVisible();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    const notice = page.getByRole("dialog", { name: "编辑模型信息" });
    await expect(notice).toBeVisible();
    const bounds = await notice.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await expectNoPageOverflow(page, `model notice at ${width}px`);
    await notice.getByRole("button", { name: "取消", exact: true }).click();
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "设计模型", exact: true }).click();
  await expect(page.getByRole("heading", { name: "设计模型", exact: true })).toBeVisible();

  // Implementation now belongs to the external Coding Agent rather than a workspace code page.
  await expect(navigation.getByRole("button", { name: "代码", exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigation.getByRole("button", { name: "测试", exact: true }).click();
  await expect(page.getByRole("heading", { name: "测试", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 844 });
  const scenario = page.getByLabel("按测试场景筛选");
  const pageSize = page.getByLabel("每页条数");
  await expect(scenario).toBeVisible();
  await expect(pageSize).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "账号", exact: true }).click();
  await page.getByRole("menuitem", { name: "账号", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 360, height: 844 });
  await expect(dialog.getByRole("tablist", { name: "设置" })).toBeVisible();
  await expect(dialog.getByRole("tablist", { name: "设置", exact: true }).getByRole("tab")).toHaveCount(8);
  await dialog.getByRole("tab", { name: "工作台偏好", exact: true }).click();
  await expect(dialog.getByRole("switch", { name: "完成提示音", exact: true })).toBeVisible();
  await expectNoPageOverflow(page, "account settings at 360px");
  await page.screenshot({ path: info.outputPath("workspace-account-360.png"), fullPage: true });
});
