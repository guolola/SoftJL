// Reads the cookie-backed auth session for public surfaces without redirecting.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTH_SESSION_CHANGED_EVENT,
  platformApi,
  type PlatformUser,
} from "../services/platform-api";

export function useAuthSession() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setChecking(true);

    platformApi
      .me()
      .then((response) => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setUser(response.user ?? null);
      })
      .catch(() => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setUser(null);
      })
      .finally(() => {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setChecking(false);
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return { checking, user, refresh };
}
