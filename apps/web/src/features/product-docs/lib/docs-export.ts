// Builds portable Markdown exports and canonical links for one documentation article.
import type { ProductDocArticle } from "../model/docs-content";

export function getDocsPageUrl(articleId: string, pageUrl: string) {
  const url = new URL("/tutorial", pageUrl);
  url.searchParams.set("article", articleId);
  return url.href;
}

export function createDocsMarkdown(article: ProductDocArticle, pageUrl: string) {
  const canonicalUrl = getDocsPageUrl(article.id, pageUrl);
  let title = article.title;
  let removedTitle = false;
  let fence = "";
  // Keep literal code examples intact while cleaning authored document sections.
  const body = article.content.replace(/\r\n?/gu, "\n").split(/(^[ \t]{0,3}(?:`{3,}|~{3,})[^\r\n]*$)/gmu).map((part) => {
    const marker = part.match(/^[ \t]{0,3}(`{3,}|~{3,})([^\r\n]*)$/u);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = "";
      return part;
    }
    if (fence) return part;
    const withoutComments = part.replace(/<!--[\s\S]*?-->/gu, "");
    const withoutTitle = withoutComments.replace(/^[ \t]{0,3}#[ \t]+([^\r\n]+)$/gmu, (heading, headingTitle: string) => {
      if (removedTitle) return heading;
      title = headingTitle.trim();
      removedTitle = true;
      return "";
    });
    // Inline examples can contain link syntax; rewrite only actual Markdown prose.
    return withoutTitle.split(/(`+[^`]*`+)/gu).map((segment) => segment.startsWith("`") ? segment : rewriteLinks(segment, canonicalUrl)).join("");
  }).join("").trim();
  const sections = [`# ${title}`, article.summary.trim()];
  if (article.screenshot && !article.content.includes(article.screenshot.src)) {
    sections.push(`![${escapeLabel(article.screenshot.alt)}](${resolveExportLink(article.screenshot.src, canonicalUrl)})`);
    if (article.screenshot.caption) sections.push(article.screenshot.caption);
  }
  sections.push(body);
  if (article.video) {
    sections.push(`[${escapeLabel(article.video.title)}](${resolveExportLink(article.video.src, canonicalUrl)})`);
    if (article.video.description) sections.push(article.video.description);
    if (article.video.caption && article.video.caption !== article.video.description) sections.push(article.video.caption);
  }
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

function rewriteLinks(markdown: string, pageUrl: string) {
  return markdown.replace(/(!?\[[^\]\r\n]*\]\()[ \t]*(<[^>\r\n]+>|[^\s)]+)([ \t]+(?:"[^"\r\n]*"|'[^'\r\n]*'))?[ \t]*\)/gu,
    (_match, prefix: string, destination: string, title: string | undefined) => {
      const href = destination.startsWith("<") ? destination.slice(1, -1) : destination;
      return `${prefix}${resolveExportLink(href, pageUrl)}${title ?? ""})`;
    });
}

function resolveExportLink(href: string, pageUrl: string) {
  const articleLink = href.match(/^(?:\.\/)?([a-z0-9-]+)\.md(?:#(.*))?$/iu);
  if (articleLink) {
    const url = new URL(getDocsPageUrl(articleLink[1], pageUrl));
    if (articleLink[2]) url.hash = articleLink[2];
    return url.href;
  }
  try { return new URL(href, pageUrl).href; } catch { return href; }
}

function escapeLabel(value: string) {
  return value.replace(/([\\[\]])/gu, "\\$1");
}
