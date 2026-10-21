// Shares the verified route session with protected-route descendants.
import { createContext, useContext, type ReactNode } from "react";
import type { PlatformAccountProfileResponse, PlatformUser } from "../services/platform-api";

const AuthenticatedRouteSessionContext =
  createContext<PlatformAccountProfileResponse | null | undefined>(undefined);
const AuthenticatedRouteUserUpdateContext =
  createContext<((user: PlatformUser) => void) | undefined>(undefined);

export function AuthenticatedRouteSessionProvider({
  children,
  value,
  onUserUpdate,
}: {
  children: ReactNode;
  value: PlatformAccountProfileResponse | null;
  onUserUpdate?: (user: PlatformUser) => void;
}) {
  return (
    <AuthenticatedRouteSessionContext.Provider value={value}>
      <AuthenticatedRouteUserUpdateContext.Provider value={onUserUpdate}>
        {children}
      </AuthenticatedRouteUserUpdateContext.Provider>
    </AuthenticatedRouteSessionContext.Provider>
  );
}

export function useAuthenticatedRouteSession() {
  return useContext(AuthenticatedRouteSessionContext);
}

export function useAuthenticatedRouteUserUpdate() {
  return useContext(AuthenticatedRouteUserUpdateContext);
}
