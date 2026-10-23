// Keeps first-entry guidance behind every enclosing route loader, including its exit animation.
import { createContext, useContext, type ReactNode } from "react";

const RouteContentReadyContext = createContext(true);

export function RouteContentReadyProvider({ ready, children }: { ready: boolean; children: ReactNode }) {
  const parentReady = useContext(RouteContentReadyContext);
  return <RouteContentReadyContext.Provider value={parentReady && ready}>{children}</RouteContentReadyContext.Provider>;
}

export function useRouteContentReady() {
  return useContext(RouteContentReadyContext);
}
