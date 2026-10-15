// Shares the verified route session with protected-route descendants.
import { createContext, useContext, type ReactNode } from "react";
import type { PlatformAccountProfileResponse } from "../services/platform-api";

const AuthenticatedRouteSessionContext =
  createContext<PlatformAccountProfileResponse | null | undefined>(undefined);

export function AuthenticatedRouteSessionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: PlatformAccountProfileResponse | null;
}) {
  return (
    <AuthenticatedRouteSessionContext.Provider value={value}>
      {children}
    </AuthenticatedRouteSessionContext.Provider>
  );
}

export function useAuthenticatedRouteSession() {
  return useContext(AuthenticatedRouteSessionContext);
}
