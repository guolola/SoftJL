// Keeps article links shareable and restores the selected guide with browser back/forward.
import { useCallback, useEffect, useState } from "react";

export function useDocsNavigation(articleIds: readonly string[]) {
  const firstId = articleIds[0] ?? "";
  const readLocation = useCallback(() => {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("article");
    let heading = "";
    try { heading = decodeURIComponent(url.hash.slice(1)); } catch { /* Ignore malformed external anchors. */ }
    return { id: requested && articleIds.includes(requested) ? requested : firstId, heading };
  }, [articleIds, firstId]);
  const [selection, setSelection] = useState({ id: firstId, heading: "", revision: 0 });
  useEffect(() => {
    const restore = () => setSelection((current) => ({ ...readLocation(), revision: current.revision + 1 }));
    // Resolve the URL after hydration so public docs can still render on the server.
    const initial = readLocation();
    setSelection((current) => current.id === initial.id && current.heading === initial.heading ? current : { ...initial, revision: current.revision + 1 });
    window.addEventListener("popstate", restore);
    window.addEventListener("uml-route-change", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("uml-route-change", restore);
    };
  }, [readLocation]);
  const selectArticle = (id: string, heading = "") => {
    if (!articleIds.includes(id)) return;
    const url = new URL(window.location.href);
    if (id === firstId) url.searchParams.delete("article");
    else url.searchParams.set("article", id);
    // Anchors belong to an article and must not leak into the next guide.
    url.hash = heading;
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setSelection((current) => ({ id, heading, revision: current.revision + 1 }));
  };
  return { selection, selectArticle };
}
