// Verifies search excerpts use visible guide text instead of Markdown authoring syntax.
import { describe, expect, it } from "vitest";
import type { ProductDocArticle } from "../model/docs-content";
import { searchProductDocs } from "./docs-markdown";

function article(content: string, overrides: Partial<ProductDocArticle> = {}): ProductDocArticle {
  return {
    id: "guide", title: "配置指南", category: "overview", categoryLabel: "开始使用",
    summary: "检查连接并保存可用的模型设置。", estimatedMinutes: 2, content,
    recommendedPath: false, tags: [], relatedArtifacts: [], ...overrides,
  };
}

describe("documentation search excerpts", () => {
  it("removes comments, link targets, formatting and callout markers before choosing context", () => {
    const guide = article(`<!-- Hidden responsibility wording. -->
# 配置指南

## 操作步骤

打开[模型供应商](provider-configuration.md)，检查 **API_KEY** 与 \`C#\` 示例。

> [!NOTE]
> 若连接失败，先测试供应商服务。
`);
    const [result] = searchProductDocs([guide], "模型供应商");
    expect(result.matchedText).toBe("操作步骤 打开模型供应商，检查 API_KEY 与 C# 示例。 若连接失败，先测试供应商服务。");
    expect(result.matchedText).not.toContain(guide.title);
    for (const query of ["Hidden responsibility", "provider-configuration.md", "[!NOTE]"]) {
      expect(searchProductDocs([guide], query), query).toEqual([]);
    }
  });

  it.each([
    { query: "配置指南", overrides: {} },
    { query: "排障入口", overrides: { tags: ["排障入口"] } },
    { query: "诊断结果", overrides: { relatedArtifacts: ["诊断结果"] } },
  ])("uses the authored summary for a title or metadata-only match: $query", ({ query, overrides }) => {
    const guide = article("<!-- Internal maintainer note. -->\n# 配置指南\n\n只出现正文描述。", overrides);
    const [result] = searchProductDocs([guide], query);
    expect(result.matchedText).toBe(guide.summary);
    expect(result.matchedText).not.toContain(guide.title);
    expect(result.matchedText).not.toContain("Internal maintainer");
  });

  it("keeps case-insensitive context aligned after trimming hidden content and formatting", () => {
    const guide = article(`
<!-- Provider is mentioned here only for maintainers. -->
# 配置指南

${"阅读说明。".repeat(12)}

> [!TIP]
> Test **Provider** before saving.

${"后续操作。".repeat(12)}`);
    const [result] = searchProductDocs([guide], "provider");
    expect(result.matchedText).toContain("Test Provider before saving.");
    expect(result.matchedText).not.toMatch(/<!--|\[!TIP\]|\*\*|maintainers/u);
    expect(result.matchedText.length).toBeLessThanOrEqual(88);
  });

  it("retains table cells, list wording and code content without structural markers", () => {
    const guide = article(`# 配置指南

| 项目 | 说明 |
| --- | --- |
| 验证步骤 | 测试通过 |

- [x] 保存设置

\`\`\`text
再次验证连接
\`\`\`
`);
    const [result] = searchProductDocs([guide], "验证步骤");
    expect(result.matchedText).toBe("项目 · 说明 验证步骤 · 测试通过 保存设置 再次验证连接");
    expect(searchProductDocs([guide], "text")).toEqual([]);
  });
});
