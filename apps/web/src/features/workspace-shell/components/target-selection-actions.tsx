// Bulk select / clear actions shown next to a target-model selection count.
import { useTranslation } from "react-i18next";
import { ListChecks, ListX } from "lucide-react";
import { ButtonGroup } from "../../../shared/ui/button-group";
import { RippleButton } from "../../../shared/ui/ripple-button";

export function TargetSelectionActions({
  disabled,
  onSelectAll,
  onClear,
}: {
  disabled?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ButtonGroup aria-label={`${t("common.selectAll")} / ${t("common.selectNone")}`}>
      <RippleButton type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => { if (!disabled) onSelectAll(); }}>
        <ListChecks className="size-3.5" />
        {t("common.selectAll")}
      </RippleButton>
      <RippleButton type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => { if (!disabled) onClear(); }}>
        <ListX className="size-3.5" />
        {t("common.selectNone")}
      </RippleButton>
    </ButtonGroup>
  );
}
