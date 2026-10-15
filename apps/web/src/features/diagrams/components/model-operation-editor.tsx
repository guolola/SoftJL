// Renders class/interface operation and parameter edit fields for the model element editor.
import { Card } from "../../../shared/ui/card";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import {
  booleanValue,
  setOptionalStringValue,
  stringValue,
  type EditableCollection,
} from "../lib/model-editing";
import {
  LabelCheckbox,
  LabelSelect,
  LabelTextInput,
  LabelTextarea,
  enumOptions,
  ordinalLabel,
} from "./model-edit-fields";

type UpdateElementItem = (
  collection: EditableCollection,
  itemId: string,
  updater: (item: Record<string, unknown>) => Record<string, unknown>,
) => void;

export function OperationEditors({
  collection,
  item,
  itemId,
  ownerLabel,
  updateItem,
}: {
  collection: EditableCollection;
  item: Record<string, unknown>;
  itemId: string;
  ownerLabel: string;
  updateItem: UpdateElementItem;
}) {
  const { t } = useTranslation();
  const operations = Array.isArray(item.operations)
    ? (item.operations as Array<Record<string, unknown>>)
    : [];
  const updateOperation = (
    operationIndex: number,
    updater: (operation: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    updateItem(collection, itemId, (currentItem) => {
      const nextOperations = (Array.isArray(currentItem.operations)
        ? (currentItem.operations as Array<Record<string, unknown>>)
        : []
      ).map((operation, index) =>
        index === operationIndex ? updater(operation) : operation,
      );
      return { ...currentItem, operations: nextOperations };
    });
  };
  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-foreground">{t("diagramOperations.title")}</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() =>
            updateItem(collection, itemId, (currentItem) => ({
              ...currentItem,
              operations: [
                ...(Array.isArray(currentItem.operations)
                  ? currentItem.operations
                  : []),
                { name: "newOperation", visibility: "public", parameters: [] },
              ],
            }))
          }
        >
          <Plus className="size-3" /> {t("diagramOperations.addOperation")}
        </Button>
      </div>
      {operations.map((operation, operationIndex) => {
        const operationLabel = ordinalLabel(operationIndex, "operation");
        const parameters = Array.isArray(operation.parameters)
          ? (operation.parameters as Array<Record<string, unknown>>)
          : [];
        return (
          <Card
            key={`${ownerLabel}:operation:${operationIndex}`}
            className="gap-0 py-0 space-y-2 p-3"
          >
            <div className="grid gap-2 md:grid-cols-3">
              <LabelTextInput
                label={t("diagramOperations.fields.name", { owner: operationLabel })}
                value={stringValue(operation.name)}
                onChange={(value) =>
                  updateOperation(operationIndex, (current) => ({
                    ...current,
                    name: value,
                  }))
                }
              />
              <LabelTextInput
                label={t("diagramOperations.fields.returnType", { owner: operationLabel })}
                value={stringValue(operation.returnType)}
                onChange={(value) =>
                  updateOperation(operationIndex, (current) => {
                    const next = { ...current };
                    setOptionalStringValue(next, "returnType", value);
                    return next;
                  })
                }
              />
              <LabelSelect
                label={t("diagramOperations.fields.visibility", { owner: operationLabel })}
                value={stringValue(operation.visibility) || "public"}
                options={enumOptions([
                  "public",
                  "protected",
                  "private",
                  "package",
                ])}
                onChange={(value) =>
                  updateOperation(operationIndex, (current) => ({
                    ...current,
                    visibility: value,
                  }))
                }
              />
            </div>
            <LabelTextarea
              label={t("diagramOperations.fields.description", { owner: operationLabel })}
              value={stringValue(operation.description)}
              onChange={(value) =>
                updateOperation(operationIndex, (current) => {
                  const next = { ...current };
                  setOptionalStringValue(next, "description", value);
                  return next;
                })
              }
            />
            <OperationParameterEditors
              operationLabel={operationLabel}
              operationIndex={operationIndex}
              parameters={parameters}
              updateOperation={updateOperation}
            />
          </Card>
        );
      })}
    </div>
  );
}

function OperationParameterEditors({
  operationLabel,
  operationIndex,
  parameters,
  updateOperation,
}: {
  operationLabel: string;
  operationIndex: number;
  parameters: Array<Record<string, unknown>>;
  updateOperation: (
    operationIndex: number,
    updater: (operation: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">{t("diagramOperations.parameters")}</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() =>
            updateOperation(operationIndex, (current) => ({
              ...current,
              parameters: [
                ...(Array.isArray(current.parameters) ? current.parameters : []),
                { name: "param", type: "string", required: true },
              ],
            }))
          }
        >
          <Plus className="size-3" /> {t("diagramOperations.addParameter")}
        </Button>
      </div>
      {parameters.map((parameter, parameterIndex) => {
        const parameterLabel = t("diagramOperations.parameterOwner", {
          operation: operationLabel,
          parameter: ordinalLabel(parameterIndex, "parameter"),
        });
        return (
          <div
            key={`${operationLabel}:parameter:${parameterIndex}`}
            className="grid gap-2 md:grid-cols-4"
          >
            <LabelTextInput
              label={t("diagramOperations.fields.name", { owner: parameterLabel })}
              value={stringValue(parameter.name)}
              onChange={(value) =>
                updateOperation(operationIndex, (current) => ({
                  ...current,
                  parameters: parameters.map((currentParameter, index) =>
                    index === parameterIndex
                      ? { ...currentParameter, name: value }
                      : currentParameter,
                  ),
                }))
              }
            />
            <LabelTextInput
              label={t("diagramOperations.fields.type", { owner: parameterLabel })}
              value={stringValue(parameter.type)}
              onChange={(value) =>
                updateOperation(operationIndex, (current) => ({
                  ...current,
                  parameters: parameters.map((currentParameter, index) =>
                    index === parameterIndex
                      ? { ...currentParameter, type: value }
                      : currentParameter,
                  ),
                }))
              }
            />
            <LabelSelect
              label={t("diagramOperations.fields.direction", { owner: parameterLabel })}
              value={stringValue(parameter.direction)}
              options={enumOptions(["in", "out", "inout"])}
              allowEmpty
              onChange={(value) =>
                updateOperation(operationIndex, (current) => ({
                  ...current,
                  parameters: parameters.map((currentParameter, index) => {
                    if (index !== parameterIndex) return currentParameter;
                    const next = { ...currentParameter };
                    setOptionalStringValue(next, "direction", value);
                    return next;
                  }),
                }))
              }
            />
            <LabelCheckbox
              label={t("diagramOperations.fields.required", { owner: parameterLabel })}
              checked={booleanValue(parameter.required, true)}
              onChange={(checked) =>
                updateOperation(operationIndex, (current) => ({
                  ...current,
                  parameters: parameters.map((currentParameter, index) =>
                    index === parameterIndex
                      ? { ...currentParameter, required: checked }
                      : currentParameter,
                  ),
                }))
              }
            />
          </div>
        );
      })}
    </div>
  );
}
