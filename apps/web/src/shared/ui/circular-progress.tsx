// Adapts the supplied Shadcn Studio ring to shared UI styling and accessible progress semantics.
"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

interface CircularProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  renderLabel?: (progress: number) => ReactNode;
  size?: number;
  strokeWidth?: number;
  progressClassName?: string;
  progressBgClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
}

function CircularProgress({
  value,
  renderLabel,
  size = 100,
  strokeWidth = 8,
  className,
  progressClassName,
  progressBgClassName,
  labelClassName,
  showLabel = false,
  style,
  ...props
}: CircularProgressProps) {
  const percent = Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      {...props}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("relative flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size, ...style }}
    >
      <svg aria-hidden="true" viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={cn("text-primary/10", progressBgClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          strokeLinecap="round"
          className={cn("text-primary transition-all duration-300 motion-reduce:transition-none", progressClassName)}
        />
      </svg>
      {showLabel && (
        <div aria-hidden="true" className={cn("absolute inset-0 flex items-center justify-center text-xl font-medium tabular-nums", labelClassName)}>
          {renderLabel ? renderLabel(percent) : `${percent}%`}
        </div>
      )}
    </div>
  );
}

export { CircularProgress };
