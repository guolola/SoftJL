// Follows short output until its opening reaches the top, then gives scrolling back to the reader.
import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useTranscriptScroll(taskKey: string, contentVersion: unknown) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mode = useRef<"bounded" | "paused" | "latest">("bounded");
  const lastTop = useRef(0);
  const programmedTop = useRef<number | null>(null);
  const [away, setAway] = useState(false);

  const update = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bottom = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (mode.current !== "paused") {
      const anchor = contentRef.current?.querySelector<HTMLElement>('[data-active-step="true"] [data-reading-anchor]');
      let target = bottom;
      if (mode.current === "bounded" && anchor && viewport.clientHeight > 0) {
        const opening = Math.max(0, viewport.scrollTop + anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 12);
        target = Math.min(bottom, opening);
        if (bottom > opening + 1) mode.current = "paused";
      }
      programmedTop.current = target;
      viewport.scrollTop = target;
      lastTop.current = viewport.scrollTop;
    }
    setAway(mode.current === "paused" && bottom - viewport.scrollTop > 48);
  }, []);

  useLayoutEffect(() => {
    mode.current = "bounded";
    lastTop.current = 0;
    programmedTop.current = null;
    setAway(false);
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    let frame = 0;
    let touchY = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    const pause = () => { mode.current = "paused"; schedule(); };
    const scroll = () => {
      const top = viewport.scrollTop;
      const programmatic = programmedTop.current !== null && Math.abs(top - programmedTop.current) < 2;
      if (!programmatic && top < lastTop.current - 1) mode.current = "paused";
      programmedTop.current = null;
      lastTop.current = top;
      setAway(mode.current === "paused" && viewport.scrollHeight - viewport.clientHeight - top > 48);
    };
    const wheel = (event: WheelEvent) => { if (event.deltaY < 0) pause(); };
    const key = (event: KeyboardEvent) => { if (["ArrowUp", "PageUp", "Home"].includes(event.key)) pause(); };
    const disclose = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("summary, button[aria-expanded]")) pause();
    };
    const touchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const touchMove = (event: TouchEvent) => { if ((event.touches[0]?.clientY ?? 0) > touchY + 4) pause(); };
    viewport.addEventListener("scroll", scroll, { passive: true });
    viewport.addEventListener("wheel", wheel, { passive: true });
    viewport.addEventListener("keydown", key);
    viewport.addEventListener("click", disclose);
    viewport.addEventListener("touchstart", touchStart, { passive: true });
    viewport.addEventListener("touchmove", touchMove, { passive: true });
    // ResizeObserver includes disclosures, wrapping and images loaded after the stream ends.
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    observer?.observe(content);
    observer?.observe(viewport);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      viewport.removeEventListener("scroll", scroll);
      viewport.removeEventListener("wheel", wheel);
      viewport.removeEventListener("keydown", key);
      viewport.removeEventListener("click", disclose);
      viewport.removeEventListener("touchstart", touchStart);
      viewport.removeEventListener("touchmove", touchMove);
    };
  }, [taskKey, update]);
  useLayoutEffect(update, [contentVersion, update]);

  const returnToLatest = useCallback(() => {
    mode.current = "latest";
    update();
  }, [update]);
  return { viewportRef, contentRef, away, returnToLatest };
}
