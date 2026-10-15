// Serves the public guide as readable Markdown at a stable .md address.
import { getProductDocArticles } from "../../../features/product-docs/model/docs-content";
import { createDocsMarkdown } from "../../../features/product-docs/lib/docs-export";

type MarkdownRouteContext = { params: Promise<{ article: string }> };

export async function GET(request: Request, context: MarkdownRouteContext) {
  const { article: filename } = await context.params;
  const match = /^([a-z0-9-]+)\.md$/.exec(filename);
  const url = new URL(request.url);
  const locale = url.searchParams.get("lang") === "en" ? "en" : "zh-CN";
  const article = match && getProductDocArticles(locale).find((item) => item.id === match[1]);
  if (!article) return new Response("Guide not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const pageUrl = new URL("/tutorial", url.origin);
  // Next may use its internal listener in request.url. The proxy preserves the public Host.
  const host = request.headers.get("host");
  if (host && !/[/\\\s?#@]/u.test(host)) {
    pageUrl.port = "";
    pageUrl.host = host;
  }
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  if (protocol === "https" || protocol === "http") pageUrl.protocol = protocol;
  pageUrl.searchParams.set("article", article.id);
  return new Response(createDocsMarkdown(article, pageUrl.href), {
    headers: {
      // text/plain lets browsers display the Markdown instead of forcing a download.
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="${article.id}.${locale}.md"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
