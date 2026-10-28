// Direct Aceternity UI source: https://ui.aceternity.com/components/card-hover-effect.
// Local content, colors and focus support integrate project cards without changing shared-layout motion.
"use client";

import { cn } from "../utils";
import { motion } from "motion/react";
import { useId, useState, type HTMLAttributes, type ReactNode } from "react";

type HoverEffectItem = {
  title: string;
  description: string;
  link: string;
};

export const HoverEffect = <T extends HoverEffectItem,>({
  items,
  className,
  renderItem,
  ...props
}: {
  items: T[];
  className?: string;
  renderItem?: (item: T) => ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const id = useId();
  // A custom card owns its interaction; the default component remains a link.
  const Item = renderItem ? "div" : "a";

  return (
    <div
      {...props}
      onMouseLeave={(event) => {
        // Descendant leave events can target the grid itself while crossing a card gap.
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setHoveredIndex(null);
        }
        props.onMouseLeave?.(event);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHoveredIndex(null);
        props.onBlur?.(event);
      }}
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 py-10",
        className,
      )}
    >
      {items.map((item, idx) => (
        <Item
          href={renderItem ? undefined : item.link}
          key={item.link}
          className="relative group block h-full w-full"
          onMouseEnter={() => setHoveredIndex(idx)}
          onFocus={() => setHoveredIndex(idx)}
        >
          {/* Keep the Aceternity shared layout, but do not retain old backgrounds for exit fades.
              Revisiting a card mid-exit otherwise revives its pending opacity/visibility animation. */}
          {hoveredIndex === idx && (
            <motion.span
              data-slot="card-hover-background"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full bg-neutral-50 dark:bg-neutral-800 block rounded-xl"
              // Scope only the hover background so custom cards retain their own shared layout IDs.
              layoutId={`hoverBackground-${id}`}
              // One moving background stays opaque; overlapping shared-layout fades caused flicker.
              layoutCrossfade={false}
              initial={false}
              animate={{
                opacity: 1,
                transition: { duration: 0.15 },
              }}
            />
          )}
          {renderItem ? renderItem(item) : (
            <Card>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </Card>
          )}
        </Item>
      ))}
    </div>
  );
};

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div
    className={cn(
      "rounded-2xl h-full w-full p-4 overflow-hidden bg-black border border-transparent dark:border-white/[0.2] group-hover:border-slate-700 relative z-20",
      className,
    )}
  >
    <div className="relative z-50">
      <div className="p-4">{children}</div>
    </div>
  </div>
);

export const CardTitle = ({ className, children }: { className?: string; children: ReactNode }) => (
  <h4 className={cn("text-zinc-100 font-bold tracking-wide mt-4", className)}>
    {children}
  </h4>
);

export const CardDescription = ({ className, children }: { className?: string; children: ReactNode }) => (
  <p className={cn("mt-8 text-zinc-400 tracking-wide leading-relaxed text-sm", className)}>
    {children}
  </p>
);
