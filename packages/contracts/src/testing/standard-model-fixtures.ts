// Supplies current quick-modeling payloads for API, UI and persistence regression tests.
import { standardModelSchema, standardModelStage, type StandardDiagramKind, type StandardModel } from "../workspace/standard-project.js";
import { modelFixture } from "./model-fixtures.js";

export function standardModelFixture<K extends StandardDiagramKind>(kind: K): Extract<StandardModel, { diagramKind: K }> {
  const model = kind === "er" ? {
    diagramKind: "er" as const, title: "概念 E-R 图", summary: "借阅", notes: [],
    entities: [{ id: "book", name: "图书", attributes: [{ id: "isbn", name: "ISBN", isKey: true }] }, { id: "reader", name: "读者", attributes: [] }],
    relationships: [{ id: "borrows", name: "借阅", sourceId: "reader", targetId: "book", sourceMultiplicity: "1", targetMultiplicity: "*" }],
  } : modelFixture(standardModelStage(kind), kind);
  if (model.diagramKind === "sequence") delete model.sourceUseCaseId;
  return standardModelSchema.parse(model) as Extract<StandardModel, { diagramKind: K }>;
}
