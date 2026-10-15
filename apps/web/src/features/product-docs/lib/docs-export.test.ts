// Checks portable Markdown exports, including real links, media and literal examples.
import { describe, expect, it } from "vitest";
import type { ProductDocArticle } from "../model/docs-content";
import { createDocsMarkdown, getDocsPageUrl } from "./docs-export";

const baseArticle: ProductDocArticle = {
  id: "quick-start", title: "快速开始", category: "overview", categoryLabel: "开始使用",
  summary: "完成第一次模型生成。", estimatedMinutes: 3, recommendedPath: true,
  tags: [], relatedArtifacts: [], content: "# 快速开始\n\n## 操作步骤\n\n创建项目。",
};
const pageUrl = "https://example.test/tutorial?article=old-guide&account=profile#旧章节";

describe("documentation Markdown export", () => {
  it("includes one article title and its summary while excluding maintenance comments", () => {
    const markdown = createDocsMarkdown({ ...baseArticle, content: "<!-- Responsibility for maintainers. -->\r\n# 快速开始\r\n\r\n## 操作步骤\r\n\r\n先创建项目。\r\n<!-- Another internal note. -->" }, pageUrl);
    expect(markdown).toBe("# 快速开始\n\n完成第一次模型生成。\n\n## 操作步骤\n\n先创建项目。\n");
    expect(markdown.match(/^# /gm)).toHaveLength(1);
    expect(markdown).not.toContain("<!--");
  });

  it("makes article links, local anchors, image sources and app routes usable outside the reader", () => {
    const markdown = createDocsMarkdown({ ...baseArticle, content: "# 快速开始\n\n[配置模型](provider-configuration.md#操作步骤)\n\n[本页步骤](#操作步骤)\n\n[项目首页](/projects)\n\n![项目图片](/help/images/docs-current.png)\n\n[外部文档](https://example.org/guide)" }, pageUrl);
    expect(markdown).toContain(`[配置模型](https://example.test/tutorial?article=provider-configuration#${encodeURIComponent("操作步骤")})`);
    expect(markdown).toContain(`[本页步骤](https://example.test/tutorial?article=quick-start#${encodeURIComponent("操作步骤")})`);
    expect(markdown).toContain("[项目首页](https://example.test/projects)");
    expect(markdown).toContain("![项目图片](https://example.test/help/images/docs-current.png)");
    expect(markdown).toContain("[外部文档](https://example.org/guide)");
    expect(markdown).not.toContain("account=profile");
  });

  it("preserves inline and fenced code examples including literal links and comments", () => {
    const content = "# 快速开始\r\n\r\n示例：`[链接](other.md)`。\r\n\r\n```markdown\r\n# 示例标题\r\n<!-- Keep this example comment. -->\r\n[示例链接](other.md)\r\n```\r\n\r\n[真实链接](other.md)";
    const markdown = createDocsMarkdown({ ...baseArticle, content }, pageUrl);
    expect(markdown).toContain("`[链接](other.md)`");
    expect(markdown).toContain("```markdown\n# 示例标题\n<!-- Keep this example comment. -->\n[示例链接](other.md)\n```");
    expect(markdown).toContain("[真实链接](https://example.test/tutorial?article=other)");
  });

  it("includes manifest screenshots and walkthrough links alongside the full article", () => {
    const markdown = createDocsMarkdown({ ...baseArticle,
      screenshot: { src: "/help/images/docs-current.png", alt: "项目首页", caption: "当前界面。" },
      video: { src: "https://example.org/demo.mp4", title: "操作演示", description: "按步骤操作。", caption: "补充视频。" },
    }, pageUrl);
    expect(markdown).toContain("![项目首页](https://example.test/help/images/docs-current.png)\n\n当前界面。");
    expect(markdown).toContain("[操作演示](https://example.org/demo.mp4)\n\n按步骤操作。\n\n补充视频。");
    expect(markdown).toContain("## 操作步骤\n\n创建项目。");
  });

  it("builds a canonical article URL without unrelated query strings or stale anchors", () => {
    expect(getDocsPageUrl("provider-configuration", pageUrl)).toBe("https://example.test/tutorial?article=provider-configuration");
    expect(getDocsPageUrl("quick-start", "https://example.test")).toBe("https://example.test/tutorial?article=quick-start");
  });
});
