// Projects only explicit operation identity and accepted outputs recorded by current pipelines.
import {
  runOperationTypeSchema,
  runOutputReferenceSchema,
  type RunOperationType,
  type RunOutputReference,
} from "@uml-platform/contracts";
import type { RunRecord } from "./run-record-store.js";

export function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
function list(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}
export function modelOutputId(model: unknown): string {
  const value = object(model);
  const id = value.modelId ?? value.diagramKind;
  if (typeof id !== "string" || !id.trim()) throw new Error("Current model output identity is required");
  return id;
}
export function operationForSnapshot(value: unknown): RunOperationType {
  return runOperationTypeSchema.exclude(["unknown"]).parse(object(value).operationType);
}

export function acceptRunOutput(snapshot: RunRecord["snapshot"], reference: RunOutputReference) {
  const index = snapshot.outputManifest.findIndex(
    (item) => item.kind === reference.kind && item.id === reference.id,
  );
  if (index < 0) snapshot.outputManifest.push(reference);
  else snapshot.outputManifest[index] = reference;
}

export function acceptOutputEvent(record: RunRecord, event: RunRecord["events"][number]) {
  if (event.type !== "artifact_ready") return;
  const snapshot = record.snapshot;
  const source = object(snapshot);
  const operation = operationForSnapshot(snapshot);
  const add = (kind: RunOutputReference["kind"], id: string) =>
    acceptRunOutput(snapshot, { kind, id });
  if (event.artifactKind === "rules" && operation === "requirement_extraction") {
    for (const rule of list(source.rules)) add("rule", String(rule.id));
  }
  if (
    (event.artifactKind === "svg" || event.artifactKind === "plantuml") &&
    event.diagramKind &&
    ["requirement_modeling", "design_modeling"].includes(operation)
  ) {
    const candidates = list(source.models).filter((item) =>
      event.modelId
        ? modelOutputId(item) === event.modelId && item.diagramKind === event.diagramKind
        : item.diagramKind === event.diagramKind,
    );
    const model = candidates.length === 1 ? candidates[0] : undefined;
    if (model)
      acceptRunOutput(snapshot, {
        kind: "model",
        id: modelOutputId(model),
        diagramKind: model.diagramKind,
        sourceUseCaseId: model.sourceUseCaseId,
      });
  }
  if (
    ["requirement_modeling", "design_modeling"].includes(operation) &&
    ["coverageMatrix", "traceabilityMatrix"].includes(event.artifactKind)
  ) {
    add(event.artifactKind as "coverageMatrix" | "traceabilityMatrix", event.artifactKind);
  }
  if (operation === "feasibility_analysis") {
    if (event.artifactKind === "feasibilityContext") add("context", "context");
    if (event.artifactKind === "feasibilityBusinessFlow") add("businessFlow", "business-flow");
    if (event.artifactKind === "feasibilityImplementation")
      add("implementationPlan", "implementation");
  }
  if (event.artifactKind === "document" && operation === "document_generation" && source.documentId)
    add("document", source.documentId);
}

export function runOutputView(snapshot: RunRecord["snapshot"]) {
  const source = object(snapshot);
  const operationType = operationForSnapshot(snapshot);
  const references = runOutputReferenceSchema.array().parse(source.outputManifest);
  const has = (kind: RunOutputReference["kind"], id?: string) =>
    references.some((item) => item.kind === kind && (id === undefined || item.id === id));
  const selected = list(source.selectedDiagrams);
  const models = list(source.models).filter(
    (model) =>
      ["requirement_modeling", "design_modeling"].includes(operationType) &&
      selected.includes(model.diagramKind) &&
      has("model", modelOutputId(model)),
  );
  const projectDiagrams = (artifacts: unknown) =>
    list(artifacts).flatMap((artifact) => {
      const candidates = models.filter((model) =>
        artifact.modelId
          ? modelOutputId(model) === artifact.modelId && model.diagramKind === artifact.diagramKind
          : model.diagramKind === artifact.diagramKind,
      );
      return candidates.length === 1
        ? [{ ...artifact, modelId: modelOutputId(candidates[0]) }]
        : [];
    });
  const projected: Record<string, any> = {
    ...source,
    rules:
      operationType === "requirement_extraction"
        ? list(source.rules).filter((rule) => has("rule", String(rule.id)))
        : [],
    models,
    plantUml: projectDiagrams(source.plantUml),
    svgArtifacts: projectDiagrams(source.svgArtifacts),
    coverageMatrix: has("coverageMatrix") && models.length ? source.coverageMatrix : null,
    traceabilityMatrix:
      has("traceabilityMatrix") && models.length ? source.traceabilityMatrix : null,
    contextModel:
      has("context") && list(source.selectedArtifacts).includes("context")
        ? source.contextModel
        : null,
    contextSvg:
      has("context") && list(source.selectedArtifacts).includes("context")
        ? source.contextSvg
        : null,
    contextPlantUml:
      has("context") && list(source.selectedArtifacts).includes("context")
        ? source.contextPlantUml
        : null,
    businessFlow:
      has("businessFlow") && list(source.selectedArtifacts).includes("business-flow")
        ? source.businessFlow
        : null,
    implementationPlan:
      has("implementationPlan") && list(source.selectedArtifacts).includes("implementation")
        ? source.implementationPlan
        : null,
    documentId: has("document") ? source.documentId : null,
    fileName: has("document") ? source.fileName : null,
    sections: has("sections") || has("document") ? source.sections : [],
  };
  const targetKinds = list(source.requestedDiagrams ?? source.selectedDiagrams);
  const missingKinds = targetKinds.filter(
    (kind) => !list(source.models).some((model) => model.diagramKind === kind),
  );
  const targetErrors = Object.keys(object(source.diagramErrors)).filter((key) =>
    targetKinds.includes(key.split(":")[0]),
  );
  const expectedUseCases = (kind: string) =>
    kind === "analysis" && list(source.analysisTargetUseCaseIds).length
      ? source.analysisTargetUseCaseIds
      : kind === "sequence" && list(source.sequenceTargetUseCaseIds).length
        ? source.sequenceTargetUseCaseIds
      : list(
          list(kind === "analysis" ? source.models : source.requirementModels).find(
            (model) => model.diagramKind === "usecase",
          )?.useCases,
        ).map((item) => item.id);
  const missingUseCase = ["analysis", "sequence"].some(
    (kind) =>
      targetKinds.includes(kind) &&
      expectedUseCases(kind).some(
        (id: string) =>
          !list(source.models).some(
            (model) =>
              model.diagramKind === kind &&
              (model.sourceUseCaseId === id || modelOutputId(model) === kind + ":" + id),
          ),
      ),
  );
  const resultConsistency =
    source.status === "completed" &&
    ["requirement_modeling", "design_modeling"].includes(operationType) &&
    (missingKinds.length > 0 ||
      missingUseCase ||
      targetErrors.length > 0 ||
      missingRequestedModelOutputs(snapshot).length > 0)
      ? "missing_requested_output"
      : "consistent";
  const outputAttribution = "confirmed";
  return {
    operationType,
    outputAttribution,
    resultConsistency,
    resultIssue:
      resultConsistency === "missing_requested_output"
        ? "任务标记成功，但请求目标缺失或存在生成校验错误。"
        : null,
    references,
    snapshot: projected as RunRecord["snapshot"],
  } as const;
}

export function missingRequestedModelOutputs(snapshot: RunRecord["snapshot"]): string[] {
  const source = object(snapshot);
  const outputs = runOutputReferenceSchema.array().parse(source.outputManifest).filter((item) => item.kind === "model");
  const targets = list(source.requestedDiagrams ?? source.selectedDiagrams);
  const missing = targets.filter((kind) => !outputs.some((item) => item.diagramKind === kind));
  const analysisTargets = list(source.analysisTargetUseCaseIds);
  if (targets.includes("analysis")) {
    const useCases = analysisTargets.length
      ? analysisTargets
      : list(list(source.models).find((model) => model.diagramKind === "usecase")?.useCases).map(
          (item) => item.id,
        );
    for (const id of useCases)
      if (!outputs.some((item) => item.diagramKind === "analysis" && item.sourceUseCaseId === id))
        missing.push(`analysis:${id}`);
  }
  if (targets.includes("sequence")) {
    const useCases = list(source.sequenceTargetUseCaseIds).length ? source.sequenceTargetUseCaseIds : list(
      list(source.requirementModels).find((model) => model.diagramKind === "usecase")?.useCases,
    ).map((item) => item.id);
    for (const id of useCases)
      if (!outputs.some((item) => item.diagramKind === "sequence" && item.sourceUseCaseId === id))
        missing.push(`sequence:${id}`);
  }
  return [...new Set(missing)];
}
