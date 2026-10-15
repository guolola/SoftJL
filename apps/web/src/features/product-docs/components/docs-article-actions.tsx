// Gives readers a compact copy action and portable Markdown or page-link exports.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Download, FileText, Link2, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../../shared/ui/dropdown-menu";
import { downloadTextFile } from "../../../shared/lib/download";
import { cn } from "../../../shared/ui/utils";
import { floatingAlert as toast } from "../../../shared/ui/floating-alert";
import type { ProductDocArticle } from "../model/docs-content";
import { createDocsMarkdown, getDocsPageUrl } from "../lib/docs-export";

type DocsArticleActionsProps = {
  article: ProductDocArticle;
  className?: string;
};

export function DocsArticleActions({ article, className }: DocsArticleActionsProps) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" || i18n.language === "en" ? "en" : "zh-CN";
  // A new guide or language resets pending actions and closes the menu.
  return <ArticleActions key={`${article.id}:${locale}`} article={article} className={className} english={locale === "en"} />;
}

function ArticleActions({ article, className, english }: DocsArticleActionsProps & { english: boolean }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const operation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current += 1; };
  }, []);
  const copyLabel = english ? "Copy page" : "复制页面";
  const markdownHref = `/tutorial/${encodeURIComponent(article.id)}.md?lang=${english ? "en" : "zh-CN"}`;

  async function copy(action: "markdown" | "link") {
    const current = ++operation.current;
    setBusy(true);
    try {
      const value = action === "markdown"
        ? createDocsMarkdown(article, window.location.href)
        : getDocsPageUrl(article.id, window.location.href);
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard is unavailable");
      await navigator.clipboard.writeText(value);
      // A delayed browser permission response must not mark a different guide as copied.
      if (!mounted.current || current !== operation.current) return;
      toast.success(action === "markdown"
        ? (english ? "Page copied as Markdown." : "已复制页面 Markdown。")
        : (english ? "Page link copied." : "已复制页面链接。"));
    } catch {
      if (!mounted.current || current !== operation.current) return;
      toast.error(english
        ? "Copy failed. Open the Markdown page to copy the text manually."
        : "复制失败。可打开 Markdown 页面后手动复制文字。");
    } finally {
      if (mounted.current && current === operation.current) setBusy(false);
    }
  }

  function download() {
    try {
      downloadTextFile(`${article.id}.md`, createDocsMarkdown(article, window.location.href), "text/markdown");
      toast.success(english ? "Markdown download started." : "已开始下载 Markdown。");
    } catch {
      toast.error(english ? "The download could not start. Please try again." : "下载未能开始，请重试。");
    }
  }

  return (
    <div className={cn("inline-flex min-w-0 items-start", className)} data-testid="docs-article-actions">
      <div className="inline-flex max-w-full items-center" role="group" aria-label={english ? "Page actions" : "页面操作"}>
        <Button type="button" variant="outline" size="sm" className="rounded-r-none border-r-0 font-normal" disabled={busy}
          onClick={() => { void copy("markdown"); }}>
          {busy ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Copy aria-hidden="true" className="size-3.5" />}
          {busy ? (english ? "Copying…" : "复制中…") : copyLabel}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger nativeButton render={<Button type="button" variant="outline" size="icon-sm" className="rounded-l-none" aria-label={english ? "More page actions" : "更多页面操作"} />}>
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
            <DropdownMenuItem disabled={busy} onClick={() => { void copy("markdown"); }}>
              <Copy aria-hidden="true" />
              <span className="min-w-0"><span className="block">{copyLabel}</span><span className="mt-0.5 block text-xs text-muted-foreground">{english ? "Copy the page in Markdown format" : "复制完整 Markdown 内容"}</span></span>
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={markdownHref} target="_blank" rel="noreferrer" />}>
              <FileText aria-hidden="true" />
              <span className="min-w-0"><span className="block">{english ? "View Markdown" : "查看 Markdown"}</span><span className="mt-0.5 block text-xs text-muted-foreground">{english ? "Open the source in a new tab" : "在新标签页阅读原文"}</span></span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={download}><Download aria-hidden="true" />{english ? "Download Markdown" : "下载 Markdown"}</DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onClick={() => { void copy("link"); }}><Link2 aria-hidden="true" />{english ? "Copy page link" : "复制页面链接"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
