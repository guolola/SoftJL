// Edits the single requirement type and previews its deterministic model membership.
import { requirementModelsForType, type RequirementRuleType } from "@uml-platform/contracts";
import { useTranslation } from "react-i18next";
import { getDiagramLabel } from "../../../entities/diagram/model";
import { REQUIREMENT_KIND_ORDER } from "../../../entities/requirement-rule/model";
import { SelectControl } from "../../../shared/ui/select";

export function RequirementRuleFields({ value, onChange, disabled }: {
  value: RequirementRuleType;
  onChange: (value: RequirementRuleType) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return <div className="grid gap-3 text-sm">
    <label className="grid gap-2">{t("requirements.newRule.type")}
      <SelectControl aria-label={t("requirements.newRule.type")} disabled={disabled} value={value}
        options={REQUIREMENT_KIND_ORDER.map(type => ({ value: type, label: t(`requirementSemantics.kinds.${type}`) }))}
        onValueChange={type => onChange(type as RequirementRuleType)} />
    </label>
    <div className="grid gap-1" aria-label={t("requirements.newRule.models")}>
      <span className="font-medium">{t("requirements.newRule.models")}</span>
      <p className="text-xs leading-5 text-muted-foreground">{requirementModelsForType(value).map(diagram => getDiagramLabel(diagram, t)).join(" · ")}</p>
    </div>
  </div>;
}
