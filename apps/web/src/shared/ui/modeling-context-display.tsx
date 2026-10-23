// Shares the assistant-ui context meter and usage details; upstream MIT license is retained in home-demo/LICENSE.
"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { createContext, useCallback, useContext, useId, useMemo, useState, type ComponentProps, type CSSProperties, type FC, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getBarColor, getContextSegments, getPercentColor, getStrokeColor, getUsagePercent, type TokenUsage } from "../lib/modeling-context-usage";
import { formatTokenCount } from "../lib/token-count";
import { Tooltip, TooltipProvider, TooltipTrigger } from "./tooltip";
import { cn } from "./utils";

export type { TokenUsage } from "../lib/modeling-context-usage";

type ContextDisplayContextValue = {
  usage: TokenUsage | undefined;
  totalTokens: number | undefined;
  percent: number;
  modelContextWindow: number;
  translate: (value: string) => string;
  detailsId: string;
  portalContainer?: ComponentProps<typeof TooltipPrimitive.Portal>["container"];
};
const ContextDisplayContext = createContext<ContextDisplayContextValue | null>(null);

function useContextDisplay(): ContextDisplayContextValue {
  const context = useContext(ContextDisplayContext);
  if (!context) throw new Error("ContextDisplay.* must be used within ContextDisplay.Root");
  return context;
}

export type ContextDisplayRootProps = {
  modelContextWindow: number;
  children: ReactNode;
  usage?: TokenUsage;
  resetKey?: string;
  preserveLastUsage?: boolean;
  translate?: (value: string) => string;
  portalContainer?: ComponentProps<typeof TooltipPrimitive.Portal>["container"];
};
export type PresetProps = Omit<ContextDisplayRootProps, "children"> & {
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
};

function reportedTotal(usage: TokenUsage | undefined): number | undefined {
  return typeof usage?.totalTokens === "number" && Number.isFinite(usage.totalTokens) && usage.totalTokens >= 0 ? usage.totalTokens : undefined;
}

export function ContextDisplayRoot({ modelContextWindow, children, usage, resetKey, preserveLastUsage = true, translate, portalContainer }: ContextDisplayRootProps) {
  const { t } = useTranslation();
  const detailsId = useId();
  const defaultTranslate = useCallback((value: string): string => {
    const used = /^(\d+)% full$/.exec(value);
    if (used) return t("standardProject.tokens.used", { count: Number(used[1]) });
    const keys: Record<string, string> = {
      "Context usage": "usageLabel", "Not reported": "unknown", Unknown: "unknownCapacity",
      "Last call": "lastCall", Input: "inputShort", "Cached input": "cacheReadShort", Output: "output", Reasoning: "reasoningShort",
    };
    return keys[value] ? t(`standardProject.tokens.${keys[value]}`) : value;
  }, [t]);
  const translateLabel = useCallback((label: string) => {
    const adapted = translate?.(label);
    return adapted && adapted !== label ? adapted : defaultTranslate(label);
  }, [translate, defaultTranslate]);
  const rawTokens = reportedTotal(usage);
  const [tokenState, setTokenState] = useState({ resetKey, preserveLastUsage, totalTokens: rawTokens, reportedTokens: rawTokens, usage });
  if (tokenState.resetKey !== resetKey || tokenState.preserveLastUsage !== preserveLastUsage || tokenState.reportedTokens !== rawTokens || tokenState.usage !== usage) {
    setTokenState((previous) => ({
      resetKey,
      preserveLastUsage,
      // A transient missing report keeps the latest provider total in this
      // conversation; switching project, thread, or model resets that cache.
      totalTokens: previous.resetKey !== resetKey || !preserveLastUsage ? rawTokens : rawTokens ?? previous.totalTokens,
      reportedTokens: rawTokens,
      usage,
    }));
  }
  const current = tokenState.resetKey === resetKey && preserveLastUsage ? tokenState : { totalTokens: rawTokens, usage };
  const totalTokens = current.totalTokens;
  const percent = getUsagePercent(totalTokens, modelContextWindow);
  const value = useMemo(() => ({ usage: current.usage, totalTokens, percent, modelContextWindow, translate: translateLabel, detailsId, portalContainer }),
    [current.usage, totalTokens, percent, modelContextWindow, translateLabel, detailsId, portalContainer]);
  return <ContextDisplayContext.Provider value={value}>
    <TooltipProvider><Tooltip>{children}</Tooltip></TooltipProvider>
  </ContextDisplayContext.Provider>;
}

export function ContextDisplayTrigger({ className, children, ...props }: ComponentProps<"button">) {
  const { detailsId } = useContextDisplay();
  return <TooltipTrigger render={<button type="button" aria-describedby={detailsId} data-slot="context-display-trigger" className={cn("inline-flex items-center rounded-md transition-colors", className)} {...props} />}>
    {children}
  </TooltipTrigger>;
}

function TokenCounts() {
  const { totalTokens, modelContextWindow, translate } = useContextDisplay();
  return <>{totalTokens === undefined ? translate("Not reported") : formatTokenCount(totalTokens)} / {modelContextWindow > 0 && Number.isFinite(modelContextWindow) ? formatTokenCount(modelContextWindow) : translate("Unknown")}</>;
}

export function ContextDisplayContent({ side = "top", className }: { side?: PresetProps["side"]; className?: string }) {
  const { usage, totalTokens, percent, modelContextWindow, translate, detailsId, portalContainer } = useContextDisplay();
  const segments = getContextSegments(usage);
  const knownPercent = totalTokens !== undefined && modelContextWindow > 0 && Number.isFinite(modelContextWindow);
  return <TooltipPrimitive.Portal container={portalContainer}>
    <TooltipPrimitive.Positioner side={side} sideOffset={8} className="isolate z-50">
      <TooltipPrimitive.Popup id={detailsId} role="tooltip" data-slot="context-display-popover" className={cn("bg-popover text-popover-foreground origin-(--transform-origin) block w-56 rounded-md border p-3 text-left shadow-md", className)}>
        <div className="text-xs">
          <div className="flex items-baseline justify-between gap-6 whitespace-nowrap">
            <span className={getPercentColor(percent)}>{knownPercent ? translate(`${Math.round(percent)}% full`) : translate("Not reported")}</span>
            <span className="font-mono tabular-nums"><TokenCounts /></span>
          </div>
          <div data-slot="context-display-track" className="bg-muted inset-ring-border mt-2.5 h-1 overflow-hidden rounded-full inset-ring forced-colors:border">
            <div className={cn("h-full w-(--usage-width) rounded-full transition-[width] duration-300 forced-color-adjust-none", (totalTokens ?? 0) > 0 && "min-w-1", getBarColor(percent))}
              style={{ "--usage-width": `${percent}%` } as CSSProperties} />
          </div>
          {segments.length > 0 && <div className="mt-3 grid gap-1.5">
            {usage?.breakdownScope === "lastCall" && <p className="text-muted-foreground">{translate("Last call")}</p>}
            {segments.map((segment) => <div key={segment.label} className="flex items-baseline justify-between gap-6">
              <span className="text-muted-foreground">{translate(segment.label)}</span>
              <span className="font-mono tabular-nums">{formatTokenCount(segment.tokens)}</span>
            </div>)}
          </div>}
        </div>
      </TooltipPrimitive.Popup>
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>;
}

const RING_SIZE = 18;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RingVisual() {
  const { percent } = useContextDisplay();
  return <svg aria-hidden="true" width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
    <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" strokeWidth={RING_STROKE} className="stroke-border" />
    <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" strokeWidth={RING_STROKE} strokeLinecap="round" strokeDasharray={RING_CIRCUMFERENCE}
      strokeDashoffset={RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE} className={cn("transition-[stroke-dashoffset,stroke] duration-300", getStrokeColor(percent))} />
  </svg>;
}

function RingPercentLabel() {
  const { percent, totalTokens, modelContextWindow, translate } = useContextDisplay();
  return <span className="font-mono tabular-nums">{totalTokens !== undefined && modelContextWindow > 0 ? `${Math.round(percent)}%` : translate("Not reported")}</span>;
}

function BarVisual() {
  const { percent, totalTokens, translate } = useContextDisplay();
  return <div className="flex items-center gap-2">
    <div data-slot="context-display-track" className="bg-muted inset-ring-border h-1.5 w-16 overflow-hidden rounded-full inset-ring forced-colors:border">
      <div className={cn("h-full rounded-full transition-all duration-300 forced-color-adjust-none", getBarColor(percent))} style={{ width: `${percent}%` }} />
    </div>
    <span className="text-muted-foreground text-[10px] tabular-nums">{totalTokens === undefined ? translate("Not reported") : `${formatTokenCount(totalTokens)} (${Math.round(percent)}%)`}</span>
  </div>;
}

function MeterPreset({ className, side, variant, ...root }: PresetProps & { variant: "ring" | "bar" | "text" }) {
  return <ContextDisplayRoot {...root}>
    <PresetTrigger className={className} variant={variant} />
    <ContextDisplayContent side={side} />
  </ContextDisplayRoot>;
}

function PresetTrigger({ variant, className }: { variant: "ring" | "bar" | "text"; className?: string }) {
  const { translate } = useContextDisplay();
  const presetClass = variant === "ring" ? "text-muted-foreground hover:text-foreground gap-1.5 px-1.5 py-1 text-xs"
    : variant === "bar" ? "px-2 py-1"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground px-2 py-1 font-mono text-xs tabular-nums";
  return <ContextDisplayTrigger aria-label={translate("Context usage")} className={cn(presetClass, className)}>
    {variant === "ring" ? <><RingVisual /><RingPercentLabel /></> : variant === "bar" ? <BarVisual /> : <TokenCounts />}
  </ContextDisplayTrigger>;
}

export const ContextDisplayRing: FC<PresetProps> = (props) => <MeterPreset {...props} variant="ring" />;
export const ContextDisplayBar: FC<PresetProps> = (props) => <MeterPreset {...props} variant="bar" />;
export const ContextDisplayText: FC<PresetProps> = (props) => <MeterPreset {...props} variant="text" />;
