// shadcn.io/ai Task/Plan: overall run progress card with status badge and loader.
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/shared/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Progress } from "@/shared/ui/progress";
import { cn } from "@/shared/ui/utils";

export function TaskCard({
  title,
  badge,
  progress,
  running = false,
  action,
  children,
  className,
}: {
  title: ReactNode;
  badge?: ReactNode;
  progress?: number | null;
  running?: boolean;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {running ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" /> : null}
          {title}
        </CardTitle>
        <CardAction className="flex items-center gap-2">
          {badge ? <Badge variant="secondary">{badge}</Badge> : null}
          {action}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {typeof progress === "number" ? <Progress value={progress} /> : null}
        {children}
      </CardContent>
    </Card>
  );
}
