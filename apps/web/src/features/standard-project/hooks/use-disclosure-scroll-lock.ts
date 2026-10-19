// Keeps the conversation anchored during disclosure animations without changing scrollbar geometry.
import { useCallback, useEffect, useRef, type RefObject } from "react";

export function useDisclosureScrollLock(
  animatedElementRef: RefObject<HTMLElement | null>,
  animationDuration: number,
) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    let viewport = animatedElementRef.current;
    while (viewport) {
      const { overflowY } = getComputedStyle(viewport);
      if (overflowY === "auto" || overflowY === "scroll") break;
      viewport = viewport.parentElement;
    }
    if (!viewport) return;

    const scrollContainer = viewport;
    const scrollTop = scrollContainer.scrollTop;
    const resetPosition = () => {
      if (scrollContainer.scrollTop !== scrollTop) scrollContainer.scrollTop = scrollTop;
    };
    // Keep both gutter edges intact: hiding the scrollbar collapses them and shifts centered messages.
    scrollContainer.addEventListener("scroll", resetPosition);
    const timeout = setTimeout(() => {
      scrollContainer.removeEventListener("scroll", resetPosition);
      cleanupRef.current = null;
    }, animationDuration);
    cleanupRef.current = () => {
      clearTimeout(timeout);
      scrollContainer.removeEventListener("scroll", resetPosition);
    };
  }, [animatedElementRef, animationDuration]);
}
