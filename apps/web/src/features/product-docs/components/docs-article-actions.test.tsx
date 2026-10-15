// Verifies article copy/export actions report real outcomes and stay scoped to the current guide.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { i18n, LOCALE_PREFERENCE_STORAGE_KEY } from "../../../shared/i18n";
import { downloadTextFile } from "../../../shared/lib/download";
import { floatingAlert as toast } from "../../../shared/ui/floating-alert";
import type { ProductDocArticle } from "../model/docs-content";
import { createDocsMarkdown, getDocsPageUrl } from "../lib/docs-export";
import { DocsArticleActions } from "./docs-article-actions";

vi.mock("../../../shared/lib/download", () => ({ downloadTextFile: vi.fn() }));
vi.mock("../../../shared/ui/floating-alert", () => ({ floatingAlert: { success: vi.fn(), error: vi.fn() } }));

const article: ProductDocArticle = {
  id: "quick-start", title: "快速开始", category: "overview", categoryLabel: "开始使用",
  summary: "完成第一次生成。", estimatedMinutes: 3, recommendedPath: true, tags: [], relatedArtifacts: [],
  content: "<!-- Maintainer note. -->\n# 快速开始\n\n## 操作步骤\n\n打开[项目首页](/projects)。",
};
function view(selected = article) {
  return <AppI18nProvider><DocsArticleActions article={selected} /></AppI18nProvider>;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(downloadTextFile).mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
  await i18n.changeLanguage("zh-CN");
  window.history.replaceState(null, "", "/");
});

function expectNoInlineNotice() {
  const actions = within(screen.getByTestId("docs-article-actions"));
  expect(actions.queryByRole("status")).not.toBeInTheDocument();
  expect(actions.queryByRole("alert")).not.toBeInTheDocument();
  expect(actions.queryByText(/已复制|复制失败|已开始下载|下载未能开始/u)).not.toBeInTheDocument();
}

describe("DocsArticleActions", () => {
  it("copies complete Markdown from the primary action and confirms only after success", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(view());
    await user.click(screen.getByRole("button", { name: "复制页面" }));
    expect(writeText).toHaveBeenCalledWith(createDocsMarkdown(article, window.location.href));
    expect(writeText.mock.calls[0][0]).not.toContain("Maintainer note");
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe("已复制页面 Markdown。");
    expect(toast.error).not.toHaveBeenCalled();
    expectNoInlineNotice();
  });

  it("reports clipboard refusal without claiming success", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(view());
    await user.click(screen.getByRole("button", { name: "复制页面" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toEqual(expect.stringContaining("复制失败"));
    expect(toast.success).not.toHaveBeenCalled();
    expectNoInlineNotice();
    expect(screen.getByRole("button", { name: "复制页面" })).toBeEnabled();
  });

  it("opens a real Markdown URL in a new tab and lets Escape dismiss the action menu", async () => {
    const user = userEvent.setup();
    render(view());
    const trigger = screen.getByRole("button", { name: "更多页面操作" });
    await user.click(trigger);
    const markdown = await screen.findByRole("menuitem", { name: /查看 Markdown/u });
    expect(markdown.tagName).toBe("A");
    expect(markdown).toHaveAttribute("href", "/tutorial/quick-start.md?lang=zh-CN");
    expect(markdown).toHaveAttribute("target", "_blank");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the Markdown link keyboard-activatable inside the menu", async () => {
    const user = userEvent.setup();
    render(view());
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "更多页面操作" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    const markdown = await screen.findByRole("menuitem", { name: /查看 Markdown/u });
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(markdown).toHaveFocus());
    const activate = vi.fn((event: Event) => event.preventDefault());
    markdown.addEventListener("click", activate);
    await user.keyboard("{Enter}");
    expect(activate).toHaveBeenCalledOnce();
  });

  it("downloads the current Markdown and copies a canonical link through the menu", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    window.history.replaceState(null, "", "/tutorial?article=old&account=profile#旧章节");
    render(view());
    await user.click(screen.getByRole("button", { name: "更多页面操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "下载 Markdown" }));
    expect(downloadTextFile).toHaveBeenCalledWith("quick-start.md", createDocsMarkdown(article, window.location.href), "text/markdown");
    expect(vi.mocked(toast.success).mock.calls.at(-1)?.[0]).toBe("已开始下载 Markdown。");
    expectNoInlineNotice();
    await user.click(screen.getByRole("button", { name: "更多页面操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "复制页面链接" }));
    expect(writeText).toHaveBeenCalledWith(getDocsPageUrl(article.id, window.location.href));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));
    expect(vi.mocked(toast.success).mock.calls.at(-1)?.[0]).toBe("已复制页面链接。");
    expectNoInlineNotice();
  });

  it("closes the menu on article changes without repeating completed copy feedback", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const { rerender } = render(view());
    await user.click(screen.getByRole("button", { name: "复制页面" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "更多页面操作" }));
    rerender(view({ ...article, id: "provider-configuration", title: "配置供应商" }));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expectNoInlineNotice();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not show an earlier copy result on a newly selected article", async () => {
    const user = userEvent.setup();
    let finishCopy!: () => void;
    vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(new Promise<void>((resolve) => { finishCopy = resolve; }));
    const { rerender } = render(view());
    await user.click(screen.getByRole("button", { name: "复制页面" }));
    expect(screen.getByRole("button", { name: "复制中…" })).toBeDisabled();
    rerender(view({ ...article, id: "provider-configuration", title: "配置供应商" }));
    await act(async () => { finishCopy(); });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expectNoInlineNotice();
    expect(screen.getByRole("button", { name: "复制页面" })).toBeEnabled();
  });

  it("localizes the actions and Markdown destination for English readers", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "en");
    render(view());
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy page" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "More page actions" }));
    expect(await screen.findByRole("menuitem", { name: /View Markdown/u })).toHaveAttribute("href", "/tutorial/quick-start.md?lang=en");
    expect(screen.getByRole("menuitem", { name: "Download Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy page link" })).toBeInTheDocument();
  });
});
