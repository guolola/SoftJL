// Maps completed run snapshots into the record maps consumed by workspace state.

import type {
  WorkspaceRecord,
  WorkspaceDesignRunSnapshot,
  WorkspaceRunSnapshot,
} from "../../../entities/workspace/model";
import {
  getDesignArtifactId,
  getDesignModelId,
  getRequirementArtifactId,
  getRequirementModelId,
} from "../../../entities/diagram/model";

export function snapshotToMaps(snapshot: WorkspaceRunSnapshot) {
  return {
    models: Object.fromEntries(
      snapshot.models.map((model) => [getRequirementModelId(model), model]),
    ) as WorkspaceRecord["models"],
    plantUml: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [getRequirementArtifactId(artifact), artifact.source]),
    ) as WorkspaceRecord["plantUml"],
    svgArtifacts: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [getRequirementArtifactId(artifact), artifact]),
    ) as WorkspaceRecord["svgArtifacts"],
  };
}

export function designSnapshotToMaps(snapshot: WorkspaceDesignRunSnapshot) {
  return {
    models: Object.fromEntries(
      snapshot.models.map((model) => [getDesignModelId(model), model]),
    ) as WorkspaceRecord["designModels"],
    plantUml: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [getDesignArtifactId(artifact), artifact.source]),
    ) as WorkspaceRecord["designPlantUml"],
    svgArtifacts: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [getDesignArtifactId(artifact), artifact]),
    ) as WorkspaceRecord["designSvgArtifacts"],
  };
}
