// Coordinates active generation runs so stale async events cannot update session state.
import { useCallback, useEffect, useMemo, useRef } from "react";

type RunScope = "requirements" | "design" | "document" | "workspace";

export function useRunController() {
  const nextRunRequestIdRef = useRef(0);
  const subscriptionController = useRef(new AbortController());
  const activeRunRequestIdRef = useRef<Record<RunScope, number>>({
    requirements: 0,
    design: 0,
    document: 0,
    workspace: 0,
  });

  const beginRun = useCallback((scope: RunScope = "workspace") => {
    nextRunRequestIdRef.current += 1;
    activeRunRequestIdRef.current[scope] = nextRunRequestIdRef.current;
    return nextRunRequestIdRef.current;
  }, []);

  const isCurrentRun = useCallback((runRequestId: number, scope: RunScope = "workspace") => {
    return runRequestId === activeRunRequestIdRef.current[scope];
  }, []);

  useEffect(() => {
    subscriptionController.current = new AbortController();
    return () => {
      subscriptionController.current.abort();
      // Leaving the page stops observation, while server-side generation continues.
      for (const scope of Object.keys(activeRunRequestIdRef.current) as RunScope[]) {
        activeRunRequestIdRef.current[scope] = -1;
      }
    };
  }, []);
  const getSubscriptionSignal = useCallback(() => subscriptionController.current.signal, []);

  return useMemo(
    () => ({
      beginRun,
      isCurrentRun,
      getSubscriptionSignal,
    }),
    [beginRun, isCurrentRun, getSubscriptionSignal],
  );
}
