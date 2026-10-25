// Projects declared generation sources for display without coverage audits or completion gates.
import { coverageMatrixSchema, traceabilityMatrixSchema, type CoverageMatrix, type TraceabilityMatrix, type RequirementBaseline, type DiagramModelSpec, type DesignDiagramModelSpec, type ModelElementRef, type RequirementModelTraceabilityEntry, type DesignModelTraceabilityEntry, type TraceabilityLink, type TraceabilityArtifactType } from "@uml-platform/contracts";

export type TrustedChainArtifacts = { coverageMatrix: CoverageMatrix; traceabilityMatrix: TraceabilityMatrix };
type RequirementStageInput = { runId: string; baseline: RequirementBaseline; models: DiagramModelSpec[]; requirementModelTraceability: RequirementModelTraceabilityEntry[] };
type DesignStageInput = RequirementStageInput & { designModels: DesignDiagramModelSpec[]; designModelTraceability: DesignModelTraceabilityEntry[] };
const refId = (ref: ModelElementRef) => `${ref.modelId ? `${ref.modelId}:` : ""}${ref.diagramKind}:${ref.elementId}`;
const key = (type: string, id: string) => `${type}:${id}`;

function project(input: RequirementStageInput, design?: DesignStageInput): TrustedChainArtifacts {
  const links: TraceabilityLink[] = [];
  const rules = new Map(input.baseline.rules.map(rule => [rule.id, rule.requirementId]));
  const origins = new Map<string, Set<string>>();
  const artifacts = new Map<string, { type: "requirements-model" | "design-model"; id: string }>();
  const edges: Array<{ from: string; to: string }> = [];
  const connect = (fromType: TraceabilityArtifactType, from: string, toType: TraceabilityArtifactType, to: string) => {
    links.push({ fromArtifactType: fromType, fromArtifactId: from, toArtifactType: toType, toArtifactId: to, linkType: toType === "design-model" ? "refines" : "satisfies", confidence: 1, rationale: "首次生成声明的元素来源" });
    links.push({ fromArtifactType: toType, fromArtifactId: to, toArtifactType: fromType, toArtifactId: from, linkType: "derives-from", confidence: 1, rationale: "首次生成声明的直接上游" });
    edges.push({ from: key(fromType, from), to: key(toType, to) });
    if (toType === "requirements-model" || toType === "design-model") artifacts.set(key(toType, to), { type: toType, id: to });
  };
  for (const entry of input.requirementModelTraceability) {
    const ruleId = rules.get(entry.ruleId) ?? entry.ruleId;
    origins.set(key("requirement", ruleId), new Set([ruleId]));
    connect("requirement", ruleId, "requirements-model", refId(entry.target));
  }
  for (const model of input.models) {
    if (model.diagramKind !== "analysis") continue;
    const upstream = input.models.find(source => source.diagramKind === "usecase" && source.useCases.some(useCase => useCase.id === model.sourceUseCaseId));
    if (!upstream) continue;
    for (const element of [...model.participants, ...model.messages, ...model.fragments]) {
      for (const sourceId of element.sourceElementIds ?? []) connect("requirements-model", refId({ modelId: upstream.modelId, diagramKind: "usecase", elementId: sourceId, elementKind: "element", label: sourceId }), "requirements-model", refId({ modelId: model.modelId, diagramKind: "analysis", elementId: element.id, elementKind: "element", label: element.id }));
    }
  }
  for (const entry of design?.designModelTraceability ?? []) {
    for (const target of entry.targets) {
      const designTarget = design!.designModels.some(model => model.diagramKind === target.diagramKind && model.modelId === target.modelId);
      connect(designTarget ? "design-model" : "requirements-model", refId(target), "design-model", refId(entry.source));
    }
  }
  // Follow only declared edges, including design -> design chains; no missing links are invented.
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      const target = origins.get(edge.to) ?? new Set<string>();
      for (const rule of origins.get(edge.from) ?? []) if (!target.has(rule)) { target.add(rule); changed = true; }
      origins.set(edge.to, target);
    }
  }
  const rows = input.baseline.rules.map(rule => {
    const modelElements: string[] = [], designElements: string[] = [];
    for (const [id, artifact] of artifacts) if (origins.get(id)?.has(rule.requirementId)) (artifact.type === "design-model" ? designElements : modelElements).push(artifact.id);
    return { requirementId: rule.requirementId, status: modelElements.length || designElements.length ? "covered" : "pending-review", rationale: "按首次生成声明展示来源，不执行覆盖检查", modelElements, designElements, tests: [], reviewItems: [] };
  });
  return { coverageMatrix: coverageMatrixSchema.parse({ runId: input.runId, rows }), traceabilityMatrix: traceabilityMatrixSchema.parse({ runId: input.runId, links, diagnostics: [] }) };
}
export function buildRequirementStageTrustedChain(input: RequirementStageInput) { return project(input); }
export function buildDesignStageTrustedChain(input: DesignStageInput) { return project(input, input); }
