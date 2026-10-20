// Supplies the outside-click dependency used by the supplied expandable-card template.
"use client";

import { useEffect, type RefObject } from "react";

export function useOutsideClick(ref: RefObject<HTMLElement | null>, callback: () => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) callback();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, callback]);
}
