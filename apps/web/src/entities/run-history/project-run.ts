// Defines the project run summaries shared by history, overview, and lineage readers.
import type { RunOperationType, DocumentKind, DiagramKind, DesignDiagramKind, RunTokenConsumption, RunError } from "@uml-platform/contracts";

export interface ProjectRunSummary {
  runId: string;
  operationType: RunOperationType;
  projectId?: string;
  status: string;
  stage?: string | null;
  runKind?: "requirements" | "design" | "document" | string | null;
  documentKind?: DocumentKind | null;
  selectedDiagrams?: DiagramKind[] | DesignDiagramKind[] | null;
  requestedDiagrams?: (DiagramKind | DesignDiagramKind)[] | null;
  model?: string | null;
  tokenConsumption?: RunTokenConsumption;
  createdByUserId?: string | null;
  sourceRunId?: string | null;
  sourceAction?: "retry" | "rerun" | string | null;
  sourceRunStatus?: string | null;
  derivedRunIds?: string[] | null;
  latestAction?: "retry" | "rerun" | string | null;
  latestActionRunId?: string | null;
  latestActionAt?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  errorMessage?: string | null;
  error?: RunError | null;
  diagramErrorSummary?: { diagramId: string; stage?: string | null; error?: RunError | null; message: string }[] | null;
  missingArtifactSummary?: string[] | null;


  terminal?: boolean | null;
  snapshotAvailable?: boolean | null;
  documentDownloadAvailable?: boolean | null;
  documentId?: string | null;
  documentFileName?: string | null;
  documentVersion?: number | null;
  documentStatus?: string | null;
  documentRestoreAvailable?: boolean | null;
  documentByteLength?: number | null;
}
