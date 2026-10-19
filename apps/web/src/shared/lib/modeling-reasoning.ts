// Shares the reasoning preference between the source composer and engineering generation controls.
import { useEffect, useState } from "react";

const STORAGE_KEY = "aui-home-effort";
const CHANGED_EVENT = "uml-modeling-reasoning-changed";

export function loadModelingReasoning(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "medium"; } catch { return false; }
}

export function useModelingReasoning() {
  const [reasoning, setReasoning] = useState(loadModelingReasoning);
  useEffect(() => {
    const sync = () => setReasoning(loadModelingReasoning());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) sync();
    };
    sync();
    window.addEventListener(CHANGED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [reasoning, (enabled: boolean) => {
    setReasoning(enabled);
    try { localStorage.setItem(STORAGE_KEY, enabled ? "medium" : "low"); } catch { /* Optional browser storage or diagnostics must not block the active workflow. */ }
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }] as const;
}
