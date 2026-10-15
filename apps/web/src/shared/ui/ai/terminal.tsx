// shadcn.io/ai Terminal: monospace log stream with a copy action (no syntax highlighter).
import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/utils";

export function Terminal({
  title,
  lines,
  className,
  copyLabel = "复制日志",
  "data-testid": dataTestId,
}: {
  title: React.ReactNode;
  lines: string[];
  className?: string;
  copyLabel?: string;
  "data-testid"?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");
  return (
    <div data-slot="ai-terminal" data-testid={dataTestId} className={cn("rounded-md border border-border bg-muted", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-muted-foreground text-xs font-medium">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={copyLabel}
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <pre className="text-foreground max-h-52 overflow-auto break-all p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}
