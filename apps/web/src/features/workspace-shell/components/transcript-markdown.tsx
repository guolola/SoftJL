// Renders readable streamed prose without interpreting raw HTML or technical JSON as UI.
import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { Table } from "../../../shared/ui/table";
import { cn } from "../../../shared/ui/utils";

// Stable component identities preserve existing paragraph nodes as new fragments arrive.
const components: Components = {
      p: ({ children }) => <p className="my-3 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>,
      h1: ({ children }) => <h4 className="mb-3 mt-6 text-lg font-semibold">{children}</h4>,
      h2: ({ children }) => <h4 className="mb-3 mt-6 text-lg font-semibold">{children}</h4>,
      h3: ({ children }) => <h4 className="mb-2 mt-5 font-semibold">{children}</h4>,
      ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
      blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-border pl-4">{children}</blockquote>,
      pre: ({ children }) => <ScrollArea className="my-4 rounded-lg bg-muted/50" showHorizontalScrollbar><pre className="w-max min-w-full p-4 font-mono text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">{children}</pre></ScrollArea>,
      code: ({ children }) => <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.875em]">{children}</code>,
      table: ({ children }) => <ScrollArea className="my-4 [&_[data-slot=table-container]]:overflow-visible" showHorizontalScrollbar><Table className="min-w-full border-collapse text-left text-sm [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2">{children}</Table></ScrollArea>,
      a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4">{children}</a>,
      img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className="my-3 h-auto max-w-full rounded-md" loading="lazy" />,
};

const compactComponents: Components = {
  ...components,
  h1: ({ children }) => <h4 className="mb-2 mt-3 text-sm font-medium">{children}</h4>,
  h2: ({ children }) => <h4 className="mb-2 mt-3 text-sm font-medium">{children}</h4>,
  h3: ({ children }) => <h4 className="mb-2 mt-3 text-sm font-medium">{children}</h4>,
};

export const TranscriptMarkdown = memo(function TranscriptMarkdown({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={cn("min-w-0 break-words text-black dark:text-foreground [overflow-wrap:anywhere]", compact ? "text-sm leading-6" : "text-base leading-7")} data-slot="transcript-prose">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={compact ? compactComponents : components}>{text}</ReactMarkdown>
  </div>;
});
