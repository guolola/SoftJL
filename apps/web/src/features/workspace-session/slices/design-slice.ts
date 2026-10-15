// Owns design diagram selection and generated design-stage artifacts.
import { useState } from "react";
import type { DesignDiagramType } from "../../../entities/diagram/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

export function useDesignSlice() {
  const [selectedDesignDiagrams, setSelectedDesignDiagrams] = useState<
    DesignDiagramType[]
  >([]);
  const [designModels, setDesignModels] = useState<WorkspaceRecord["designModels"]>(
    {},
  );
  const [designModelTraceability, setDesignModelTraceability] = useState<
    WorkspaceRecord["designModelTraceability"]
  >([]);
  const [designPlantUml, setDesignPlantUml] = useState<
    WorkspaceRecord["designPlantUml"]
  >({});
  const [designSvgArtifacts, setDesignSvgArtifacts] = useState<
    WorkspaceRecord["designSvgArtifacts"]
  >({});
  const [designDiagramErrors, setDesignDiagramErrors] = useState<
    WorkspaceRecord["designDiagramErrors"]
  >({});
  const [generatedDesignDiagrams, setGeneratedDesignDiagrams] = useState<
    DesignDiagramType[]
  >([]);
  const [designInputFingerprints, setDesignInputFingerprints] = useState<
    Record<string, string>
  >({});

  return {
    selectedDesignDiagrams,
    setSelectedDesignDiagrams,
    designModels,
    setDesignModels,
    designModelTraceability,
    setDesignModelTraceability,
    designPlantUml,
    setDesignPlantUml,
    designSvgArtifacts,
    setDesignSvgArtifacts,
    designDiagramErrors,
    setDesignDiagramErrors,
    generatedDesignDiagrams,
    setGeneratedDesignDiagrams,
    designInputFingerprints,
    setDesignInputFingerprints,
  };
}
