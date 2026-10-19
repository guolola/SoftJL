// Shadcn Studio ripple-button, using shared button styles and bounded animation cleanup.
"use client";

import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { motion, useReducedMotion, type HTMLMotionProps, type Transition } from "motion/react";
import { buttonVariants } from "./button";
import { cn } from "./utils";

interface Ripple { id: number; x: number; y: number }
interface RippleButtonProps extends HTMLMotionProps<"button">, VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
  scale?: number;
  transition?: Transition;
}

function RippleButton({
  ref, children, onClick, className, variant, size, disabled, type = "button",
  scale = 10, transition = { duration: 0.6, ease: "easeOut" }, ...props
}: RippleButtonProps) {
  const [ripples, setRipples] = React.useState<Ripple[]>([]);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const nextRippleId = React.useRef(0);
  const timers = React.useRef(new Set<ReturnType<typeof setTimeout>>());
  const reducedMotion = useReducedMotion();
  React.useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement);
  React.useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const button = buttonRef.current;
    if (button && !reducedMotion) {
      const rect = button.getBoundingClientRect();
      // Keyboard activation originates at the center instead of the viewport origin.
      const ripple = {
        id: nextRippleId.current++,
        x: event.detail === 0 ? rect.width / 2 : event.clientX - rect.left,
        y: event.detail === 0 ? rect.height / 2 : event.clientY - rect.top,
      };
      setRipples((current) => [...current, ripple]);
      const timer = setTimeout(() => {
        setRipples((current) => current.filter((item) => item.id !== ripple.id));
        timers.current.delete(timer);
      }, ((transition.duration ?? 0.6) + (transition.delay ?? 0)) * 1000);
      timers.current.add(timer);
    }
    onClick?.(event);
  };

  return (
    <motion.button ref={buttonRef} type={type} disabled={disabled} data-slot="button" data-size={size}
      onClick={handleClick} className={cn(buttonVariants({ variant, size }), "relative overflow-hidden active:translate-y-0", className)} {...props}>
      {children}
      {ripples.map((ripple) => <motion.span key={ripple.id} aria-hidden="true"
        initial={{ scale: 0, opacity: 0.5 }} animate={{ scale, opacity: 0 }} transition={transition}
        className="pointer-events-none absolute size-5 rounded-full bg-current"
        style={{ top: ripple.y - 10, left: ripple.x - 10 }} />)}
    </motion.button>
  );
}

export { RippleButton, type RippleButtonProps };
