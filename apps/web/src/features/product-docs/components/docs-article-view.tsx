// Renders readable task guides with semantic callouts, internal article links and current product images.
import type { AnchorHTMLAttributes, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight, Clock, PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Table, TableCell, TableHead, TableHeader } from "../../../shared/ui/table";
import { VideoPlayer } from "../../../shared/ui/video-player";
import { cn } from "../../../shared/ui/utils";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { i18n as appI18n } from "../../../shared/i18n";
import { isAppRouteHref, slugifyMarkdownHeading, type ProductDocHeading } from "../lib/docs-markdown";
import type { ProductDocArticle } from "../model/docs-content";
import { DocsCallout } from "./docs-callout";
import { DocsImage } from "./docs-image";
import { DocsArticleActions } from "./docs-article-actions";

type DocsArticleViewProps = {
  article: ProductDocArticle;
  headings: readonly ProductDocHeading[];
  onNavigate?: (route: string) => void;
  onSelectArticle?: (id: string, heading?: string) => void;
  onSelectHeading?: (id: string) => void;
};

export function DocsArticleView({ article, headings, onNavigate, onSelectArticle, onSelectHeading }: DocsArticleViewProps) {
  const { t: translate, i18n } = useTranslation();
  const t = i18n.exists("docs.minutes") ? translate : appI18n.t.bind(appI18n);
  const english = i18n.resolvedLanguage === "en" || i18n.language === "en";
  const headingIds = new Map(headings.map((heading) => [headingKey(heading.level, heading.title), heading.id]));
  const components = createMarkdownComponents({ headingIds, onNavigate, onSelectArticle, onSelectHeading, english });
  return (
    <article className="min-w-0 w-full max-w-[800px]">
      <header className="mb-10">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{english ? "User guide" : "使用文档"}</span>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span className="text-sky-700 dark:text-sky-300">{article.categoryLabel}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <h1 id={headings.find((heading) => heading.level === 1)?.id ?? article.id} tabIndex={-1}
          className="min-w-0 flex-1 basis-64 scroll-mt-6 break-words text-3xl leading-tight font-semibold tracking-tight outline-none @[720px]/docs:text-4xl">
          {headings.find((heading) => heading.level === 1)?.title ?? article.title}
        </h1>
        <DocsArticleActions article={article} className="shrink-0" />
        </div>
        <p className="mt-4 max-w-3xl text-base leading-7 text-foreground/75">{article.summary}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />{t("docs.minutes", { count: article.estimatedMinutes })}
        </span>
      </header>
      {article.screenshot && (
        <figure className="mb-8">
          <DocsImage src={article.screenshot.src} alt={article.screenshot.alt} />
          <figcaption className="mt-2 text-center text-xs leading-5 text-muted-foreground">{article.screenshot.caption}</figcaption>
        </figure>
      )}
      <div className="docs-prose text-base leading-7 text-foreground/85">
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>{article.content}</ReactMarkdown>
      </div>
      {article.video && (
        <details className="group mt-10 rounded-xl border border-border bg-muted/20 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground marker:text-sky-600">
            <span className="ml-1 inline-flex items-center gap-2"><PlayCircle className="size-4 text-sky-700 dark:text-sky-300" />{english ? "Optional: watch the walkthrough" : "补充演示：观看操作视频"}</span>
          </summary>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{english ? "The recording illustrates the workflow. Follow the steps above for current labels and entry points." : "视频用于了解操作流程；当前入口和按钮名称请以本文步骤为准。"}</p>
          <VideoPlayer className="mt-4" src={article.video.src} title={article.video.title} description={article.video.description} caption={article.video.caption} />
        </details>
      )}
    </article>
  );
}

function createMarkdownComponents({ headingIds, onNavigate, onSelectArticle, onSelectHeading, english }: {
  headingIds: Map<string, string>;
  onNavigate?: (route: string) => void;
  onSelectArticle?: (id: string, heading?: string) => void;
  onSelectHeading?: (id: string) => void;
  english: boolean;
}): Components {
  const headingId = (level: ProductDocHeading["level"], children: ReactNode) => {
    const title = getTextContent(children);
    return headingIds.get(headingKey(level, title)) ?? slugifyMarkdownHeading(title);
  };
  return {
    // Keep one H1: the title above the summary owns the article's accessible heading.
    h1() { return null; },
    h2({ children, ...props }) {
      return <h2 {...withoutMarkdownNode(props)} id={headingId(2, children)} className="mt-12 mb-4 scroll-mt-6 text-2xl leading-8 font-semibold tracking-tight text-foreground first:mt-0">{children}</h2>;
    },
    h3({ children, ...props }) {
      return <h3 {...withoutMarkdownNode(props)} id={headingId(3, children)} className="mt-8 mb-3 scroll-mt-6 text-lg leading-7 font-semibold text-foreground">{children}</h3>;
    },
    p({ children, ...props }) { return <p className="my-4 break-words leading-7" {...withoutMarkdownNode(props)}>{children}</p>; },
    ul({ children, ...props }) { return <ul className="my-4 list-disc space-y-2 pl-6 marker:text-sky-600 dark:marker:text-sky-400" {...withoutMarkdownNode(props)}>{children}</ul>; },
    ol({ children, ...props }) { return <ol className="my-5 list-decimal space-y-4 pl-7 marker:font-bold marker:text-sky-700 dark:marker:text-sky-300" {...withoutMarkdownNode(props)}>{children}</ol>; },
    li({ children, ...props }) { return <li className="break-words pl-1.5 [&>p]:my-1" {...withoutMarkdownNode(props)}>{children}</li>; },
    strong({ children, ...props }) { return <strong className="font-bold text-foreground" {...withoutMarkdownNode(props)}>{children}</strong>; },
    a({ href = "", children, ...props }) {
      return <DocsMarkdownLink href={href} onNavigate={onNavigate} onSelectArticle={onSelectArticle} onSelectHeading={onSelectHeading} {...withoutMarkdownNode(props)}>{children}</DocsMarkdownLink>;
    },
    blockquote({ children }) { return <DocsCallout english={english}>{children}</DocsCallout>; },
    code({ children, className, ...props }) {
      return <code className={cn("rounded-md border border-sky-200/70 bg-sky-50 px-1.5 py-0.5 font-mono text-[0.875em] text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-200", className)} {...withoutMarkdownNode(props)}>{children}</code>;
    },
    pre({ children, ...props }) {
      return <ScrollArea className="my-5 max-w-full rounded-xl border border-border bg-muted/50" showHorizontalScrollbar contentClassName="!block"><pre className="w-max min-w-full p-5 text-sm leading-7 text-foreground [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit" {...withoutMarkdownNode(props)}>{children}</pre></ScrollArea>;
    },
    table({ children, ...props }) {
      return <ScrollArea className="my-6 max-w-full rounded-xl border border-border [&_[data-slot=table-container]]:overflow-visible" showHorizontalScrollbar contentClassName="!block"><Table className="min-w-[520px] border-collapse text-left text-sm [&_tr:nth-child(even)]:bg-muted/20" {...withoutMarkdownNode(props)}>{children}</Table></ScrollArea>;
    },
    thead({ children, ...props }) { return <TableHeader className="bg-muted/70 text-foreground" {...withoutMarkdownNode(props)}>{children}</TableHeader>; },
    th({ children, ...props }) { return <TableHead className="h-auto border-b border-border px-4 py-3 font-semibold whitespace-normal" {...withoutMarkdownNode(props)}>{children}</TableHead>; },
    td({ children, ...props }) { return <TableCell className="border-t border-border px-4 py-3 align-top leading-6 whitespace-normal text-foreground/85" {...withoutMarkdownNode(props)}>{children}</TableCell>; },
    img({ src, alt, ...props }) { return <DocsImage src={src} alt={alt} {...withoutMarkdownNode(props)} />; },
    hr({ ...props }) { return <hr className="my-10 border-border" {...withoutMarkdownNode(props)} />; },
  };
}

function DocsMarkdownLink({ href, onNavigate, onSelectArticle, onSelectHeading, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  onNavigate?: (route: string) => void;
  onSelectArticle?: (id: string, heading?: string) => void;
  onSelectHeading?: (id: string) => void;
}) {
  const routeHref = isAppRouteHref(href);
  const articleMatch = href.match(/^(?:\.\/)?([a-z0-9-]+)\.md(?:#(.+))?$/i);
  const internal = routeHref || articleMatch || href.startsWith("#");
  const articleHref = articleMatch ? `/tutorial?article=${articleMatch[1]}${articleMatch[2] ? `#${articleMatch[2]}` : ""}` : href;
  return (
    <a {...props} href={articleHref} className="rounded-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-4 hover:text-sky-900 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-sky-300 dark:decoration-sky-700 dark:hover:text-sky-100"
      target={internal ? undefined : "_blank"} rel={internal ? undefined : "noreferrer"}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (articleMatch && onSelectArticle) { event.preventDefault(); onSelectArticle(articleMatch[1], decodeAnchor(articleMatch[2] ?? "")); }
        else if (href.startsWith("#") && onSelectHeading) { event.preventDefault(); onSelectHeading(decodeAnchor(href.slice(1))); }
        else if (routeHref && onNavigate) { event.preventDefault(); onNavigate(href); }
      }}>{children}</a>
  );
}

function getTextContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join("");
  if (node && typeof node === "object" && "props" in node) return getTextContent((node as { props?: { children?: ReactNode } }).props?.children);
  return "";
}
function headingKey(level: ProductDocHeading["level"], title: string) { return `${level}:${title.trim()}`; }

function decodeAnchor(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

// ReactMarkdown adds a syntax-tree node that must not become a DOM attribute.
function withoutMarkdownNode<T extends { node?: unknown }>(props: T) {
  const { node, ...attributes } = props;
  void node;
  return attributes;
}
