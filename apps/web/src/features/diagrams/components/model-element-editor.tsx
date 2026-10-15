// Presents every supported element field from the phase-specific contract.
import type { ModelingStage } from "@uml-platform/contracts";
import { ContractFields, modelCollectionSchema } from "./model-contract-fields";
import type { EditableCollection } from "../lib/model-editing";
type Item = Record<string, unknown>;
type Option = { value: string; label: string };
export function ModelElementEditor({ editorDraft, collection, item, itemId, updateItem, stage = "requirements", sourceRuleOptions = [] }: {
  editorDraft: Item; collection: EditableCollection; item: Item; itemId: string; stage?: ModelingStage;
  updateItem: (collection: EditableCollection, id: string, update: (item: Item) => Item) => void;
  actorOptions: Option[]; laneOptions: Option[]; messageOptions: Option[]; tableOptions: Option[]; columnsForTable: (id: string) => Option[];
  sourceRuleOptions?: Array<{ id: string; label: string }>;
}) {
  return <ContractFields owner={collection.label} schema={modelCollectionSchema(editorDraft, stage, collection.key)} value={item} model={editorDraft}
    options={{ sourceRequirementIds: sourceRuleOptions.map((rule) => ({ value: rule.id, label: rule.label })), sourceRequirementId: sourceRuleOptions.map((rule) => ({ value: rule.id, label: rule.label })) }}
    onChange={(next) => updateItem(collection, itemId, () => next as Item)} />;
}
