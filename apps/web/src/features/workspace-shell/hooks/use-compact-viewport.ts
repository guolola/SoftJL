// Centralizes the workspace compact breakpoint so responsive shell components stay consistent.
import { useEffect, useState } from "react";

const COMPACT_VIEWPORT_QUERY = "(max-width: 767px)";

function readCompactViewport() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(COMPACT_VIEWPORT_QUERY).matches;
}

export function useCompactViewport() {
  const [compact, setCompact] = useState(readCompactViewport);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(COMPACT_VIEWPORT_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
}

