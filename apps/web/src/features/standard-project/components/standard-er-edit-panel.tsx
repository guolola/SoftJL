// Edits Chen entities, identifying attributes and named relationships independently of SQL tables.
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { validateStandardModel, type StandardModel } from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { buildStandardDiagramDetail } from "../lib/standard-diagram-detail";
import type { StandardModelEditProps } from "./standard-model-edit-panel";

type ErModel = Extract<StandardModel, { diagramKind: "er" }>;
type Editor = { kind: "entity"; value: ErModel["entities"][number]; create: boolean }
  | { kind: "relationship"; value: ErModel["relationships"][number]; create: boolean };

export function StandardErEditPanel({ model, disabled, readOnly, section = "all", onSelectElement, onSave }: StandardModelEditProps & { model: ErModel }) {
  const { t } = useTranslation();
  const copy = (key: string) => t(`standardProject.erEditor.${key}`);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<{ kind: Editor["kind"]; id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const busy = useRef(false);
  const blocked = disabled || readOnly || saving;
  const detail = buildStandardDiagramDetail(model);
  const field = (label: string, control: ReactNode) => <label className="block space-y-2 text-sm font-medium"><span>{label}</span>{control}</label>;
  const open = (next: Editor) => { if (!blocked) { setError(""); setEditor(next); } };
  const commit = async (next: ErModel) => {
    if (blocked || busy.current) return;
    setError("");
    let current: StandardModel;
    try { current = validateStandardModel("er", next); }
    catch { setError(t("standardProject.detail.invalidStructure")); return; }
    busy.current = true; setSaving(true);
    try {
      if (await onSave(current)) { setEditor(null); setDeleting(null); }
      else setError(t("diagrams.detail.saveFailedToast"));
    } catch { setError(t("diagrams.detail.saveFailedToast")); }
    finally { busy.current = false; setSaving(false); }
  };
  const commitEditor = () => {
    if (!editor) return;
    if (editor.kind === "entity") void commit({ ...model, entities: editor.create ? [...model.entities, editor.value] : model.entities.map(item => item.id === editor.value.id ? editor.value : item) });
    else void commit({ ...model, relationships: editor.create ? [...model.relationships, editor.value] : model.relationships.map(item => item.id === editor.value.id ? editor.value : item) });
  };
  const endpointOptions = model.entities.map(entity => ({ value: entity.id, label: entity.name }));
  return <div className="space-y-5">
    {!readOnly && disabled && <p className="text-sm text-muted-foreground">{t("standardProject.generationBlocked")}</p>}
    <Input aria-label={copy("search")} placeholder={copy("search")} value={search} onChange={event => setSearch(event.target.value)} />
    {(section === "all" || section === "elements") && <section className="space-y-3" aria-label={copy("entity")}>
      {!readOnly && <Button disabled={blocked} onClick={() => open({ kind: "entity", create: true, value: { id: `entity_${crypto.randomUUID()}`, name: "", attributes: [] } })}>{copy("addEntity")}</Button>}
      {model.entities.filter(entity => `${entity.name} ${entity.attributes.map(attribute => attribute.name).join(" ")}`.includes(search)).map(entity => <div className="space-y-2 rounded-xl border p-4" key={entity.id}>
        <Button variant="ghost" onClick={() => onSelectElement(detail.items.find(item => item.id === entity.id)!)}>{entity.name}</Button>
        <p className="text-sm text-muted-foreground">{entity.attributes.map(attribute => `${attribute.name}${attribute.isKey ? ` (${copy("identifying")})` : ""}`).join("、")}</p>
        {!readOnly && <div className="flex gap-2"><Button variant="outline" disabled={blocked} aria-label={`${t("diagramLists.actions.edit")} ${copy("entity")} ${entity.name}`} onClick={() => open({ kind: "entity", create: false, value: structuredClone(entity) })}>{t("diagramLists.actions.edit")}</Button>
          <Button variant="outline" disabled={blocked} aria-label={`${t("diagramLists.actions.delete")} ${copy("entity")} ${entity.name}`} onClick={() => { setError(""); setDeleting({ kind: "entity", id: entity.id, name: entity.name }); }}>{t("diagramLists.actions.delete")}</Button></div>}
      </div>)}
    </section>}
    {(section === "all" || section === "relations") && <section className="space-y-3" aria-label={copy("relationships")}>
      {!readOnly && <Button disabled={blocked || !model.entities.length} onClick={() => open({ kind: "relationship", create: true, value: { id: `relation_${crypto.randomUUID()}`, name: "", sourceId: model.entities[0]!.id, targetId: model.entities[1]?.id ?? model.entities[0]!.id, sourceMultiplicity: "1", targetMultiplicity: "*" } })}>{copy("addRelationship")}</Button>}
      {model.relationships.filter(relation => relation.name.includes(search)).map(relation => <div className="space-y-2 rounded-xl border p-4" key={relation.id}>
        <p>{relation.name} · {endpointOptions.find(item => item.value === relation.sourceId)?.label}（{relation.sourceMultiplicity}）→ {endpointOptions.find(item => item.value === relation.targetId)?.label}（{relation.targetMultiplicity}）</p>
        {!readOnly && <div className="flex gap-2"><Button variant="outline" disabled={blocked} aria-label={`${t("diagramLists.actions.edit")} ${copy("relationships")} ${relation.name}`} onClick={() => open({ kind: "relationship", create: false, value: { ...relation } })}>{t("diagramLists.actions.edit")}</Button>
          <Button variant="outline" disabled={blocked} onClick={() => { setError(""); setDeleting({ kind: "relationship", id: relation.id, name: relation.name }); }}>{t("diagramLists.actions.delete")}</Button></div>}
      </div>)}
    </section>}
    {!editor && !deleting && error && <p role="alert">{error}</p>}
    <Dialog open={Boolean(editor)} onOpenChange={value => { if (!value && !saving) setEditor(null); }}>
      <DialogContent className="max-h-[88svh] overflow-auto sm:max-w-2xl" showCloseButton={!saving}>
        <DialogHeader><DialogTitle>{editor?.create ? t("common.add") : t("diagramLists.actions.edit")} {editor?.kind === "entity" ? copy("entity") : copy("relationships")}</DialogTitle><DialogDescription>{t("standardProject.structureOnly")}</DialogDescription></DialogHeader>
        {editor && field(editor.kind === "entity" ? copy("entityName") : copy("relationshipName"), <Input disabled={blocked} value={editor.value.name} onChange={event => setEditor({ ...editor, value: { ...editor.value, name: event.target.value } } as Editor)} />)}
        {editor?.kind === "entity" && <div className="space-y-3">
          {editor.value.attributes.map((attribute, index) => <div key={attribute.id} className="flex items-end gap-2">
            {field(t("standardProject.erEditor.attribute", { index: index + 1 }), <Input value={attribute.name} disabled={blocked} onChange={event => setEditor({ ...editor, value: { ...editor.value, attributes: editor.value.attributes.map(item => item.id === attribute.id ? { ...item, name: event.target.value } : item) } })} />)}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={blocked} checked={attribute.isKey} onChange={event => setEditor({ ...editor, value: { ...editor.value, attributes: editor.value.attributes.map(item => item.id === attribute.id ? { ...item, isKey: event.target.checked } : item) } })} />{copy("identifying")}</label>
            <Button variant="outline" disabled={blocked} aria-label={`${t("diagramLists.actions.delete")} ${attribute.name || index + 1}`} onClick={() => setEditor({ ...editor, value: { ...editor.value, attributes: editor.value.attributes.filter(item => item.id !== attribute.id) } })}>{t("diagramLists.actions.delete")}</Button>
          </div>)}
          <Button variant="outline" disabled={blocked} onClick={() => setEditor({ ...editor, value: { ...editor.value, attributes: [...editor.value.attributes, { id: `attribute_${crypto.randomUUID()}`, name: "", isKey: false }] } })}>{copy("addAttribute")}</Button>
        </div>}
        {editor?.kind === "relationship" && <>
          {(["sourceId", "targetId"] as const).map((key, index) => <div key={key}>{field(index === 0 ? copy("source") : copy("target"), <SelectControl value={editor.value[key]} disabled={blocked} options={endpointOptions} onValueChange={value => setEditor({ ...editor, value: { ...editor.value, [key]: value } })} />)}</div>)}
          {(["sourceMultiplicity", "targetMultiplicity"] as const).map((key, index) => <div key={key}>{field(index === 0 ? copy("sourceMultiplicity") : copy("targetMultiplicity"), <Input value={editor.value[key]} disabled={blocked} placeholder={copy("multiplicityHint")} onChange={event => setEditor({ ...editor, value: { ...editor.value, [key]: event.target.value } })} />)}</div>)}
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setEditor(null)}>{t("common.cancel")}</Button><Button disabled={blocked || !editor?.value.name.trim()} onClick={commitEditor}>{t("standardProject.saveDiagram")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={value => { if (!value && !saving) setDeleting(null); }}><DialogContent showCloseButton={!saving}>
      <DialogHeader><DialogTitle>{t("standardProject.detail.deleteTitle", { name: deleting?.name })}</DialogTitle><DialogDescription>{t("standardProject.detail.deleteDescription")}</DialogDescription></DialogHeader>
      {error && <p role="alert">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>{t("common.cancel")}</Button><Button variant="destructive" disabled={blocked} onClick={() => {
        if (!deleting) return;
        // Delete incident relationships atomically with their entity.
        void commit(deleting.kind === "entity" ? { ...model, entities: model.entities.filter(item => item.id !== deleting.id), relationships: model.relationships.filter(item => item.sourceId !== deleting.id && item.targetId !== deleting.id) } : { ...model, relationships: model.relationships.filter(item => item.id !== deleting.id) });
      }}>{t("diagramLists.actions.delete")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
