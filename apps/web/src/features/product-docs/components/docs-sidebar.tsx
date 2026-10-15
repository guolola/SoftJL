// Owns documentation navigation, category grouping, and search result selection.
import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../shared/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../shared/ui/collapsible";
import { cn } from "../../../shared/ui/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "../../../shared/ui/sidebar";
import { i18n as appI18n } from "../../../shared/i18n";
import type { ProductDocArticle, ProductDocCategory } from "../model/docs-content";
import type { ProductDocSearchResult } from "../lib/docs-markdown";

type DocsSidebarProps = {
  articles: readonly ProductDocArticle[];
  categories: readonly ProductDocCategory[];
  searchQuery: string;
  searchResults: readonly ProductDocSearchResult[];
  selectedArticleId: string;
  onSelectArticle: (articleId: string) => void;
};

export function DocsSidebar({
  articles, categories, searchQuery, searchResults, selectedArticleId, onSelectArticle,
}: DocsSidebarProps) {
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.directory") ? translate : appI18n.t.bind(appI18n);
  const isEnglish = i18n.resolvedLanguage === "en" || i18n.language === "en";
  const trimmedQuery = searchQuery.trim();

  return (
    <aside aria-label={t("docs.directoryAria")} className="min-w-0 py-2 @[720px]/docs:pr-6">
      <div className="flex items-center gap-2 px-2">
        <BookOpen aria-hidden="true" className="size-4 text-sky-700 dark:text-sky-300" />
        <h2 className="text-sm font-semibold text-foreground">{t("docs.directory")}</h2>
      </div>
      <p className="mt-2 px-2 text-xs leading-5 text-muted-foreground">
        {isEnglish ? "Find a guide for the task at hand." : "按操作任务查找，从入门到交付。"}
      </p>

      {trimmedQuery ? (
        <div className="mt-4 grid gap-2">
          <div role="status" aria-live="polite" className="flex items-center justify-between gap-2 px-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("docs.searchResults")}
            </span>
            <Badge variant="outline">{t("docs.resultCount", { count: searchResults.length })}</Badge>
          </div>
          {searchResults.length > 0 ? (
            <SidebarMenu className="gap-2">
              {searchResults.map(({ article, matchedText }) => (
                <ArticleButton key={article.id} article={article} active={article.id === selectedArticleId}
                  onSelect={() => onSelectArticle(article.id)}
                  excerpt={matchedText === article.title ? article.summary : matchedText} query={trimmedQuery} />
              ))}
            </SidebarMenu>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5">
              <SearchX aria-hidden="true" className="mb-3 size-5 text-muted-foreground" />
              <p className="break-words text-sm font-medium text-foreground">“{trimmedQuery}”</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("docs.noResults")}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {categories.map((category) => (
            <ArticleCategory key={category.id} category={category}
              articles={articles.filter((article) => article.category === category.id)}
              selectedArticleId={selectedArticleId} onSelectArticle={onSelectArticle} />
          ))}
        </div>
      )}
    </aside>
  );
}

function ArticleCategory({ category, articles, selectedArticleId, onSelectArticle }: {
  category: ProductDocCategory;
  articles: readonly ProductDocArticle[];
  selectedArticleId: string;
  onSelectArticle: (articleId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const activeArticleId = articles.find((article) => article.id === selectedArticleId)?.id;
  useEffect(() => {
    // Article links elsewhere in the guide reveal their location in a collapsed group.
    if (activeArticleId) setOpen(true);
  }, [activeArticleId]);

  return (
    <SidebarGroup className="p-0" aria-labelledby={`docs-category-${category.id}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <h3 id={`docs-category-${category.id}`}>
          <CollapsibleTrigger className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <span className="min-w-0 flex-1 break-words">{category.label}</span>
            <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {articles.map((article) => (
                <ArticleButton key={article.id} article={article} active={article.id === selectedArticleId}
                  onSelect={() => onSelectArticle(article.id)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

function ArticleButton({ article, active, onSelect, excerpt, query = "" }: {
  article: ProductDocArticle;
  active: boolean;
  onSelect: () => void;
  excerpt?: string;
  query?: string;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton type="button" isActive={active} aria-current={active ? "page" : undefined}
        aria-label={article.title} aria-describedby={excerpt ? `docs-result-${article.id}` : undefined}
        className={cn(
          "h-auto min-h-9 items-start whitespace-normal rounded-lg px-3 py-2 text-muted-foreground [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible",
          "data-active:bg-sky-50 data-active:font-medium data-active:text-sky-700 dark:data-active:bg-sky-400/10 dark:data-active:text-sky-300",
          excerpt && "min-h-20 rounded-lg bg-muted/25 p-3",
        )} onClick={onSelect}>
        <span className="min-w-0 break-words text-sm leading-5">
          <HighlightedText text={article.title} query={query} />
          {excerpt ? <span id={`docs-result-${article.id}`} className="mt-1.5 block text-xs font-normal leading-5 text-muted-foreground">
            <HighlightedText text={excerpt} query={query} />
          </span> : null}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark className="rounded-sm bg-amber-100 px-0.5 font-semibold text-amber-950 dark:bg-amber-400/20 dark:text-amber-200">{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>;
}
