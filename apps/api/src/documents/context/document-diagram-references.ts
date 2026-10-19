// Binds report sections and image artifacts to the same saved model identity.
import type { DocumentSection, StartDocumentRunRequest } from "@uml-platform/contracts";

type Stage = "requirement" | "design";
type Identity = { diagramKind: string; modelId?: string };

function sources(input: StartDocumentRunRequest, stage: Stage) {
  return stage === "requirement"
    ? { models: input.requirementModels, plantUml: input.requirementPlantUml, svg: input.requirementSvgArtifacts }
    : { models: input.designModels, plantUml: input.designPlantUml, svg: input.designSvgArtifacts };
}

function modelIds(input: StartDocumentRunRequest, stage: Stage, kind: string) {
  const inventory = sources(input, stage);
  const models = inventory.models.filter(model => model.diagramKind === kind);
  // Some current artifact contracts omit modelId. Resolve them only when the saved source is unambiguous.
  const artifacts = [...inventory.plantUml, ...inventory.svg].filter(artifact => artifact.diagramKind === kind);
  return [...new Set((models.length ? models : artifacts).map(item => item.modelId ?? item.diagramKind))];
}

function identityFor(input: StartDocumentRunRequest, stage: Stage, item: Identity) {
  if (item.modelId) return item.modelId;
  const ids = modelIds(input, stage, item.diagramKind);
  if (ids.length > 1) throw new Error(`说明书图源引用不明确：${stage}:${item.diagramKind}，必须指定模型 ID`);
  return ids[0] ?? item.modelId ?? item.diagramKind;
}

export function documentDiagramReference(input: StartDocumentRunRequest, stage: Stage, item: Identity) {
  const id = identityFor(input, stage, item);
  // The design report reuses a requirement diagram; its stage stays part of the document reference.
  return input.documentKind === "softwareDesignSpec" && stage === "requirement" ? `requirement:${id}` : id;
}

export function bindDocumentDiagramReferences(input: StartDocumentRunRequest, sections: DocumentSection[]): DocumentSection[] {
  return sections.map(section => {
    if (!section.diagramKind) return section;
    const requirementFlow = input.documentKind === "softwareDesignSpec" && section.diagramKind === "activity" && section.diagramModelId?.startsWith("requirement:");
    const stage: Stage = input.documentKind === "softwareDesignSpec" && !requirementFlow ? "design" : "requirement";
    const modelId = requirementFlow ? section.diagramModelId!.slice("requirement:".length) : section.diagramModelId;
    return { ...section, diagramModelId: documentDiagramReference(input, stage, { diagramKind: section.diagramKind, modelId }) };
  });
}

export function documentDiagramAssets(input: StartDocumentRunRequest) {
  const plantUml = new Map<string, string>();
  const svg = new Set<string>();
  const stages: Stage[] = input.documentKind === "softwareDesignSpec" ? ["design", "requirement"] : ["requirement"];
  for (const stage of stages) {
    const inventory = sources(input, stage);
    const included = (item: Identity) => stage !== "requirement" || input.documentKind !== "softwareDesignSpec" || item.diagramKind === "activity";
    for (const artifact of inventory.plantUml.filter(included)) {
      const key = documentDiagramReference(input, stage, artifact);
      if (plantUml.has(key) && plantUml.get(key) !== artifact.source) throw new Error(`说明书图源 ID 重复：${key}`);
      plantUml.set(key, artifact.source);
    }
    for (const artifact of inventory.svg.filter(included)) svg.add(documentDiagramReference(input, stage, artifact));
  }
  return { plantUml, svg };
}
