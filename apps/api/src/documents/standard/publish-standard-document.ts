// Publishes ordinary specifications to the same project document library and DOCX preview as professional files.
import type { StandardProjectState } from "@uml-platform/contracts";
import type { DocumentLibrary } from "../library/document-library.js";
import { projectDocumentWorkspaceId } from "../library/project-document-workspace.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import { buildStandardDocument } from "./standard-document.js";

export async function publishStandardDocument(input: {
  state: StandardProjectState; kind: "requirementsSpec" | "softwareDesignSpec"; projectId: string; userId: string;
  library: DocumentLibrary; render: PngRenderClient; signal?: AbortSignal;
}) {
  const { state, kind, library, signal } = input;
  signal?.throwIfAborted();
  const buffer = await buildStandardDocument(state, kind, artifact => input.render(artifact, signal));
  signal?.throwIfAborted();
  const document = await library.saveGeneratedDocument({ workspaceId: projectDocumentWorkspaceId(input.projectId),
    projectId: input.projectId, createdByUserId: input.userId, documentKind: kind,
    // Ordinary runs live in project state, not the professional run_records table.
    sourceRunId: null, fileName: `${state.documents![kind]!.title}.docx`, buffer });
  if (signal?.aborted) { await library.deleteDocument(document.workspaceId, document.id); signal.throwIfAborted(); }
  return document.id;
}
