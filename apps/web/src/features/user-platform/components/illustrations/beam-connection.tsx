// Provides the measured connections required by the supplied beam-31 illustration.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";

type ElementRef = RefObject<HTMLElement | null>;
type Point = { x: number; y: number };

export function BeamConnection({ className, children }: {
  className?: string;
  children: (props: { containerRef: RefObject<HTMLDivElement | null>; active: boolean }) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  return <div ref={containerRef} className={`relative isolate ${className ?? ""}`}>
    {children({ containerRef, active: !reducedMotion })}
  </div>;
}

export function ConnectionBeam({ containerRef, fromRef, toRef, className, beamColor, beamSize, active, speed, pathBuilder }: {
  containerRef: ElementRef;
  fromRef: ElementRef;
  toRef: ElementRef;
  className?: string;
  beamType: "dash";
  beamColor: string;
  beamSize: number;
  active: boolean;
  speed: number;
  pathBuilder?: (start: Point, end: Point) => string;
}) {
  const [path, setPath] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    const from = fromRef.current;
    const to = toRef.current;
    if (!container || !from || !to) return;

    // Convert screen measurements back to local units so scaled card previews retain aligned beams.
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const scaleX = container.offsetWidth / bounds.width;
      const scaleY = container.offsetHeight / bounds.height;
      const start = from.getBoundingClientRect();
      const end = to.getBoundingClientRect();
      const startPoint = { x: (start.left + start.width / 2 - bounds.left) * scaleX, y: (start.top + start.height / 2 - bounds.top) * scaleY };
      const endPoint = { x: (end.left + end.width / 2 - bounds.left) * scaleX, y: (end.top + end.height / 2 - bounds.top) * scaleY };
      setPath(pathBuilder ? pathBuilder(startPoint, endPoint) : `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(from);
    observer.observe(to);
    measure();
    return () => observer.disconnect();
  }, [containerRef, fromRef, toRef, pathBuilder]);

  return <svg aria-hidden="true" className={`pointer-events-none absolute inset-0 size-full overflow-visible ${className ?? ""}`} fill="none">
    <path d={path} stroke="currentColor" strokeOpacity={0.2} />
    {active && <motion.path d={path} stroke={beamColor} strokeWidth={2} strokeDasharray={`${beamSize} ${beamSize * 5}`} animate={{ strokeDashoffset: [0, -beamSize * 6] }} transition={{ duration: beamSize * 6 / speed, repeat: Infinity, ease: "linear" }} />}
  </svg>;
}
