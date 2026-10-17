// Uses the assistant-ui DaySeparator rule while preserving rich runtime messages in its content slot. See ../../LICENSE.
import type { ReactNode } from "react";
import { mono } from "../../source/elements/surfaces";
import { cn } from "../../source/lib/utils";

export function DaySeparator({ day, children }: { day?: string; children: ReactNode }) {
  return <div data-slot="day-separator" className="mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-2">
    {day && <div role="separator" aria-label={day} className="flex items-center gap-2.5 py-1">
      <span className="bg-foreground/[0.08] h-px flex-1" />
      <span className={cn(mono, "text-muted-foreground")}>{day}</span>
      <span className="bg-foreground/[0.08] h-px flex-1" />
    </div>}
    {children}
  </div>;
}
