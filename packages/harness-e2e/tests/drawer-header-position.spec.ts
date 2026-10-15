// Guards the fixed workspace header against body-scrollbar compensation from modal drawers.
import { expect, test } from "@playwright/test";
import { mockProjectApi, projectId } from "./fixtures/project-workspace";

test("opening a project drawer keeps the top bar in place", async ({ page }) => {
  await mockProjectApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);

  const header = page.locator('[data-slot="sidebar-inset"] > header');
  await expect(header).toBeVisible();
  const before = await header.boundingBox();

  await header.getByRole("button", { name: "项目设置", exact: true }).click();
  await expect(page.getByTestId("project-workspace-drawer")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-scroll-locked");
  const after = await header.boundingBox();

  expect(after).not.toBeNull();
  expect(before).not.toBeNull();
  expect(after!.x).toBeCloseTo(before!.x, 1);
  expect(after!.width).toBeCloseTo(before!.width, 1);
});
