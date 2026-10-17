// assistant-ui Elements, adapted to platform primitives and translations. MIT, copyright AgentbaseAI Inc.; see ../assistant-ui.LICENSE.
"use client";

import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { MaximizeIcon, MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "../../../../shared/ui/utils";
import { ghostButton, mono, paper } from "./surfaces";

export function Diagram({
  title,
  zoom,
  children,
  onZoomIn,
  onZoomOut,
  onReset,
  onExpand,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "title"
  | "zoom"
  | "children"
  | "onZoomIn"
  | "onZoomOut"
  | "onReset"
  | "onExpand"
> & {
  title: string;
  zoom: number;
  children: React.ReactNode;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onReset?: () => void;
  onExpand?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="diagram"
      className={cn(
        paper,
        "flex w-full max-w-md flex-col overflow-hidden rounded-2xl",
        className,
      )}

      {...props}
    >
      <div className="flex items-center gap-1 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {title}
        </span>
        <span
          className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label={t("standardProject.preview.zoomOut")}
          onClick={onZoomOut}
          className={cn(ghostButton, "size-7 shrink-0")}
        >
          <MinusIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("standardProject.preview.zoomIn")}
          onClick={onZoomIn}
          className={cn(ghostButton, "size-7 shrink-0")}
        >
          <PlusIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("standardProject.preview.reset")}
          onClick={onReset}
          className={cn(ghostButton, "size-7 shrink-0")}
        >
          <RotateCcwIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("standardProject.preview.expand")}
          onClick={onExpand}
          disabled={!onExpand}
          className={cn(
            ghostButton,
            "size-7 shrink-0 disabled:pointer-events-none disabled:opacity-30",
          )}
        >
          <MaximizeIcon className="size-3.5" />
        </button>
      </div>

      <div className="border-foreground/[0.07] max-h-[32rem] min-h-[10rem] overflow-auto border-t p-4">
        <div
          className="mx-auto transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${zoom * 100}%` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
