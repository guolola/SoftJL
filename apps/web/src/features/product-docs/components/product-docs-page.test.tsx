// Verifies the modular in-app product documentation center behavior.
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDocsPage as ProductDocsPageView } from "./product-docs-page";
import { SidebarProvider } from "../../../shared/ui/sidebar";
import { ThemeProvider } from "../../../shared/ui/theme-provider";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";

function ProductDocsPage(props: Parameters<typeof ProductDocsPageView>[0]) {
  return <AppI18nProvider><ThemeProvider><SidebarProvider><ProductDocsPageView {...props} /></SidebarProvider></ThemeProvider></AppI18nProvider>;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/tutorial");
});

afterEach(() => {
  window.innerWidth = 1440;
  vi.restoreAllMocks();
});
import {
  PRODUCT_DOC_ARTICLES,
  PRODUCT_DOC_CATEGORIES,
  getProductDocArticles,
  getProductDocCategories,
} from "../model/docs-content";

const PUBLIC_DIRECTORY = resolve(process.cwd(), "public");

describe("ProductDocsPage", () => {
  it("places the single search input in the header and supports the search shortcut", async () => {
    const user = userEvent.setup();
    render(<ProductDocsPage />);
    const header = screen.getByTestId("docs-header");
    const input = within(header).getByRole("textbox", { name: "搜索使用文档" });
    expect(screen.getAllByRole("textbox", { name: "搜索使用文档" })).toHaveLength(1);
    expect(within(header).getByRole("button", { name: "切换界面语言" })).toHaveTextContent("中文");
    expect(within(header).getByRole("button", { name: "切换到深色" })).toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    expect(input).toHaveFocus();
    await user.type(input, "AI 修复");
    expect(screen.getByRole("button", { name: "文档目录" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("搜索结果")).toBeInTheDocument();
  });

  it("keeps the maintenance notice and quick-start action within the article column", async () => {
    const user = userEvent.setup();
    render(<ProductDocsPage />);
    const column = screen.getByTestId("docs-article-column");
    expect(within(column).getByTestId("docs-footer")).toBeInTheDocument();
    expect(column).toHaveClass("max-w-[800px]");
    await user.click(screen.getByRole("button", { name: "创建与进入项目" }));
    await user.click(within(column).getByRole("button", { name: "回到快速开始" }));
    expect(within(column).getByRole("heading", { name: "快速开始" })).toHaveFocus();
  });

  it("uses shared scroll areas for the page and pinned navigation columns", () => {
    render(<ProductDocsPage />);

    expect(screen.getByTestId("product-docs-page")).not.toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("product-docs-page")).toHaveClass("h-dvh", "overflow-hidden");
    expect(document.getElementById("product-docs-directory")).toHaveClass("@[720px]/docs:sticky");
    expect(screen.getByRole("complementary", { name: "本页大纲" })).toHaveClass("@[1040px]/docs:sticky");
    for (const id of ["docs-content-scroll-area", "docs-directory-scroll-area", "docs-outline-scroll-area"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("data-slot", "scroll-area");
      expect(screen.getByTestId(id).querySelector('[data-slot="scroll-area-viewport"]')).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "快速开始" })).toHaveClass("scroll-mt-6");
  });

  it("shows the project-local quick start article by default", () => {
    render(<ProductDocsPage />);

    expect(screen.getByRole("heading", { name: "快速开始" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "普通用户完整操作路径" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("搜索使用文档")).toBeInTheDocument();
    const quickStartVideo = screen.getByLabelText("快速开始项目操作视频");
    expect(quickStartVideo).toBeInTheDocument();
    expect(quickStartVideo.querySelector("source")).toHaveAttribute(
      "src",
      "https://tuolola.oss-cn-chengdu.aliyuncs.com/video/%E9%A1%B9%E7%9B%AE%E6%BC%94%E7%A4%BA.mp4",
    );
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
    for (const category of PRODUCT_DOC_CATEGORIES) {
      expect(screen.getByRole("heading", { name: category.label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: /查看与编辑模型详情/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /模型选择指南/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /配置模型供应商/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /完成可行性分析/u }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /生成问题排查/u }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "模型配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "模型配置" })).not.toBeInTheDocument();
    expect(screen.queryByText("完整飞书文档整理中")).not.toBeInTheDocument();
  });

  it("opens a selected article at the beginning instead of aligning its inset title", () => {
    window.history.replaceState(null, "", "/tutorial?article=project-basics");
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.matches("article h1")) return new DOMRect(0, 140, 800, 36);
      if (this.matches('[data-testid="docs-content-scroll-area"] > [data-slot="scroll-area-viewport"]')) return new DOMRect(0, 64, 1440, 836);
      return originalBounds.call(this);
    });
    render(<ProductDocsPage />);

    expect(within(screen.getByRole("article")).getByRole("heading", { level: 1 })).toHaveTextContent("创建与进入项目");
    expect(screen.getByTestId("docs-content-scroll-area").querySelector('[data-slot="scroll-area-viewport"]')?.scrollTop).toBe(0);
  });

  it("resets the full article header when switching from a scrolled guide", async () => {
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.matches("article h1")) return new DOMRect(0, 140, 800, 36);
      if (this.matches('[data-testid="docs-content-scroll-area"] > [data-slot="scroll-area-viewport"]')) return new DOMRect(0, 64, 1440, 836);
      return originalBounds.call(this);
    });
    render(<ProductDocsPage />);
    const viewport = screen.getByTestId("docs-content-scroll-area").querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    viewport.scrollTop = 1600;
    await userEvent.click(screen.getByRole("button", { name: "创建与进入项目" }));

    expect(viewport.scrollTop).toBe(0);
    expect(within(screen.getByRole("article")).getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("switches articles from the documentation sidebar", async () => {
    const user = userEvent.setup();
    render(<ProductDocsPage />);

    const sidebar = screen.getByRole("complementary", { name: "使用文档目录" });
    await user.click(
      within(sidebar).getByRole("button", { name: /创建与进入项目/u }),
    );

    expect(
      screen.getByRole("heading", { name: "创建与进入项目" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "操作步骤", level: 2 })).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("article")).toBe("project-basics");
  });

  it("filters documentation by title, summary, tags, artifacts, and markdown content", async () => {
    render(<ProductDocsPage />);

    const searchInput = screen.getByLabelText("搜索使用文档");
    const sidebar = screen.getByRole("complementary", { name: "使用文档目录" });

    fireEvent.change(searchInput, { target: { value: "AI 修复" } });
    expect(screen.getByText("搜索结果")).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: /整理需求与确认规则/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "模型详情" } });
    expect(
      within(sidebar).getByRole("button", { name: /查看与编辑模型详情/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "追踪矩阵" } });
    expect(
      within(sidebar).getByRole("button", { name: /查看与编辑模型详情/u }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: /检查需求到设计的覆盖/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "PlantUML" } });
    expect(
      within(sidebar).getByRole("button", { name: /生成与查看需求模型/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "模型选择" } });
    expect(
      within(sidebar).getByRole("button", { name: /模型选择指南/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Provider" } });
    expect(
      within(sidebar).getByRole("button", { name: /配置模型供应商/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "说明书" } });
    expect(
      within(sidebar).getByRole("button", { name: /说明书生成与下载/u }),
    ).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "可行性" } });
    expect(
      within(sidebar).getByRole("button", { name: /完成可行性分析/u }),
    ).toBeInTheDocument();


  });

  it("shows an empty state when search has no matches", async () => {
    const user = userEvent.setup();
    render(<ProductDocsPage />);

    await user.type(screen.getByLabelText("搜索使用文档"), "完全不存在的关键词");

    expect(screen.getByText("没有找到匹配文档。", { exact: false })).toBeInTheDocument();
  });

  it("builds an H2 and H3 outline for the selected markdown article", () => {
    render(<ProductDocsPage />);

    expect(
      screen.getByRole("link", { name: "适用场景" }),
    ).toHaveAttribute("href", "#适用场景");
    expect(
      screen.getByRole("link", { name: "映射关系" }),
    ).toHaveAttribute("href", "#映射关系");
  });

  it("wraps long sidebar entries instead of truncating them", () => {
    render(<ProductDocsPage />);

    const sidebar = screen.getByRole("complementary", { name: "使用文档目录" });
    const longTitle = within(sidebar).getByText("查看与编辑模型详情");
    expect(longTitle).toHaveClass("break-words");
    expect(longTitle).not.toHaveClass("truncate");
    expect(longTitle).not.toHaveClass("line-clamp-2");
  });

  it("scrolls to the selected heading from the on-this-page outline", async () => {
    const user = userEvent.setup();
    render(<ProductDocsPage />);

    const targetHeading = screen.getByRole("heading", {
      name: "适用场景",
      level: 2,
    });
    const viewport = screen.getByTestId("docs-content-scroll-area").querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    const scrollTo = vi.fn();
    Object.defineProperty(viewport, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ top: 64 } as DOMRect);
    vi.spyOn(targetHeading, "getBoundingClientRect").mockReturnValue({ top: 900 } as DOMRect);
    const scrollIntoView = vi.spyOn(targetHeading, "scrollIntoView");

    await user.click(screen.getByRole("link", { name: "适用场景" }));

    expect(scrollTo).toHaveBeenCalledWith({
      top: 812,
      behavior: "smooth",
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(`#${encodeURIComponent("适用场景")}`);
  });

  it("follows related article links without leaving the reader", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ProductDocsPage onNavigate={onNavigate} />);
    await user.click(screen.getByRole("link", { name: "整理需求与确认规则" }));
    expect(within(screen.getByRole("article")).getByRole("heading", { level: 1 })).toHaveTextContent("整理需求与确认规则");
    expect(new URL(window.location.href).searchParams.get("article")).toBe("requirements");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("navigates markdown local links through the shell callback", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ProductDocsPage onNavigate={onNavigate} />);

    await user.click(screen.getAllByRole("link", { name: "项目首页" })[0]);

    expect(onNavigate).toHaveBeenCalledWith("/projects");
  });

  it("keeps the optional video after the guide and collapsed by default", () => {
    render(<ProductDocsPage />);
    const article = screen.getByRole("article");
    const title = within(article).getByRole("heading", { level: 1 });
    const video = screen.getByLabelText("快速开始项目操作视频");
    expect(video.closest("details")).not.toHaveAttribute("open");
    expect(title.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(article).not.toHaveAttribute("data-slot", "card");
    const sidebar = screen.getByRole("complementary", { name: "使用文档目录" });
    expect(sidebar.querySelector('[data-slot="sidebar-menu"]')).toBeInTheDocument();
    expect(within(sidebar).queryByText(PRODUCT_DOC_ARTICLES[0].summary)).not.toBeInTheDocument();
  });

  it("clears stale anchors and focuses the new article title after selection", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/tutorial#映射关系");
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<ProductDocsPage />);
    await user.click(screen.getByRole("button", { name: "创建与进入项目" }));
    expect(screen.getByRole("heading", { name: "创建与进入项目" })).toHaveFocus();
    expect(window.location.hash).toBe("");
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId("docs-content-scroll-area").querySelector('[data-slot="scroll-area-viewport"]')?.scrollTop).toBe(0);
  });

  it("opens the mobile directory and collapses it after selecting an article", async () => {
    window.innerWidth = 390;
    const user = userEvent.setup();
    render(<ProductDocsPage />);
    const trigger = screen.getByRole("button", { name: "文档目录" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("product-docs-directory")).toHaveClass("hidden");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("product-docs-directory")).not.toHaveClass("hidden");
    await user.click(screen.getByRole("button", { name: "创建与进入项目" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("product-docs-directory")).toHaveClass("hidden");
    expect(screen.getByRole("heading", { name: "创建与进入项目" })).toHaveFocus();
  });

  it("reveals mobile search results when the reader is at the end of an article", () => {
    render(<ProductDocsPage />);
    const viewport = screen.getByTestId("docs-content-scroll-area").querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    viewport.scrollTop = 1600;
    fireEvent.change(screen.getByLabelText("搜索使用文档"), { target: { value: "模型" } });
    expect(viewport.scrollTop).toBe(0);
    expect(screen.getByRole("button", { name: "文档目录" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens a shared article URL and follows browser history", async () => {
    window.history.replaceState(null, "", "/tutorial?article=project-basics");
    render(<ProductDocsPage />);
    expect(within(screen.getByRole("article")).getByRole("heading", { level: 1 })).toHaveTextContent("创建与进入项目");
    window.history.replaceState(null, "", "/tutorial");
    fireEvent.popState(window);
    expect(within(screen.getByRole("article")).getByRole("heading", { level: 1 })).toHaveTextContent("快速开始");
  });

  it("restores the guide when the application navigates to a documentation URL", () => {
    window.history.replaceState(null, "", "/tutorial?article=project-basics");
    render(<ProductDocsPage />);
    window.history.replaceState(null, "", "/tutorial");
    fireEvent(window, new CustomEvent("uml-route-change"));
    expect(within(screen.getByRole("article")).getByRole("heading", { level: 1 })).toHaveTextContent("快速开始");
  });

  it("continues to the next guide from the article footer", async () => {
    const user = userEvent.setup();
    render(<ProductDocsPage />);
    const next = within(screen.getByRole("navigation", { name: "继续阅读" })).getByRole("button", { name: /下一篇/ });
    await user.click(next);
    expect(within(screen.getByRole("article")).getByRole("heading", { level: 1 })).toHaveFocus();
    expect(new URL(window.location.href).searchParams.get("article")).toBe(PRODUCT_DOC_ARTICLES[1].id);
  });

  it("keeps manifest screenshots attached to non-empty local assets", () => {
    for (const article of PRODUCT_DOC_ARTICLES) {
      if (!article.screenshot) continue;
      expect(article.screenshot?.src, article.id).toMatch(
        /^\/help\/images\/docs-[a-z0-9-]+\.png$/u,
      );
      expect(article.screenshot?.alt, article.id).toBeTruthy();
      expect(article.screenshot?.caption, article.id).toBeTruthy();
      const screenshotPath = article.screenshot?.src.replace(/^\//u, "");
      expect(screenshotPath, article.id).toBeTruthy();
      const absolutePath = resolve(PUBLIC_DIRECTORY, screenshotPath!);
      expect(existsSync(absolutePath), article.id).toBe(true);
      expect(statSync(absolutePath).size, article.id).toBeGreaterThan(0);
    }
  });

  it("illustrates every Chinese and English guide with non-empty current product images", () => {
    for (const article of [...getProductDocArticles("zh-CN"), ...getProductDocArticles("en")]) {
      const imagePaths = [...article.content.matchAll(/\]\((\/help\/images\/[^)]+)\)/gu)]
        .map((match) => match[1]);
      expect(imagePaths.length, `${article.id}: each guide needs a relevant screenshot`).toBeGreaterThan(0);
      for (const imagePath of imagePaths) {
        const relativePath = imagePath.replace(/^\//u, "");
        const absolutePath = resolve(PUBLIC_DIRECTORY, relativePath);
        expect(existsSync(absolutePath), `${article.id}: ${imagePath}`).toBe(true);
        expect(statSync(absolutePath).size, `${article.id}: ${imagePath}`).toBeGreaterThan(0);
      }
    }
  });

  it("localizes the new feasibility and community navigation metadata", () => {
    expect(getProductDocCategories("en").map((category) => category.label)).toContain(
      "Requirements and feasibility",
    );
    const englishArticles = getProductDocArticles("en");
    expect(englishArticles.find((article) => article.id === "feasibility-analysis")).toMatchObject({
      title:
        "Complete a feasibility analysis",
      categoryLabel: "Requirements and feasibility",
    });
    expect(englishArticles.some((article) => article.id === "billing-entitlements")).toBe(false);
  });

  it("attaches the quick start tutorial video to the first article", () => {
    const quickStart = PRODUCT_DOC_ARTICLES.find((article) => article.id === "quick-start");

    expect(quickStart?.video).toMatchObject({
      title: "快速开始项目操作视频",
      src: "https://tuolola.oss-cn-chengdu.aliyuncs.com/video/%E9%A1%B9%E7%9B%AE%E6%BC%94%E7%A4%BA.mp4",
    });
  });

  it("keeps guide titles, section structure and related-article destinations consistent", () => {
    const requiredSections = ["适用场景", "入口位置", "前置条件", "操作步骤", "结果与产物", "映射关系", "常见问题"];
    const articleIds = new Set(PRODUCT_DOC_ARTICLES.map((article) => article.id));
    for (const article of PRODUCT_DOC_ARTICLES) {
      expect(article.content.match(/^# (.+)$/m)?.[1], article.id).toBe(article.title);
      expect([...article.content.matchAll(/^## (.+)$/gm)].map((match) => match[1]), article.id).toEqual(requiredSections);
      for (const link of article.content.matchAll(/\]\((?:\.\/)?([a-z0-9-]+)\.md(?:#[^)]*)?\)/g)) {
        expect(articleIds.has(link[1]), `${article.id} → ${link[1]}`).toBe(true);
      }
    }
  });

  it("does not include the removed standalone model settings route in markdown links", () => {
    for (const article of PRODUCT_DOC_ARTICLES) {
      expect(article.content, article.id).not.toContain("/settings/models");
    }
  });
});
