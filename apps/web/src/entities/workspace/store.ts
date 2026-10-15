// Defines replaceable workspace persistence ports and an in-memory adapter.
import type {
  
  DesignRunSnapshot,
  DocumentRunSnapshot,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { WorkspaceRecord } from "./model";
import type { ArtifactProvenance } from "./provenance";

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type PersistedRunSnapshot =
  | RunSnapshot
  | DesignRunSnapshot
  | DocumentRunSnapshot;

export interface ArtifactRecord {
  id: string;
  workspaceId: string;
  kind: string;
  title: string;
  createdAt: string;
  payload: unknown;
}

export interface WorkspaceStore {
  getWorkspace(id: string): Promise<WorkspaceRecord | null>;
  saveWorkspace(workspace: WorkspaceRecord): Promise<void>;
}

export interface ProjectStore {
  listProjects(workspaceId: string): Promise<ProjectRecord[]>;
  saveProject(project: ProjectRecord): Promise<void>;
}

export interface RunStore {
  getRun(runId: string): Promise<PersistedRunSnapshot | null>;
  saveRun(snapshot: PersistedRunSnapshot): Promise<void>;
}

export interface ArtifactStore {
  listArtifacts(workspaceId: string): Promise<ArtifactRecord[]>;
  saveArtifact(artifact: ArtifactRecord): Promise<void>;
}

export interface ProvenanceStore {
  getArtifactProvenance(artifactId: string): Promise<ArtifactProvenance | null>;
  saveArtifactProvenance(provenance: ArtifactProvenance): Promise<void>;
}

export interface WorkspacePersistence {
  workspaces: WorkspaceStore;
  projects: ProjectStore;
  runs: RunStore;
  artifacts: ArtifactStore;
  provenance: ProvenanceStore;
}

export function createMemoryWorkspacePersistence(): WorkspacePersistence {
  const workspaces = new Map<string, WorkspaceRecord>();
  const projects = new Map<string, ProjectRecord>();
  const runs = new Map<string, PersistedRunSnapshot>();
  const artifacts = new Map<string, ArtifactRecord>();
  const provenance = new Map<string, ArtifactProvenance>();

  return {
    workspaces: {
      async getWorkspace(id) {
        return workspaces.get(id) ?? null;
      },
      async saveWorkspace(workspace) {
        workspaces.set(workspace.id, structuredClone(workspace));
      },
    },
    projects: {
      async listProjects(workspaceId) {
        return Array.from(projects.values()).filter(
          (project) => project.workspaceId === workspaceId,
        );
      },
      async saveProject(project) {
        projects.set(project.id, { ...project });
      },
    },
    runs: {
      async getRun(runId) {
        return runs.get(runId) ?? null;
      },
      async saveRun(snapshot) {
        runs.set(snapshot.runId, structuredClone(snapshot));
      },
    },
    artifacts: {
      async listArtifacts(workspaceId) {
        return Array.from(artifacts.values()).filter(
          (artifact) => artifact.workspaceId === workspaceId,
        );
      },
      async saveArtifact(artifact) {
        artifacts.set(artifact.id, structuredClone(artifact));
      },
    },
    provenance: {
      async getArtifactProvenance(artifactId) {
        return provenance.get(artifactId) ?? null;
      },
      async saveArtifactProvenance(nextProvenance) {
        provenance.set(nextProvenance.artifactId, structuredClone(nextProvenance));
      },
    },
  };
}
