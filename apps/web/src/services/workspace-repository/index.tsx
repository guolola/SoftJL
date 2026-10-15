// Provides the workspace repository public facade and React context provider.
import {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getProjectIdFromPath, normalizeProjectId } from "./project-scope";
import { createHttpWorkspaceRepository } from "./http-repository";
import type { WorkspaceRepository } from "./types";

export { buildApiUrl } from "../api-client";
export { createHttpWorkspaceRepository } from "./http-repository";
export { createMockWorkspaceRepository } from "./mock-repository";
export type {
  RequirementRulesUpdateMetadata,
  WorkspaceRepository,
} from "./types";
export {
  
  createStartDesignRunInput,
  createStartDocumentRunInput,
  createStartRunInput,
  type ProviderSettingsInput,
  
  type StartDesignRunInput,
  type StartDocumentRunInput,
  type StartRunInput,
} from "./start-inputs";

const WorkspaceRepositoryContext = createContext<WorkspaceRepository | null>(
  null,
);
const defaultWorkspaceRepository = createHttpWorkspaceRepository();

export function WorkspaceRepositoryProvider({
  children,
  repository,
  projectId,
}: {
  children: ReactNode;
  repository?: WorkspaceRepository;
  projectId?: string | null;
}) {
  const [routeProjectId, setRouteProjectId] = useState(() =>
    typeof window === "undefined"
      ? null
      : getProjectIdFromPath(window.location.pathname),
  );

  useEffect(() => {
    if (projectId !== undefined) return;
    const syncProjectId = () => {
      setRouteProjectId(getProjectIdFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", syncProjectId);
    window.addEventListener("uml-route-change", syncProjectId);
    return () => {
      window.removeEventListener("popstate", syncProjectId);
      window.removeEventListener("uml-route-change", syncProjectId);
    };
  }, [projectId]);

  const scopedProjectId = normalizeProjectId(
    projectId === undefined ? routeProjectId : projectId,
  );
  const value = useMemo(
    () =>
      repository ??
      (scopedProjectId
        ? createHttpWorkspaceRepository({ projectId: scopedProjectId })
        : defaultWorkspaceRepository),
    [repository, scopedProjectId],
  );

  return (
    <WorkspaceRepositoryContext.Provider value={value}>
      {children}
    </WorkspaceRepositoryContext.Provider>
  );
}

export function useWorkspaceRepository() {
  const value = useContext(WorkspaceRepositoryContext);
  if (!value) {
    throw new Error(
      "useWorkspaceRepository must be used within WorkspaceRepositoryProvider",
    );
  }
  return value;
}
