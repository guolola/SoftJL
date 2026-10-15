// Limits relationship fields and endpoint choices using the shared phase contract and endpoint matrix.
import { isModelRelationshipAllowed, type ModelingStage } from "@uml-platform/contracts";
import { ContractFields, modelCollectionSchema } from "./model-contract-fields";
import { draftGraphElements, stringValue } from "../lib/model-editing";
type Item = Record<string, unknown>;
export function ModelRelationEditor({ editorDraft, relation, relationId, updateRelation, stage = "requirements", sourceRuleOptions = [] }: {
  editorDraft: Item; relation: Item; relationId: string; stage?: ModelingStage;
  endpointOptions: Array<{ id: string; label: string }>; columnsForTable: (id: string) => Array<{ value: string; label: string }>;
  updateRelation: (id: string, updater: (item: Item) => Item) => void; sourceRuleOptions?: Array<{ id: string; label: string }>;
}) {
  const kind = stringValue(editorDraft.diagramKind), type = stringValue(relation.type) || "communication";
  const elements = draftGraphElements(editorDraft);
  const choices = (side: "source" | "target") => elements.filter((candidate) => elements.some((other) =>
    isModelRelationshipAllowed(kind, type, side === "source" ? candidate.kind : other.kind, side === "target" ? candidate.kind : other.kind) &&
    (side === "source" || !relation.sourceId || other.id === relation.sourceId)))
    .map((item) => ({ value: item.id, label: `${item.name} (${item.id})` }));
  return <ContractFields schema={modelCollectionSchema(editorDraft, stage, ["analysis", "sequence"].includes(kind) ? "messages" : "relationships")}
    value={relation} model={editorDraft} options={{ sourceRequirementIds: sourceRuleOptions.map((rule) => ({ value: rule.id, label: rule.label })), sourceId: choices("source"), targetId: choices("target") }}
    onChange={(next) => updateRelation(relationId, () => next as Item)} />;
}
