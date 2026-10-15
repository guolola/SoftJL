// Keeps loading text mounted while its CSS highlight moves independently of streamed updates.
import type { ComponentProps } from "react";
import { cn } from "./utils";
import "./shimmer-text.css";

export function ShimmerText({ active = true, className, ...props }: ComponentProps<"span"> & { active?: boolean }) {
  return <span {...props} data-slot="shimmer-text" data-active={active}
    className={cn("min-w-0 break-words", active && "ui-text-shimmer", className)} />;
}
