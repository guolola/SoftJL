// Composes the public documentation page with independent navigation and shared scroll areas.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, BookOpenCheck, Menu, ChevronDown } from "lucide-react";
import { cn } from "../../../shared/ui/utils";
import { Button } from "../../../shared/ui/button";
import { PageContainer } from "../../../shared/template/layout/page";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { i18n as appI18n } from "../../../shared/i18n";
import { getProductDocArticles, getProductDocCategories } from "../model/docs-content";
import {
  extractMarkdownHeadings,
  searchProductDocs,
} from "../lib/docs-markdown";
import { DocsArticleView } from "./docs-article-view";
import { DocsOnThisPage } from "./docs-on-this-page";
import { DocsSidebar } from "./docs-sidebar";
import { DocsHeader } from "./docs-header";
import { scrollDocsHeading } from "../lib/docs-scroll";
import { useDocsNavigation } from "../model/use-docs-navigation";

type ProductDocsPageProps = {
  onNavigate?: (route: string) => void;
};

export function ProductDocsPage({ onNavigate }: ProductDocsPageProps) {
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.title") ? translate : appI18n.t.bind(appI18n);
  const locale = i18n.resolvedLanguage === "en" || i18n.language === "en" ? "en" : "zh-CN";
  const articles = useMemo(() => getProductDocArticles(locale), [locale]);
  const categories = useMemo(() => getProductDocCategories(locale), [locale]);
  const articleIds = useMemo(() => articles.map((article) => article.id), [articles]);
  const { selection, selectArticle: navigateArticle } = useDocsNavigation(articleIds);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const directoryToolbarRef = useRef<HTMLDivElement>(null);
  const directoryViewportRef = useRef<HTMLDivElement>(null);
  const selectArticle = (id: string, heading?: string) => {
    navigateArticle(id, heading);
    setDirectoryOpen(false);
  };
  useLayoutEffect(() => {
    // Article URLs start at the full article header; only explicit anchors need an offset.
    if (!selection.heading && viewportRef.current) viewportRef.current.scrollTop = 0;
    if (selection.revision === 0 && !selection.heading) return;
    // Wait for the new article and collapsed mobile directory to commit together.
    const title = pageRef.current?.querySelector<HTMLElement>("article h1");
    title?.focus({ preventScroll: true });
    if (title && viewportRef.current) {
      const anchor = selection.heading ? document.getElementById(selection.heading) : null;
      if (anchor && pageRef.current?.contains(anchor)) {
        scrollDocsHeading(viewportRef.current, anchor, directoryToolbarRef.current?.offsetHeight ?? 0, "instant");
      } else {
        viewportRef.current.scrollTop = 0;
      }
    }
  }, [selection]);
  const [searchQuery, setSearchQuery] = useState("");
  useLayoutEffect(() => {
    // Search stays in the fixed header: reveal its results even from the end of a mobile article.
    if (!directoryOpen) return;
    if (directoryViewportRef.current) directoryViewportRef.current.scrollTop = 0;
    if (pageRef.current && pageRef.current.clientWidth < 720 && viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [directoryOpen, searchQuery]);
  const selectedArticle =
    articles.find((article) => article.id === selection.id) ??
    articles[0];
  const searchResults = useMemo(
    () => searchProductDocs(articles, searchQuery),
    [articles, searchQuery],
  );
  const headings = useMemo(
    () => extractMarkdownHeadings(selectedArticle.content),
    [selectedArticle.content],
  );

  const selectedIndex = articles.findIndex((article) => article.id === selectedArticle.id);
  const previousArticle = articles[selectedIndex - 1];
  const nextArticle = articles[selectedIndex + 1];
  const selectHeading = (id: string) => {
    const heading = document.getElementById(id);
    if (heading && viewportRef.current && pageRef.current?.contains(heading)) {
      scrollDocsHeading(viewportRef.current, heading, directoryToolbarRef.current?.offsetHeight ?? 0);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${encodeURIComponent(id)}`);
    }
  };

  return (
    <main ref={pageRef} data-testid="product-docs-page" className="@container/docs flex h-dvh min-h-0 min-w-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <DocsHeader searchQuery={searchQuery} onSearchQueryChange={(query) => {
        setSearchQuery(query);
        // Mobile search exposes its results in the collapsible directory immediately.
        setDirectoryOpen(Boolean(query.trim()));
      }} />
      {/* Size containment lets both columns use the actual reading height, including wrapped headers. */}
      <ScrollArea data-testid="docs-content-scroll-area" viewportRef={viewportRef} className="min-h-0 flex-1" style={{ containerType: "size" }} viewportClassName="overscroll-none" contentClassName="!block">
        <div ref={directoryToolbarRef} className="sticky top-0 z-40 border-b border-border bg-background px-4 py-2 @[720px]/docs:hidden">
          <Button
            variant="ghost"
            className="w-full justify-start"
            aria-expanded={directoryOpen}
            aria-controls="product-docs-directory"
            onClick={() => setDirectoryOpen((open) => !open)}
          >
            <Menu className="size-4" />
            {t("docs.directory")}
            <ChevronDown className="ml-auto size-4" />
          </Button>
        </div>
        <PageContainer className="h-auto flex-none py-8 @[720px]/docs:py-10">
          <div className="grid w-full grid-cols-1 items-start gap-8 @[1040px]/docs:gap-x-12 @[720px]/docs:grid-cols-[232px_minmax(0,1fr)] @[1040px]/docs:grid-cols-[232px_minmax(0,800px)_176px]">
            <div id="product-docs-directory" className={cn("min-w-0 @[720px]/docs:sticky @[720px]/docs:top-10 @[720px]/docs:self-start @[720px]/docs:block", !directoryOpen && "hidden")}>
              <ScrollArea data-testid="docs-directory-scroll-area" viewportRef={directoryViewportRef} className="h-[min(60dvh,32rem)] @[720px]/docs:h-[calc(100cqh-5rem)]" contentClassName="!block">
                <DocsSidebar
                  articles={articles}
                  categories={categories}
                  searchQuery={searchQuery}
                  searchResults={searchResults}
                  selectedArticleId={selectedArticle.id}
                  onSelectArticle={selectArticle}
                />
              </ScrollArea>
            </div>

            <div data-testid="docs-article-column" className="min-w-0 w-full max-w-[800px]">
              <DocsArticleView
                article={selectedArticle}
                headings={headings}
                onNavigate={onNavigate}
                onSelectArticle={selectArticle}
                onSelectHeading={selectHeading}
              />
              <nav aria-label={locale === "en" ? "Continue reading" : "继续阅读"} className="mt-12 grid grid-cols-1 gap-3 @[720px]/docs:grid-cols-2">
                {previousArticle && <Button variant="outline" className="h-auto min-h-24 justify-start gap-3 whitespace-normal rounded-xl p-4 text-left hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30" onClick={() => selectArticle(previousArticle.id)}>
                  <ArrowLeft className="size-4 shrink-0 text-sky-700 dark:text-sky-300" />
                  <span><span className="mb-1 block text-xs font-normal text-muted-foreground">{locale === "en" ? "Previous" : "上一篇"}</span><span className="text-sm font-semibold">{previousArticle.title}</span></span>
                </Button>}
                {nextArticle && <Button variant="outline" className="h-auto min-h-24 justify-between gap-3 whitespace-normal rounded-xl p-4 text-left hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 @[720px]/docs:col-start-2" onClick={() => selectArticle(nextArticle.id)}>
                  <span><span className="mb-1 block text-xs font-normal text-muted-foreground">{locale === "en" ? "Next" : "下一篇"}</span><span className="text-sm font-semibold">{nextArticle.title}</span></span>
                  <ArrowRight className="size-4 shrink-0 text-sky-700 dark:text-sky-300" />
                </Button>}
              </nav>
              <footer data-testid="docs-footer" className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <BookOpenCheck className="size-4 text-primary" />
                  {t("docs.maintainedNotice")}
                </span>
                <Button variant="ghost"
                  type="button"
                  className="inline-flex items-center gap-1 hover:underline"
                  onClick={() => selectArticle(articles[0]?.id ?? selectedArticle.id)}
                >
                  {t("docs.backToQuickStart")}
                  <ArrowRight className="size-4" />
                </Button>
              </footer>
            </div>

            <DocsOnThisPage headings={headings} onSelectHeading={selectHeading} />
          </div>
        </PageContainer>
      </ScrollArea>
    </main>
  );
}
