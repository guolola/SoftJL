// Provides accessible Card 16 spotlight and Card 17 perspective effects without owning business interactions.
import * as React from "react";
import { useReducedMotion } from "motion/react";

import { cn } from "./utils";

type InteractiveCardProps = React.ComponentProps<"article">;

function useFinePointer() {
  const [finePointer, setFinePointer] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFinePointer(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return finePointer;
}

export function PerspectiveCard({ className, children, onPointerMove, onPointerLeave, ...props }: InteractiveCardProps) {
  const reduceMotion = useReducedMotion();
  const finePointer = useFinePointer();
  const cardRef = React.useRef<HTMLElement>(null);

  const resetTransform = React.useCallback(() => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  }, []);

  return (
    <article
      ref={cardRef}
      data-slot="perspective-card"
      className={cn(
        "relative min-w-0 transform-gpu overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out hover:border-primary/35 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (reduceMotion || !finePointer || !cardRef.current) return;
        const bounds = cardRef.current.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        cardRef.current.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        resetTransform();
      }}
      {...props}
    >
      {children}
    </article>
  );
}

export const SpotlightCard = React.forwardRef<HTMLElement, InteractiveCardProps>(function SpotlightCard({ className, children, onPointerMove, ...props }, forwardedRef) {
  const reduceMotion = useReducedMotion();
  const finePointer = useFinePointer();
  const cardRef = React.useRef<HTMLElement>(null);

  const setCardRef = React.useCallback((element: HTMLElement | null) => {
    cardRef.current = element;
    if (typeof forwardedRef === "function") {
      forwardedRef(element);
    } else if (forwardedRef) {
      forwardedRef.current = element;
    }
  }, [forwardedRef]);

  return (
    <article
      ref={setCardRef}
      data-slot="spotlight-card"
      className={cn(
        "group/spotlight relative min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-[border-color,box-shadow] duration-300 ease-out hover:border-primary/35 hover:shadow-md motion-reduce:transition-none",
        className,
      )}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (reduceMotion || !finePointer || !cardRef.current) return;
        const bounds = cardRef.current.getBoundingClientRect();
        cardRef.current.style.setProperty("--spotlight-x", `${event.clientX - bounds.left}px`);
        cardRef.current.style.setProperty("--spotlight-y", `${event.clientY - bounds.top}px`);
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover/spotlight:opacity-100 motion-reduce:hidden"
        style={{
          background:
            "radial-gradient(220px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), color-mix(in oklab, var(--primary) 18%, transparent), transparent 68%)",
        }}
      />
      <div className="relative z-[1] h-full">
        {children}
      </div>
    </article>
  );
});
