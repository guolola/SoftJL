// Defines the stable document-library workspace id used by project-owned run artifacts.
export function projectDocumentWorkspaceId(projectId: string) {
  return `project-${projectId}`;
}
