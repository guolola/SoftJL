// Adapts Shadcn Studio's Spinner to local styling and reduced-motion preferences.
import type { ComponentProps } from "react";
import { Loader2Icon } from "lucide-react";
import { cn } from "./utils";

export function Spinner({ className, ...props }: ComponentProps<"svg">) {
  const decorative = props["aria-hidden"] === true || props["aria-hidden"] === "true";
  return <Loader2Icon role={decorative ? undefined : "status"} aria-label={decorative ? undefined : "加载中"}
    data-slot="spinner" className={cn("size-4 shrink-0 animate-spin motion-reduce:animate-none", className)} {...props} />;
}
