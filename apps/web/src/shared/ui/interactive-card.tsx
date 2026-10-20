// Provides an accessible Card 16 spotlight effect without owning business interactions.
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
