// Reuses structural editors without engineering review or dependency workflows.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { standardModelStage, validateStandardModel, type StandardDiagram, type StandardModel } from "@uml-platform/contracts";
import type { DiagramDetailItem } from "../../../entities/diagram/lib/model-details";
import { ModelEditPanel } from "../../diagrams/components/model-edit-panel";
import { StandardErEditPanel } from "./standard-er-edit-panel";

export type StandardModelEditProps = {
  diagram: StandardDiagram; disabled: boolean; readOnly: boolean; section?: "all" | "elements" | "relations";
  selectedElement?: DiagramDetailItem; onSelectElement: (item: DiagramDetailItem) => void;
  onSave: (model: StandardModel) => Promise<boolean | undefined>;
};

export function StandardModelEditPanel(props: StandardModelEditProps) {
  const { diagram, disabled, readOnly, section = "all", selectedElement, onSelectElement, onSave } = props;
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Record<string, unknown> | null>(diagram.model ? structuredClone(diagram.model) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  useEffect(() => { setDraft(diagram.model ? structuredClone(diagram.model) : null); setError(""); }, [diagram.id, diagram.model]);
  if (!diagram.model) return null;
  if (diagram.model.diagramKind === "er") return <StandardErEditPanel {...props} model={diagram.model} />;
  const commit = async (next: Record<string, unknown>) => {
    if (disabled || readOnly || busy.current) return false;
    // Failed edits remain available as drafts; preview changes only after server confirmation.
    setError("");
    let model: StandardModel;
    try { model = validateStandardModel(diagram.kind, next); }
    catch { setError(t("standardProject.detail.invalidStructure")); return false; }
    busy.current = true; setSaving(true);
    try {
      if (await onSave(model)) { setDraft(model); return true; }
      setError(t("diagrams.detail.saveFailedToast")); return false;
    }
    catch { setError(t("diagrams.detail.saveFailedToast")); return false; }
    finally { busy.current = false; setSaving(false); }
  };
  return <div className="space-y-4">
    {!readOnly && disabled && <p className="text-sm text-muted-foreground">{t("standardProject.generationBlocked")}</p>}
    <ModelEditPanel draft={draft} setDraft={setDraft} onCommitDraft={commit} onSelectElement={onSelectElement} showSourceReferences={false} retainEditorsOnFailure commitError={error}
      selectedElement={selectedElement} saving={saving || (!readOnly && disabled)} readOnly={readOnly}
      stage={standardModelStage(diagram.model.diagramKind)} modelingScope="standard" visibleSection={section === "relations" ? "relationships" : section} />
  </div>;
}
