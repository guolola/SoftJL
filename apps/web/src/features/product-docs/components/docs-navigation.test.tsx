// Verifies accessible document categories, useful search results, and viewport-based reading progress.
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { SidebarProvider } from "../../../shared/ui/sidebar";
import { ThemeProvider } from "../../../shared/ui/theme-provider";
import type { ProductDocArticle, ProductDocCategory } from "../model/docs-content";
import type { ProductDocHeading } from "../lib/docs-markdown";
import { DocsSidebar } from "./docs-sidebar";
import { DocsHeader } from "./docs-header";
import { DocsOnThisPage } from "./docs-on-this-page";

const categories: ProductDocCategory[] = [{ id: "overview", label: "入门指南", description: "开始使用" }];
const articles: ProductDocArticle[] = ["创建项目", "配置项目"].map((title, index) => ({
  id: `guide-${index}`, title, category: "overview", categoryLabel: "入门指南",
  summary: "从项目首页进入创建表单，填写名称后开始建模。", estimatedMinutes: 2,
  content: "## 操作步骤", recommendedPath: true, tags: [], relatedArtifacts: [],
}));
const headings: ProductDocHeading[] = [
  { id: "start", level: 2, title: "开始操作" },
  { id: "create", level: 3, title: "填写表单" },
  { id: "complete", level: 2, title: "完成任务" },
];

function Providers({ children }: { children: React.ReactNode }) {
  return <AppI18nProvider><ThemeProvider><SidebarProvider>{children}</SidebarProvider></ThemeProvider></AppI18nProvider>;
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("documentation navigation", () => {
  it("starts with discoverable categories, supports collapse, and reveals a newly selected article", async () => {
    const user = userEvent.setup();
    const onSelectArticle = vi.fn();
    const renderSidebar = (selectedArticleId: string) => <Providers><DocsSidebar
      articles={articles} categories={categories} searchQuery="" searchResults={[]}
      selectedArticleId={selectedArticleId} onSelectArticle={onSelectArticle} /></Providers>;
    const { rerender } = render(renderSidebar(articles[0].id));
    const category = screen.getByRole("button", { name: "入门指南" });
    expect(category).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "入门指南", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建项目" })).toHaveAttribute("aria-current", "page");
    await user.click(category);
    expect(category).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "创建项目" })).not.toBeInTheDocument();
    rerender(renderSidebar(articles[1].id));
    await waitFor(() => expect(category).toHaveAttribute("aria-expanded", "true"));
    await user.click(screen.getByRole("button", { name: "配置项目" }));
    expect(onSelectArticle).toHaveBeenCalledWith(articles[1].id);
  });

  it("shows a useful excerpt and highlights the matching phrase without changing button labels", () => {
    render(<Providers><DocsSidebar articles={articles} categories={categories} searchQuery="创建"
      searchResults={[{ article: articles[0], score: 30, matchedText: articles[0].title }]}
      selectedArticleId={articles[0].id} onSelectArticle={vi.fn()} /></Providers>);
    const result = screen.getByRole("button", { name: "创建项目" });
    expect(result).toHaveAccessibleDescription(/从项目首页进入\s*创建\s*表单，填写名称后开始建模。/u);
    expect(result.querySelectorAll("mark")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("1 条");
  });

  it("preserves real symbols in readable excerpts", () => {
    render(<Providers><DocsSidebar articles={articles} categories={categories} searchQuery="C#"
      searchResults={[{ article: articles[0], score: 5, matchedText: "配置 C# 服务，填写 API_KEY。" }]}
      selectedArticleId={articles[0].id} onSelectArticle={vi.fn()} /></Providers>);
    const result = screen.getByRole("button", { name: "创建项目" });
    expect(result).toHaveTextContent("配置 C# 服务，填写 API_KEY。");
    expect(result.querySelector("mark")).toHaveTextContent("C#");
  });

  it("clears a query from the header and returns focus to search", async () => {
    const user = userEvent.setup();
    function Header() {
      const [query, setQuery] = useState("建模");
      return <DocsHeader searchQuery={query} onSearchQueryChange={setQuery} />;
    }
    render(<Providers><Header /></Providers>);
    await user.click(screen.getByRole("button", { name: "清除搜索" }));
    const input = screen.getByRole("textbox", { name: "搜索使用文档" });
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("button", { name: "清除搜索" })).not.toBeInTheDocument();
  });

  it("follows the reading viewport and ignores unrelated window scrolling", async () => {
    render(<Providers><div data-testid="reading-viewport" data-slot="scroll-area-viewport">
      <article>{headings.map((heading) => <h2 key={heading.id} id={heading.id}>{heading.title}</h2>)}</article>
      <DocsOnThisPage headings={headings} onSelectHeading={vi.fn()} />
    </div></Providers>);
    const viewport = screen.getByTestId("reading-viewport");
    const outline = screen.getByRole("navigation", { name: "本页内容" });
    const start = within(outline).getByRole("link", { name: "开始操作" });
    const create = within(outline).getByRole("link", { name: "填写表单" });
    expect(start).toHaveAttribute("aria-current", "true");
    expect(create).toHaveClass("pl-6");
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ top: 64 } as DOMRect);
    vi.spyOn(document.getElementById("start")!, "getBoundingClientRect").mockReturnValue({ top: -250 } as DOMRect);
    const createRect = vi.spyOn(document.getElementById("create")!, "getBoundingClientRect").mockReturnValue({ top: 88 } as DOMRect);
    vi.spyOn(document.getElementById("complete")!, "getBoundingClientRect").mockReturnValue({ top: 700 } as DOMRect);
    fireEvent.scroll(viewport);
    await waitFor(() => expect(create).toHaveAttribute("aria-current", "true"));
    expect(start).not.toHaveAttribute("aria-current");
    createRect.mockReturnValue({ top: 400 } as DOMRect);
    fireEvent.scroll(window);
    expect(create).toHaveAttribute("aria-current", "true");
    fireEvent.scroll(viewport);
    await waitFor(() => expect(start).toHaveAttribute("aria-current", "true"));
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 500 },
    });
    fireEvent.scroll(viewport);
    await waitFor(() => expect(within(outline).getByRole("link", { name: "完成任务" })).toHaveAttribute("aria-current", "true"));
  });

  it("tracks replacement heading nodes after the article rerenders with the same outline", async () => {
    const documentView = (revision: number) => <Providers><div data-testid="reading-viewport" data-slot="scroll-area-viewport">
      <article>{headings.map((heading) => <h2 key={`${heading.id}-${revision}`} id={heading.id}>{heading.title}</h2>)}</article>
      <DocsOnThisPage headings={headings} onSelectHeading={vi.fn()} />
    </div></Providers>;
    const { rerender } = render(documentView(0));
    const oldHeading = screen.getByRole("heading", { name: "填写表单" });
    rerender(documentView(1));
    expect(oldHeading.isConnected).toBe(false);
    const viewport = screen.getByTestId("reading-viewport");
    const article = screen.getByRole("article");
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ top: 64 } as DOMRect);
    vi.spyOn(within(article).getByRole("heading", { name: "开始操作" }), "getBoundingClientRect").mockReturnValue({ top: -250 } as DOMRect);
    vi.spyOn(within(article).getByRole("heading", { name: "填写表单" }), "getBoundingClientRect").mockReturnValue({ top: 97 } as DOMRect);
    vi.spyOn(within(article).getByRole("heading", { name: "完成任务" }), "getBoundingClientRect").mockReturnValue({ top: 1072 } as DOMRect);
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.getByRole("link", { name: "填写表单" })).toHaveAttribute("aria-current", "true"));
    expect(screen.getByRole("link", { name: "完成任务" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the outline usable when an incoming hash is malformed", async () => {
    const user = userEvent.setup();
    const onSelectHeading = vi.fn();
    window.history.replaceState(null, "", "/#%E0%A4%A");
    render(<Providers><DocsOnThisPage headings={headings} onSelectHeading={onSelectHeading} /></Providers>);
    const target = screen.getByRole("link", { name: "完成任务" });
    await user.click(target);
    expect(onSelectHeading).toHaveBeenCalledWith("complete");
    expect(target).toHaveAttribute("aria-current", "true");
    expect(window.location.hash).toBe("#complete");
  });
});
