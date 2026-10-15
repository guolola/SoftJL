// Provides reusable labeled form controls for diagram model editing dialogs.
import { useId } from "react";
import { Checkbox } from "../../../shared/ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../../../shared/ui/field";
import { Input } from '../../../shared/ui/input';
import { Textarea } from '../../../shared/ui/textarea';
import { SelectControl } from "../../../shared/ui/select";
import { useTranslation } from "react-i18next";
import { i18n } from "../../../shared/i18n/i18n";

export function LabelTextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full border px-4 text-sm"
      />
    </Field>
  );
}

export function LabelTextarea({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const id = useId();
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        aria-label={label}
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border px-4 py-2 text-sm"
      />
    </Field>
  );
}

export function LabelSelect({
  label,
  value,
  options,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const normalizedOptions = allowEmpty
    ? [{ value: "", label: t("diagramEditor.none") }, ...options]
    : options;

  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <SelectControl
        id={id}
        aria-label={label}
        value={value}
        onValueChange={onChange}
        options={normalizedOptions}
        placeholder={t("diagramEditor.selectPlaceholder")}
        className="h-9 text-sm"
      />
    </Field>
  );
}

export function LabelCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal" className="min-h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-foreground">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onChange}
      />
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
    </Field>
  );
}

export function SourceRuleChecklist({
  selectedIds,
  options,
  onChange,
}: {
  selectedIds: string[];
  options: Array<{ id: string; label: string }>;
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <FieldSet className="gap-3 rounded-md border border-border bg-muted/20 p-3">
      <FieldLegend className="mb-0 px-1 text-sm">{t("diagramEditor.sourceRules")}</FieldLegend>
      {options.length === 0 ? (
        <p className="text-xs text-destructive">{t("diagramEditor.noSourceRules")}</p>
      ) : (
        <FieldGroup className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const checked = selectedIds.includes(option.id);
            return (
              <LabelCheckbox
                key={option.id}
                label={t("diagramEditor.sourceRuleLabel", { id: option.id, label: option.label })}
                checked={checked}
                onChange={(nextChecked) =>
                  onChange(
                    nextChecked
                      ? Array.from(new Set([...selectedIds, option.id]))
                      : selectedIds.filter((id) => id !== option.id),
                  )
                }
              />
            );
          })}
        </FieldGroup>
      )}
    </FieldSet>
  );
}

export function enumOptions(options: string[]) {
  return options.map((option) => ({ value: option, label: option }));
}

export function ordinalLabel(index: number, unit: string) {
  const unitKey = ({ "属性": "attribute", "字段": "column", "参数": "parameter", "操作": "operation" } as Record<string, string>)[unit] ?? (["attribute", "column", "parameter", "operation"].includes(unit) ? unit : undefined);
  return unitKey
    ? i18n.t("diagramEditor.ordinal", { index: index + 1, unit: i18n.t(`diagramEditor.units.${unitKey}`) })
    : i18n.t("diagramEditor.ordinal", { index: index + 1, unit });
}

const EDITOR_OWNER_KEYS: Record<string, string> = {
  "中心系统": "system", "人员": "person", "外部系统": "externalSystem", "角色": "actor", "用例": "useCase",
  "系统边界": "boundary", "类": "class", "接口": "interface", "枚举": "enum", "泳道": "lane",
  "活动节点": "activityNode", "部署节点": "deploymentNode", "数据库": "database", "组件": "component",
  "制品": "artifact", "参与对象": "participant", "组合片段": "fragment", "数据表": "table",
};

export function editorOwnerLabel(ownerLabel: string) {
  const ownerKey = EDITOR_OWNER_KEYS[ownerLabel];
  return ownerKey ? i18n.t(`diagramEditor.owners.${ownerKey}`) : ownerLabel;
}

export function editorFieldLabel(ownerLabel: string, fieldLabel: string) {
  const fieldKey = ({ "名称": "name", "说明": "description", "类型": "type", "职责": "responsibilities", "目标": "goal", "主参与者": "primaryActor", "前置条件": "preconditions", "后置条件": "postconditions", "辅助参与者": "supportingActors", "构造型": "stereotype", "字面量": "literals", "问题": "question", "泳道": "lane", "输入": "input", "输出": "output", "环境": "environment", "引擎": "engine", "组件类型": "componentType", "制品类型": "artifactType", "条件": "condition", "包含消息": "messages" } as Record<string, string>)[fieldLabel] ?? (["name", "description", "type", "responsibilities", "goal", "primaryActor", "preconditions", "postconditions", "supportingActors", "stereotype", "literals", "question", "lane", "input", "output", "environment", "engine", "componentType", "artifactType", "condition", "messages", "visibility", "multiplicity", "primaryKey", "foreignKey", "nullable", "referenceTable", "referenceColumn"].includes(fieldLabel) ? fieldLabel : undefined);
  const owner = editorOwnerLabel(ownerLabel);
  const tableField = fieldKey && ["primaryKey", "foreignKey", "nullable", "referenceTable", "referenceColumn"].includes(fieldKey);
  const field = fieldKey
    ? i18n.t(tableField ? `requirements.editorTable.${fieldKey}` : `diagramEditor.fields.${fieldKey}`)
    : fieldLabel;
  return i18n.t("diagramEditor.fieldLabel", { owner, field });
}

export function namedActionLabel(action: string, kind: string, name: string) {
  return i18n.t("diagramEditor.namedAction", {
    action,
    kind,
    name: name || i18n.t("diagramEditor.unnamed", { kind }),
  });
}
