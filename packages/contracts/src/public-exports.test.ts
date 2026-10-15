// Guards the runtime public export surface before splitting contract internals.
import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "./index.js";

const REQUIRED_RUNTIME_EXPORTS = [
  "diagramKindSchema",
  "designDiagramKindSchema",
  "requirementRulesResultSchema",
  "requirementBaselineSchema",
  "diagramModelsResultSchema",
  "designDiagramModelsResultSchema",
  "runSnapshotSchema",
  "designRunSnapshotSchema",
  "documentRunSnapshotSchema",
  "runEventSchema",
  "startRunRequestSchema",
  "startDesignRunRequestSchema",
  "startDocumentRunRequestSchema",
  "startFeasibilityRunRequestSchema",
  "feasibilityInputsSchema",
  "feasibilityImplementationPlanSchema",
  "feasibilityCandidateImplementationSchema",
  "completeFeasibilityImplementationPlanSchema",
  "feasibilityRunSnapshotSchema",
  "contextDiagramSpecSchema",
  "providerConfigListResponseSchema",
  "projectDtoSchema",
  "accountProfileResponseSchema",
  "adminRolePermissions",
  "documentLibraryListResponseSchema",
  "renderSvgResponseSchema",
  "snapshotInputFingerprint",
  "designInputFingerprint",
  "normalizeSnapshotFingerprint",
  "designRecordBelongsToDiagramKinds",
  "findModelByDiagramKind",
  "modelRecordBelongsToDiagramKinds",
  "resolveModelArtifactIdentity",
  "designTraceabilityTouchesDiagramKinds",
  "systemNoticeListResponseSchema",
  "apiErrorResponseSchema",
] as const;

test("contracts keep required runtime public exports available", () => {
  for (const exportName of REQUIRED_RUNTIME_EXPORTS) {
    assert.ok(exportName in contracts, `missing export ${exportName}`);
    assert.notEqual(contracts[exportName], undefined, `undefined export ${exportName}`);
  }
});
