// Renders the H2/H3 outline and follows reading progress inside the documentation viewport.
import { useEffect, useMemo, useRef, useState } from "react";
import { List } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../shared/ui/utils";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { i18n as appI18n } from "../../../shared/i18n";
import type { ProductDocHeading } from "../lib/docs-markdown";

type DocsOnThisPageProps = {
  headings: readonly ProductDocHeading[];
  onSelectHeading: (id: string) => void;
};

export function DocsOnThisPage({ headings, onSelectHeading }: DocsOnThisPageProps) {
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.onThisPage") ? translate : appI18n.t.bind(appI18n);
  const visibleHeadings = useMemo(() => headings.filter(
    (heading) => heading.level === 2 || heading.level === 3,
  ), [headings]);
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const outlineRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let hash = "";
    try {
      hash = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      // An externally supplied malformed hash must not prevent the guide from opening.
    }
    setActiveHeadingId(visibleHeadings.some((heading) => heading.id === hash) ? hash : visibleHeadings[0]?.id ?? "");

    // Both navigation columns have their own scroll areas. Observe the ancestor
    // reading viewport, never the outline's child viewport or the window.
    const viewport = outlineRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport || visibleHeadings.length === 0) return;

    let frame = 0;
    const updateActiveHeading = () => {
      // Markdown renderers can replace heading nodes without changing the outline
      // data. Resolve live nodes within this article for every reading update.
      const article = viewport.querySelector("article");
      if (!article) return;
      const elements = new Map(Array.from(article.querySelectorAll<HTMLElement>("h2[id], h3[id]"), (element) => [element.id, element]));
      const targets = visibleHeadings.flatMap((heading) => {
        const element = elements.get(heading.id);
        return element ? [{ id: heading.id, element }] : [];
      });
      if (targets.length === 0) return;
      const readingLine = viewport.getBoundingClientRect().top + 48;
      let active = targets[0].id;
      for (const target of targets) {
        if (target.element.getBoundingClientRect().top > readingLine) break;
        active = target.id;
      }
      // Short closing sections can never reach the top of the viewport.
      if (viewport.scrollHeight > viewport.clientHeight && viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2) {
        active = targets[targets.length - 1].id;
      }
      setActiveHeadingId(active);
    };
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActiveHeading);
    };
    viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    const article = viewport.querySelector("article");
    if (article) resizeObserver?.observe(article);
    scheduleUpdate();
    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, [visibleHeadings]);

  return (
    <aside ref={outlineRef} aria-label={t("docs.outlineAria")} className="hidden min-w-0 @[1040px]/docs:sticky @[1040px]/docs:top-10 @[1040px]/docs:block @[1040px]/docs:self-start">
      <ScrollArea data-testid="docs-outline-scroll-area" className="h-[calc(100cqh-5rem)]" contentClassName="!block">
        <div className="py-2 pl-2">
          <div className="flex items-center gap-2">
            <List aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-foreground">{t("docs.onThisPage")}</h2>
          </div>
          {visibleHeadings.length > 0 ? (
            <nav aria-label={t("docs.onThisPage")} className="mt-4 grid gap-1">
              {visibleHeadings.map((heading) => {
                const isActive = heading.id === activeHeadingId;
                return (
                  <a key={heading.id} href={`#${heading.id}`} aria-current={isActive ? "true" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      setActiveHeadingId(heading.id);
                      onSelectHeading(heading.id);
                      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${heading.id}`);
                    }}
                    className={cn(
                      "block break-words rounded-md px-2 py-1.5 text-[13px] leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      heading.level === 3 && "pl-6 text-xs",
                      isActive
                        ? "font-medium text-sky-700 dark:text-sky-300"
                        : "text-muted-foreground hover:text-foreground",
                    )}>
                    {heading.title}
                  </a>
                );
              })}
            </nav>
          ) : (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("docs.noOutline")}</p>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
