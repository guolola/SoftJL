// Verifies independent docs scrolling, responsive navigation, search, and article deep links.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockProjectApi } from "./fixtures/project-workspace";

function viewport(area: Locator) {
  return area.locator(':scope > [data-slot="scroll-area-viewport"]');
}

async function wheelInside(page: Page, region: Locator, amount: number) {
  const bounds = await region.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + Math.min(bounds!.height / 2, 240));
  await page.mouse.wheel(0, amount);
}

for (const width of [1440, 1024]) {
  test(`docs columns stay fixed at reading boundaries after reload (${width}px)`, async ({ page }) => {
    await mockProjectApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tutorial?article=project-basics");
    const title = page.getByRole("article").getByRole("heading", { level: 1 });
    const readingViewport = viewport(page.getByTestId("docs-content-scroll-area"));
    const directory = page.locator("#product-docs-directory");
    const columns = width >= 1040 ? [directory, page.getByRole("complementary", { name: "本页大纲" })] : [directory];
    await expect(title).toHaveText("创建与进入项目");
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => readingViewport.evaluate((node) => node.scrollTop)).toBe(0);
    const initialTops = await Promise.all(columns.map(async (column) => (await column.boundingBox())!.y));
    const largestShift = async () => Math.max(...await Promise.all(columns.map(async (column, index) => Math.abs((await column.boundingBox())!.y - initialTops[index]))));

    // Wheel beyond both edges to catch sticky constraints and scroll chaining, not just mid-article positioning.
    await wheelInside(page, readingViewport, -100000);
    await expect.poll(() => readingViewport.evaluate((node) => node.scrollTop)).toBe(0);
    await expect.poll(largestShift).toBeLessThanOrEqual(1);
    await wheelInside(page, readingViewport, 100000);
    await expect.poll(() => readingViewport.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(1);
    await wheelInside(page, readingViewport, 100000);
    await expect.poll(largestShift).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => scrollY)).toBe(0);

    await page.reload();
    await expect(title).toHaveText("创建与进入项目");
    await expect.poll(() => readingViewport.evaluate((node) => node.scrollTop)).toBe(0);
    await expect.poll(largestShift).toBeLessThanOrEqual(1);
    await wheelInside(page, readingViewport, 100000);
    await expect.poll(() => readingViewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await directory.getByRole("button", { name: "快速开始", exact: true }).click();
    await expect(title).toHaveText("快速开始");
    await expect.poll(() => readingViewport.evaluate((node) => node.scrollTop)).toBe(0);
    await expect.poll(largestShift).toBeLessThanOrEqual(1);
  });
}

for (const width of [1920, 1440, 1024, 390]) {
  for (const locale of ["zh-CN", "en"]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test.describe(`${width} ${locale} ${colorScheme}`, () => {
        test.use({ viewport: { width, height: 900 }, locale, colorScheme });
        test("docs keep independent reading and directory scroll regions", async ({ page }, info) => {
          await mockProjectApi(page);
          await page.route("**/*.mp4", (route) => route.abort());
          await page.addInitScript(({ locale }) => {
            localStorage.setItem("uml-lab-locale-preference", locale);
          }, { locale });
          await page.goto("/tutorial");
          const article = page.getByRole("article");
          const title = article.getByRole("heading", { level: 1 });
          const reading = page.getByTestId("product-docs-page");
          const contentViewport = viewport(page.getByTestId("docs-content-scroll-area"));
          const directory = page.locator("#product-docs-directory");
          const directoryViewport = viewport(page.getByTestId("docs-directory-scroll-area"));
          const header = page.getByTestId("docs-header");
          const directoryToggle = page.locator('[aria-controls="product-docs-directory"]');
          const outline = page.getByTestId("docs-outline-scroll-area");
          await expect(title).toBeVisible();
          await expect(header).toBeVisible();
          await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
          await page.evaluate(() => document.fonts.ready);
          await expect(page.locator("html")).toHaveClass(new RegExp(colorScheme));
          const headerY = (await header.boundingBox())!.y;
          const readingWidth = (await reading.boundingBox())!.width;
          const compact = readingWidth < 720;
          const hasOutline = readingWidth >= 1040;
          expect(await page.locator("h1").count()).toBe(1);
          expect((await article.boundingBox())!.width).toBeLessThanOrEqual(800);
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

          if (compact) {
            await expect(directory).toBeHidden();
            await directoryToggle.click();
          }
          await expect(directory).toBeVisible();
          // Browsing topics uses the directory's own viewport and leaves article position unchanged.
          const originalArticleScroll = await contentViewport.evaluate((node) => node.scrollTop);
          await wheelInside(page, directoryViewport, 100000);
          await expect.poll(() => directoryViewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
          expect(await contentViewport.evaluate((node) => node.scrollTop)).toBe(originalArticleScroll);
          expect(await page.evaluate(() => scrollY)).toBe(0);
          await wheelInside(page, directoryViewport, -100000);
          await expect.poll(() => directoryViewport.evaluate((node) => node.scrollTop)).toBe(0);

          const categoryToggle = directory.locator("h3 button").first();
          await expect(categoryToggle).toHaveAttribute("aria-expanded", "true");
          await categoryToggle.click();
          await expect(categoryToggle).toHaveAttribute("aria-expanded", "false");
          await categoryToggle.click();
          await expect(categoryToggle).toHaveAttribute("aria-expanded", "true");

          const secondEntry = directory.locator('[data-slot="sidebar-menu-button"]').nth(1);
          const selectedName = await secondEntry.getAttribute("aria-label");
          await secondEntry.click();
          await expect(title).toHaveText(selectedName!);
          await expect(title).toBeFocused();
          await expect(title).toBeInViewport();
          await expect(page).toHaveURL(/\?article=/);
          if (compact) {
            await expect(directory).toBeHidden();
            await expect(directoryToggle).toHaveAttribute("aria-expanded", "false");
          }

          if (hasOutline) {
            await expect(outline).toBeVisible();
            await expect(outline.locator("a").first()).toHaveAttribute("aria-current", "true");
            const anchor = outline.locator("a").last();
            await anchor.click();
            const hash = await page.evaluate(() => decodeURIComponent(location.hash.slice(1)));
            const target = article.locator(`[id="${hash}"]`);
            await expect(target).toBeInViewport();
            await expect(anchor).toHaveAttribute("aria-current", "true");
            expect((await target.boundingBox())!.y).toBeGreaterThanOrEqual((await contentViewport.boundingBox())!.y);
          } else {
            await expect(outline).toBeHidden();
          }
          await contentViewport.evaluate((node) => { node.scrollTop = node.scrollHeight; });
          await expect(page.getByTestId("docs-footer")).toBeInViewport();
          await expect.poll(() => contentViewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
          if (hasOutline) await expect(outline.locator("a").last()).toHaveAttribute("aria-current", "true");
          expect(await page.evaluate(() => scrollY)).toBe(0);
          await expect.poll(async () => (await header.boundingBox())!.y).toBe(headerY);

          // Search stays reachable above the article, including with the mobile directory closed.
          const search = page.locator("#product-docs-search");
          await page.keyboard.press("Control+k");
          await expect(search).toBeFocused();
          await search.fill(locale === "en" ? "Coding Agent" : "编程助手");
          await expect(directory).toBeVisible();
          await expect(directory.locator("mark").first()).toBeInViewport();
          await expect(directory.getByRole("button", { name: /Coding Agent/ }).first()).toBeVisible();
          await header.getByRole("button", { name: locale === "en" ? "Clear search" : "清除搜索" }).click();
          await expect(search).toHaveValue("");
          await expect(search).toBeFocused();

          await contentViewport.evaluate((node) => { node.scrollTop = 0; });
          await page.screenshot({ path: info.outputPath("tutorial.png") });
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        });
      });
    }
  }
}

test("article links, next guide, reload, and browser history keep the selected guide", async ({ page }) => {
  await mockProjectApi(page);
  await page.goto("/tutorial?article=project-basics");
  const title = page.getByRole("article").getByRole("heading", { level: 1 });
  await expect(title).toContainText("项目");
  const initialTitle = await title.innerText();
  await page.reload();
  await expect(title).toHaveText(initialTitle);
  const nextGuide = page.getByRole("navigation", { name: "继续阅读" }).getByRole("button").last();
  await nextGuide.click();
  await expect(title).not.toHaveText(initialTitle);
  await expect(title).toBeFocused();
  await page.goBack();
  await expect(title).toHaveText(initialTitle);
  await expect(page).toHaveURL(/article=project-basics/);
});

test("article links and screenshot preview preserve guide navigation and keyboard focus", async ({ page }) => {
  await mockProjectApi(page);
  await page.goto("/tutorial?article=quick-start");
  const article = page.getByRole("article");
  await article.getByRole("link", { name: "创建与进入项目", exact: true }).click();
  await expect(page).toHaveURL(/article=project-basics/);
  await expect(article.getByRole("heading", { level: 1 })).toHaveText("创建与进入项目");
  const imageButton = article.getByRole("button", { name: /^放大图片/ }).first();
  await imageButton.click();
  const preview = page.getByRole("dialog");
  await expect(preview).toBeVisible();
  expect(await preview.getByRole("img").evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(1000);
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(imageButton).toBeFocused();
  await page.goBack();
  await expect(article.getByRole("heading", { level: 1 })).toHaveText("快速开始");
});

test("a direct Chinese heading link opens at the requested section", async ({ page }) => {
  await mockProjectApi(page);
  await page.goto("/tutorial?article=provider-configuration#操作步骤");
  const article = page.getByRole("article");
  await expect(article.getByRole("heading", { level: 1 })).toHaveText("配置模型供应商");
  await expect(article.locator('[id="操作步骤"]')).toBeInViewport();
  await expect(page.getByTestId("docs-outline-scroll-area").getByRole("link", { name: "操作步骤", exact: true })).toHaveAttribute("aria-current", "true");
  await page.reload();
  await expect(article.getByRole("heading", { level: 1 })).toHaveText("配置模型供应商");
  await expect(article.locator('[id="操作步骤"]')).toBeInViewport();
  await expect(page.getByTestId("docs-outline-scroll-area").getByRole("link", { name: "操作步骤", exact: true })).toHaveAttribute("aria-current", "true");
});


test("page actions copy, open and download the same complete Markdown", async ({ page, context }, info) => {
  await mockProjectApi(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tutorial?article=coding-agent");
  const actions = page.getByTestId("docs-article-actions");
  await expect(actions).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await actions.scrollIntoViewIfNeeded();
  const initialBounds = await actions.boundingBox();
  const copyButton = actions.getByRole("button", { name: "复制页面", exact: true });
  await copyButton.click();
  const copyToast = page.locator('[data-slot="floating-alert-item"]').filter({ hasText: "已复制页面 Markdown。" });
  await expect(copyToast).toBeVisible();
  await expect(copyButton).toBeEnabled();
  await expect(actions).not.toContainText("已复制");
  await expect(actions.getByRole("status")).toHaveCount(0);
  await expect.poll(() => actions.boundingBox()).toEqual(initialBounds);
  await page.screenshot({ path: info.outputPath("docs-copy-floating-alert.png") });
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  expect(copied).toContain("# Coding Agent 接入与授权");
  expect(copied).toContain("list_projects");
  expect(copied).toContain("get_implementation_context");
  expect(copied).toContain("get_artifact");
  expect(copied).toContain("check_context_updates");
  expect(copied).toContain("/help/images/docs-coding-agent");
  expect(copied).not.toContain("<!--");

  await actions.getByRole("button", { name: "更多页面操作" }).click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("menuitem", { name: /查看 Markdown/ }).click();
  const markdownPage = await popupPromise;
  await expect(markdownPage).toHaveURL(/\/tutorial\/coding-agent\.md\?lang=zh-CN$/);
  await expect(markdownPage.locator("body")).toContainText("get_implementation_context");
  expect((await markdownPage.locator("body").innerText()).trim()).toBe(copied.trim());
  await markdownPage.close();

  await actions.getByRole("button", { name: "更多页面操作" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载 Markdown", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("coding-agent.md");
  expect(await readFile((await download.path())!, "utf8")).toBe(copied);

  await actions.getByRole("button", { name: "更多页面操作" }).click();
  await page.getByRole("menuitem", { name: "复制页面链接", exact: true }).click();
  const linkToast = page.locator('[data-slot="floating-alert-item"]').filter({ hasText: "已复制页面链接。" });
  await expect(linkToast).toBeVisible();
  await expect(actions).not.toContainText("已复制");
  await expect.poll(() => actions.boundingBox()).toEqual(initialBounds);
  // Floating feedback dismisses itself without leaving text or moving the title actions.
  await page.mouse.move(0, 0);
  await expect(linkToast).toHaveCount(0, { timeout: 7000 });
  await expect.poll(() => actions.boundingBox()).toEqual(initialBounds);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  expect((await page.request.get("/tutorial/unknown.md")).status()).toBe(404);
});

test("directory selection and notes have no heavy left border", async ({ page }) => {
  await mockProjectApi(page);
  await page.goto("/tutorial?article=coding-agent");
  const selected = page.locator('#product-docs-directory [aria-current="page"]');
  await expect(selected).toBeVisible();
  expect(await selected.evaluate((node) => getComputedStyle(node).borderLeftWidth)).toBe("0px");
  const note = page.locator('[data-doc-callout="warning"]').first();
  await expect(note).toBeAttached();
  const borders = await note.evaluate((node) => {
    const style = getComputedStyle(node);
    return [style.borderLeftWidth, style.borderRightWidth, style.borderLeftColor, style.borderRightColor];
  });
  expect(borders[0]).toBe(borders[1]);
  expect(borders[2]).toBe(borders[3]);
});
