// Verifies dashboard summary data, task tabs, filtering, and pagination.
import { expect, test } from "@playwright/test";
import { dashboardFixture } from "../../../apps/web/src/features/dashboard/testing/dashboard-fixture";

for (const width of [390, 1440]) {
  for (const theme of ["light"]) {
    test(`dashboard filters and task tabs at ${width}px`, async ({ page }) => {
      const summary = dashboardFixture();
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(({ theme }) => {
        localStorage.setItem("admincn-ui-theme", theme);
        localStorage.setItem("uml-lab-locale-preference", "zh-CN");
      }, { theme });
      await page.route("**/api/**", async route => {
        const pathname = new URL(route.request().url()).pathname;
        let body: unknown = {};
        if (pathname === "/api/auth/me" || pathname === "/api/account/profile") {
          body = { user: { id: "owner", username: "dashboard", displayName: "项目负责人", status: "active", mfaEnabled: false,
            avatarUrl: null, systemRoles: [], createdAt: summary.generatedAt, updatedAt: summary.generatedAt, lastLoginAt: summary.generatedAt },
            session: { id: "session-dashboard", userId: "owner", createdAt: summary.generatedAt, expiresAt: "2027-10-10T00:00:00Z", lastSeenAt: summary.generatedAt, ipAddress: null, userAgent: null },
            mfa: { enabled: false, enforcement: "totp" },
            generationUsage: { usedToday: 0, limit: null, remaining: null, windowSeconds: 86400, limited: false, scope: "user" } };
        } else if (pathname === "/api/dashboard/summary") body = summary;
        else if (pathname === "/api/projects") body = { projects: [] };
        else if (pathname === "/api/account/onboarding") body = { emptyWorkspace: "completed", firstProject: "completed", firstProjectId: "p-0" };
        else if (pathname === "/api/inbox") body = { messages: [], unreadCount: 0 };
        else if (pathname === "/api/system-notices") body = { generatedAt: summary.generatedAt, notices: [], unreadCount: 0 };
        else if (pathname === "/api/provider-configs") body = { generatedAt: summary.generatedAt, providerConfigs: [] };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.goto("/dashboard");
      await expect(page.getByTestId('welcome-stage')).toHaveAttribute('data-welcome-phase', 'floating');
      await page.getByRole('button', { name: '确认，进入工作台', exact: true }).click();
      await expect(page.getByTestId('welcome-stage')).toHaveAttribute('data-welcome-phase', 'settled');
      const grid = page.getByTestId("dashboard-06-grid");
      await expect(grid).toBeVisible();
      const projectTable = page.getByRole("table", { name: "项目列表" });
      await expect(projectTable.getByRole("columnheader", { name: "进度" })).toBeVisible();
      await expect(projectTable.getByRole("columnheader", { name: "生成成功率" })).toHaveCount(0);
      await expect(projectTable.getByRole("progressbar", { name: "进度" }).first()).toHaveAttribute("aria-valuenow", "75");
      await expect(projectTable.getByText("15/20", { exact: true }).first()).toBeVisible();
      const performance = grid.locator('[data-slot="card"]').filter({ has: page.getByText("协作与任务活动", { exact: true }) });
      await performance.getByRole("tab", { name: "月度任务" }).click();
      await expect(performance.getByRole("tab", { name: "月度任务" })).toHaveAttribute("aria-selected", "true");
      await performance.getByRole("tab", { name: "每日任务" }).click();
      await expect(performance.getByRole("tab", { name: "每日任务" })).toHaveAttribute("aria-selected", "true");
      const duration = grid.locator('[data-slot="card"]').filter({ has: page.getByRole("combobox", { name: "耗时统计维度" }) });
      await expect(duration.getByText("平均生成耗时", { exact: true })).toBeVisible();
      await expect(duration.getByText("66.7%", { exact: true })).toHaveCount(0);
      await expect(page.getByText("与上月持平", { exact: true })).toBeVisible();
      await duration.getByRole("combobox", { name: "产物分类" }).click();
      await page.getByRole("option", { name: "说明书／报告" }).click();
      await expect(duration.getByText("软件设计说明书", { exact: true })).toBeVisible();
      await duration.getByRole("combobox", { name: "产物分类" }).click();
      await page.getByRole("option", { name: "全部产物", exact: true }).click();
      await duration.getByRole("combobox", { name: "耗时统计维度" }).click();
      await page.getByRole("option", { name: "按具体产物" }).click();
      await duration.getByRole("button", { name: "耗时下一页" }).click();
      await duration.getByRole("textbox", { name: "搜索产物名称或类型" }).fill("需求说明书 0");
      await expect(duration.getByRole("button", { name: "需求说明书 0.docx" })).toBeVisible();
      await expect(duration.getByRole("button", { name: "耗时下一页" })).toHaveCount(0);
      await duration.getByRole("combobox", { name: "耗时统计项目" }).click();
      await page.getByRole("option", { name: "项目 1", exact: true }).click();
      await expect(duration.getByText("暂无匹配产物或有效耗时记录")).toBeVisible();
    });
  }
}
