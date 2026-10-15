// Exercises project navigation and traceability with fixed project data.
import { expect, test } from "@playwright/test";
import { projectId, mockProjectApi } from "./fixtures/project-workspace";

test("project sidebar aligns scoped models, database fields, SVG focus, and design traceability", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: Array<{ url: string; failure: string | null }> = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText ?? null,
    });
  });
  const unhandledRequests = await mockProjectApi(page);

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/projects/${projectId}`);
  const sidebar = page.getByLabel("项目导航");
  await expect(sidebar).toBeVisible();

  await sidebar.getByRole("button", { name: "展开 需求" }).click();
  await expect(sidebar.getByRole("button", { name: "用例模型", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /需求分析模型/u })).toHaveCount(0);

  await sidebar.getByRole("button", { name: "展开 设计" }).click();
  await expect(sidebar.getByRole("button", { name: "展开 用例实现设计（5）" })).toBeVisible();
  await sidebar.getByRole("button", { name: "展开 用例实现设计（5）" }).click();
  for (const label of ["微信授权登录", "查询座位", "预约座位", "查看预约记录", "签到确认"]) {
    await expect(sidebar.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  await expect(sidebar.getByRole("button", { name: "查看预约详情", exact: true })).toHaveCount(0);
  await expect(
    sidebar.getByRole("button", { name: "自动处理超时预约", exact: true }),
  ).toHaveCount(0);

  await sidebar.getByRole("button", { name: "展开 设计类图" }).click();
  await sidebar.getByRole("button", { name: "跟踪矩阵" }).click();
  await expect(page.getByRole("heading", { name: "跟踪矩阵 · 设计类图" })).toBeVisible();
  const serviceRow = page.getByRole("row").filter({ hasText: "SeatReservationService" });
  await expect(serviceRow).toContainText("发送预约请求");
  await expect(serviceRow).toContainText("预约座位");

  await sidebar.getByRole("button", { name: "展开 数据库设计" }).click();
  await sidebar.getByRole("button", { name: "展开 元素" }).last().click();
  await sidebar.getByRole("button", { name: "展开 表" }).click();
  await expect(sidebar.getByRole("button", { name: "user", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "user_id", exact: true })).toHaveCount(0);
  await sidebar.getByRole("button", { name: "展开 user" }).click();
  await expect(sidebar.getByRole("button", { name: "user_id", exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "user", exact: true }).click();
  await expect(page.getByText("焦点元素")).toBeVisible();
  await expect(page.locator("svg text.pum-highlight").filter({ hasText: "user" })).toBeVisible();

  expect(unhandledRequests).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
