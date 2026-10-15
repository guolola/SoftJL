// Defines persisted artifact provenance without coupling workspace stores to workflow orchestration.
export interface ArtifactProvenance {
  artifactId: string;
  artifactType: string;
  runId: string;
  stage: string | null;
  model: string | null;
  promptPackageVersion: string | null;
  inputArtifactIds: string[];
  createdAt: string;
}
