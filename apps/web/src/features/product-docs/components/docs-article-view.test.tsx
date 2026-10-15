// Covers semantic notes, article navigation and screenshot access as readers experience them.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { extractMarkdownHeadings } from "../lib/docs-markdown";
import type { ProductDocArticle } from "../model/docs-content";
import { DocsArticleView } from "./docs-article-view";

function renderArticle(content: string, callbacks: Partial<Parameters<typeof DocsArticleView>[0]> = {}) {
  const article: ProductDocArticle = {
    id: "guide", title: "测试指南", category: "overview", categoryLabel: "开始使用", summary: "了解完成任务需要的操作。",
    estimatedMinutes: 3, recommendedPath: false, tags: [], relatedArtifacts: [], content,
  };
  return render(<AppI18nProvider><DocsArticleView article={article} headings={extractMarkdownHeadings(content)} {...callbacks} /></AppI18nProvider>);
}

describe("DocsArticleView", () => {
  it("labels notes, tips and warnings without exposing authoring markers or losing inline formatting", () => {
    renderArticle('# 测试指南\n\n> [!NOTE]\n> 阅读 **配置说明**。\n\n> [!TIP]\n> 打开[项目首页](/projects)。\n\n> [!WARNING]\n> 覆盖前先确认。');
    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(3);
    expect(within(notes[0]).getByText("说明")).toBeInTheDocument();
    expect(within(notes[0]).getByText("配置说明").tagName).toBe("STRONG");
    expect(within(notes[1]).getByText("操作建议")).toBeInTheDocument();
    expect(within(notes[1]).getByRole("link", { name: "项目首页" })).toHaveAttribute("href", "/projects");
    expect(within(notes[2]).getByText("注意事项")).toBeInTheDocument();
    expect(screen.queryByText(/\[!(NOTE|TIP|WARNING)\]/)).not.toBeInTheDocument();
  });

  it("opens related guides in the current reader and leaves a usable URL for new tabs", async () => {
    const selectArticle = vi.fn();
    const selectHeading = vi.fn();
    renderArticle('# 测试指南\n\n[配置模型](provider-configuration.md#操作步骤)\n\n[查看步骤](#操作步骤)', { onSelectArticle: selectArticle, onSelectHeading: selectHeading });
    const link = screen.getByRole("link", { name: "配置模型" });
    expect(link).toHaveAttribute("href", `/tutorial?article=provider-configuration#${encodeURIComponent("操作步骤")}`);
    expect(link).not.toHaveAttribute("target");
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(selectArticle).not.toHaveBeenCalled();
    await userEvent.click(link);
    expect(selectArticle).toHaveBeenCalledWith("provider-configuration", "操作步骤");
    await userEvent.click(screen.getByRole("link", { name: "查看步骤" }));
    expect(selectHeading).toHaveBeenCalledWith("操作步骤");
  });

  it("opens a full screenshot preview and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderArticle('# 测试指南\n\n![当前项目首页](/help/images/current-project-home.png)');
    await user.click(screen.getByRole("button", { name: "放大图片：当前项目首页" }));
    const dialog = screen.getByRole("dialog", { name: "当前项目首页" });
    expect(within(dialog).getByRole("img", { name: "当前项目首页" })).toHaveAttribute("src", "/help/images/current-project-home.png");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
