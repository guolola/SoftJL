// Adapts AI Elements' moving text highlight to the workspace theme and motion settings.
import { memo, useMemo, type CSSProperties, type ElementType, type JSX, type ComponentType } from "react";
import { motion, useReducedMotion, type MotionProps } from "motion/react";
import { cn } from "../utils";

type MotionTextProps = MotionProps & Record<string, unknown>;
const motionElements = new Map<keyof JSX.IntrinsicElements, ComponentType<MotionTextProps>>();

function motionElement(element: keyof JSX.IntrinsicElements) {
  let Component = motionElements.get(element);
  if (!Component) {
    Component = motion.create(element);
    motionElements.set(element, Component);
  }
  return Component;
}

export interface ShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

export const Shimmer = memo(function Shimmer({ children, as = "span", className, duration = 2, spread = 2 }: ShimmerProps) {
  const reduceMotion = useReducedMotion();
  const MotionElement = motionElement(as as keyof JSX.IntrinsicElements);
  const width = useMemo(() => children.length * spread, [children, spread]);
  return <MotionElement
    data-slot="ai-shimmer"
    initial={reduceMotion ? false : { backgroundPosition: "100% center" }}
    animate={reduceMotion ? undefined : { backgroundPosition: "0% center" }}
    transition={reduceMotion ? undefined : { duration, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
    className={cn(
      "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
      "[background-repeat:no-repeat,padding-box] forced-colors:text-current forced-colors:bg-none",
      // CSS also handles a motion preference changed after this component was mounted.
      "motion-reduce:bg-none! motion-reduce:text-muted-foreground!",
      reduceMotion && "bg-none text-muted-foreground",
      className,
    )}
    style={{
      "--spread": `${width}px`,
      "--bg": "linear-gradient(90deg, transparent calc(50% - var(--spread)), var(--background), transparent calc(50% + var(--spread)))",
      backgroundImage: reduceMotion ? "none" : "var(--bg), linear-gradient(var(--muted-foreground), var(--muted-foreground))",
    } as CSSProperties}
  >{children}</MotionElement>;
});
