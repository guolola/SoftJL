// Supplies a complete rendered business-flow fixture for dependency, replay and persistence tests.
import { buildAcceptedRequirementSnapshot, feasibilityBusinessFlowArtifactSchema } from "@uml-platform/contracts";

export function createBusinessFlowArtifact(rules: unknown, baseline: unknown = null) {
  const source = buildAcceptedRequirementSnapshot(rules, baseline);
  return feasibilityBusinessFlowArtifactSchema.parse({
    model: { diagramKind: "activity", modelId: "feasibility-business-flow", title: "业务与系统流程图", summary: "处理业务规则", notes: [],
      swimlanes: [{ id: "system", name: "系统" }],
      nodes: [{ id: "start", type: "start" }, { id: "process", type: "activity", name: "处理业务", actorOrLane: "system", input: [], output: [] }, { id: "end", type: "end" }],
      relationships: [{ id: "e1", type: "control_flow", sourceId: "start", targetId: "process" }, { id: "e2", type: "control_flow", sourceId: "process", targetId: "end" }] },
    traceability: [{ requirementId: source.rules[0]!.id, targetId: "process", targetKind: "node" }],
    plantUml: { diagramKind: "activity", modelId: "feasibility-business-flow", source: "@startuml\nstart\n:处理业务;\nstop\n@enduml" },
    svg: { diagramKind: "activity", modelId: "feasibility-business-flow", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text>业务流程</text></svg>',
      renderMeta: { engine: "test", generatedAt: "2026-07-19T00:00:00.000Z", sourceLength: 45, durationMs: 1 } },
    fingerprint: source.snapshot.fingerprint,
  });
}
