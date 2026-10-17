// Reuses professional element/relation lists with ordinary structural edits and explicit save outcomes.
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { validateStandardModel, type StandardDiagram, type StandardModel } from "@uml-platform/contracts";
import type { DiagramDetailItem, SemanticElementKind } from "../../../entities/diagram/lib/model-details";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Textarea } from "../../../shared/ui/textarea";
import { SelectControl } from "../../../shared/ui/select";
import { StudioPagination } from "../../../shared/ui/studio-data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { ModelElementListSection, ModelRelationshipListSection } from "../../diagrams/components/model-edit-lists";
import { matchesItemSearch } from "../../diagrams/lib/diagram-detail-view-model";
import type { EditableCollection } from "../../diagrams/lib/model-editing";
import { buildStandardDiagramDetail, standardNodeKinds, standardNodeTypes, standardRelationTypes } from "../lib/standard-diagram-detail";

type Node = StandardModel["nodes"][number];
type Edge = StandardModel["edges"][number];
type Editor = { kind: "node"; value: Node; create: boolean } | { kind: "edge"; value: Edge; create: boolean };

export function StandardModelEditPanel({ diagram, disabled, readOnly, section = "all", selectedElement, onSelectElement, onSave }: {
  diagram: StandardDiagram; disabled: boolean; readOnly: boolean; section?: "all" | "elements" | "relations";
  selectedElement?: DiagramDetailItem; onSelectElement: (item: DiagramDetailItem) => void;
  onSave: (model: StandardModel) => Promise<boolean | undefined>;
}) {
  const { t } = useTranslation();
  const [elementSearch, setElementSearch] = useState("");
  const [elementKind, setElementKind] = useState<"all" | SemanticElementKind>("all");
  const [relationSearch, setRelationSearch] = useState("");
  const [relationKind, setRelationKind] = useState("all");
  const [elementPage, setElementPage] = useState(1);
  const [elementPageSize, setElementPageSize] = useState(8);
  const [relationPage, setRelationPage] = useState(1);
  const [relationPageSize, setRelationPageSize] = useState(8);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "node" | "edge"; id: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const model = diagram.model;
  const detail = buildStandardDiagramDetail(model);
  if (!model) return null;
  const blocked = disabled || saving || readOnly;
  const collections: EditableCollection[] = standardNodeTypes[diagram.kind].map(type => ({
    key: type, label: t(`diagrams.semantic.${standardNodeKinds[type]}.label`), nameKey: "label",
    create: () => ({ id: `node_${crypto.randomUUID()}`, type, label: "", fields: [], methods: [],
      ...(diagram.kind === "activity" && type === "action" && model.swimlanes?.[0] ? { actorOrLane: model.swimlanes[0].id } : {}) }),
  }));
  const editableItems = new Map(model.nodes.map(node => [node.id, {
    collection: collections.find(collection => collection.key === node.type)!, item: { ...node },
  }]));
  const relations = model.edges.map(edge => {
    const source = model.nodes.find(node => node.id === edge.from)?.label ?? edge.from;
    const target = model.nodes.find(node => node.id === edge.to)?.label ?? edge.to;
    return { id: edge.id, sourceLabel: source, targetLabel: target, displayLabel: edge.label || `${source} → ${target}`,
      typeKey: edge.relation, typeLabel: t(`standardProject.detail.relationTypes.${edge.relation}`),
      searchText: [edge.id, edge.label, source, target, edge.fromCardinality, edge.toCardinality].join(" ").toLowerCase() };
  });
  const openEditor = (next: Editor) => { if (blocked) return; setError(""); setEditor(next); };
  const filteredElements = detail.items.filter(item => (elementKind === "all" || item.kind === elementKind) && matchesItemSearch(item, elementSearch.trim()));
  const filteredRelations = relations.filter(relation => (relationKind === "all" || relation.typeKey === relationKind) && relation.searchText.includes(relationSearch.trim().toLowerCase()));
  const elementPageCount = Math.max(1, Math.ceil(filteredElements.length / elementPageSize));
  const relationPageCount = Math.max(1, Math.ceil(filteredRelations.length / relationPageSize));
  const currentElementPage = Math.min(elementPage, elementPageCount);
  const currentRelationPage = Math.min(relationPage, relationPageCount);
  const pagination = (total: number, page: number, pageSize: number, pageCount: number, onPageChange: (page: number) => void, onPageSizeChange: (size: number) => void) => total > 0 ? <StudioPagination total={total} page={page} pageSize={pageSize} pageCount={pageCount} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} pageSizeOptions={[8, 12, 24]} className="rounded-xl border bg-card" /> : null;
  const openDelete = (next: NonNullable<typeof deleting>) => { if (blocked) return; setError(""); setDeleting(next); };
  const commit = async (next: StandardModel) => {
    if (blocked || busy.current) return;
    setError("");
    try { validateStandardModel(diagram.kind, next); }
    catch { setError(t("standardProject.detail.invalidStructure")); return; }
    // Keep the dialog draft on failure; only the server-confirmed model updates the preview and lists.
    busy.current = true; setSaving(true);
    try {
      if (await onSave(next)) { setEditor(null); setDeleting(null); }
      else setError(t("diagrams.detail.saveFailedToast"));
    } catch { setError(t("diagrams.detail.saveFailedToast")); }
    finally { busy.current = false; setSaving(false); }
  };
  const commitEditor = () => {
    if (!editor || blocked) return;
    if (editor.kind === "node") {
      const value = { ...editor.value, label: editor.value.label.trim(), fields: editor.value.fields.map(text => text.trim()).filter(Boolean), methods: editor.value.methods.map(text => text.trim()).filter(Boolean) };
      void commit({ ...model, nodes: editor.create ? [...model.nodes, value] : model.nodes.map(node => node.id === value.id ? value : node) });
    } else {
      void commit({ ...model, edges: editor.create ? [...model.edges, editor.value] : model.edges.map(edge => edge.id === editor.value.id ? editor.value : edge) });
    }
  };
  const confirmDelete = () => {
    if (!deleting || blocked) return;
    // Removing an element also removes its incident relationships in the same persisted edit.
    void commit(deleting.kind === "node" ? { ...model, nodes: model.nodes.filter(node => node.id !== deleting.id), edges: model.edges.filter(edge => edge.from !== deleting.id && edge.to !== deleting.id) }
      : { ...model, edges: model.edges.filter(edge => edge.id !== deleting.id) });
  };
  const field = (label: string, control: ReactNode) => <label key={label} className="block space-y-2 text-sm font-medium"><span>{label}</span>{control}</label>;
  const updateEdge = (patch: Partial<Edge>) => { if (editor?.kind === "edge") setEditor({ ...editor, value: { ...editor.value, ...patch } }); };
  return <div className="space-y-8">
    {!readOnly && disabled && <p className="text-sm text-muted-foreground">{t("standardProject.generationBlocked")}</p>}
    {(section === "all" || section === "elements") && <div className="space-y-3"><ModelElementListSection
      elementSearch={elementSearch} onElementSearchChange={value => { setElementSearch(value); setElementPage(1); }} elementKindFilter={elementKind} onElementKindFilterChange={value => { setElementKind(value); setElementPage(1); }}
      detailGroups={detail.groups} detailItemCount={detail.items.length} collections={collections}
      filteredElements={filteredElements.slice((currentElementPage - 1) * elementPageSize, currentElementPage * elementPageSize)}
      editableItemsById={editableItems} selectedElement={selectedElement} saving={blocked} onSelectElement={onSelectElement}
      onCreateElement={readOnly ? undefined : collection => openEditor({ kind: "node", value: collection.create() as Node, create: true })}
      onEditElement={readOnly ? undefined : id => openEditor({ kind: "node", value: structuredClone(model.nodes.find(node => node.id === id)!), create: false })}
      onDeleteElement={readOnly ? undefined : id => openDelete({ kind: "node", id, label: model.nodes.find(node => node.id === id)!.label })}
    />{pagination(filteredElements.length, currentElementPage, elementPageSize, elementPageCount, setElementPage, size => { setElementPageSize(size); setElementPage(1); })}</div>}
    {(section === "all" || section === "relations") && <div className="space-y-3"><ModelRelationshipListSection
      relationSearch={relationSearch} onRelationSearchChange={value => { setRelationSearch(value); setRelationPage(1); }} relationKindFilter={relationKind} onRelationKindFilterChange={value => { setRelationKind(value); setRelationPage(1); }}
      relationshipsCount={relations.length} filteredRelationships={filteredRelations.slice((currentRelationPage - 1) * relationPageSize, currentRelationPage * relationPageSize)}
      relationFilterOptions={standardRelationTypes[diagram.kind].map(value => ({ value, label: t(`standardProject.detail.relationTypes.${value}`), count: relations.filter(relation => relation.typeKey === value).length }))}
      endpointOptionsCount={model.nodes.length} relationshipOrderIds={model.edges.map(edge => edge.id)} saving={blocked}
      onCreateRelation={readOnly ? undefined : () => openEditor({ kind: "edge", create: true, value: { id: `edge_${crypto.randomUUID()}`, from: model.nodes[0].id, to: model.nodes[1]?.id ?? model.nodes[0].id, label: "", relation: "association", ...(["er", "table"].includes(diagram.kind) ? { fromCardinality: "1", toCardinality: "*" } : {}) } })}
      onEditRelation={readOnly ? undefined : id => openEditor({ kind: "edge", value: { ...model.edges.find(edge => edge.id === id)! }, create: false })}
      onDeleteRelation={readOnly ? undefined : (id, label) => openDelete({ kind: "edge", id, label })}
      onMoveRelation={readOnly || diagram.kind !== "sequence" ? undefined : (id, offset) => {
        if (blocked) return;
        const edges = [...model.edges]; const at = edges.findIndex(edge => edge.id === id); const next = at + offset;
        if (at < 0 || next < 0 || next >= edges.length) return;
        [edges[at], edges[next]] = [edges[next], edges[at]]; void commit({ ...model, edges });
      }}
    />{pagination(filteredRelations.length, currentRelationPage, relationPageSize, relationPageCount, setRelationPage, size => { setRelationPageSize(size); setRelationPage(1); })}</div>}
    {!editor && !deleting && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open && !saving) { setEditor(null); setError(""); } }}>
      <DialogContent className="max-h-[88svh] overflow-auto sm:max-w-2xl" showCloseButton={!saving}>
        <DialogHeader><DialogTitle>{t(`standardProject.detail.${editor?.create ? "add" : "edit"}${editor?.kind === "node" ? "Element" : "Relation"}`)}</DialogTitle><DialogDescription>{t("standardProject.structureOnly")}</DialogDescription></DialogHeader>
        <div className="space-y-4 rounded-xl border border-border bg-muted/10 p-4 sm:p-5">
          {editor?.kind === "node" && <>
            {field(t("standardProject.elementName"), <Input value={editor.value.label} disabled={blocked} onChange={event => setEditor({ ...editor, value: { ...editor.value, label: event.target.value } })} />)}
            {diagram.kind === "activity" && editor.value.type === "action" && model.swimlanes?.length ? field(t("standardProject.detail.swimlane"), <SelectControl aria-label={t("standardProject.detail.swimlane")} value={editor.value.actorOrLane ?? model.swimlanes[0]!.id} disabled={blocked} options={model.swimlanes.map(lane => ({ value: lane.id, label: lane.name }))} onValueChange={value => setEditor({ ...editor, value: { ...editor.value, actorOrLane: value } })} />) : null}
            {["er", "class", "table"].includes(diagram.kind) && field(t("standardProject.fields"), <Textarea value={editor.value.fields.join("\n")} disabled={blocked} onChange={event => setEditor({ ...editor, value: { ...editor.value, fields: event.target.value.split("\n") } })} />)}
            {diagram.kind === "class" && field(t("standardProject.detail.methods"), <Textarea value={editor.value.methods.join("\n")} disabled={blocked} onChange={event => setEditor({ ...editor, value: { ...editor.value, methods: event.target.value.split("\n") } })} />)}
          </>}
          {editor?.kind === "edge" && <>
            {(["from", "to"] as const).map(endpoint => field(t(`standardProject.detail.${endpoint}`), <SelectControl aria-label={t(`standardProject.detail.${endpoint}`)} value={editor.value[endpoint]} disabled={blocked} options={model.nodes.map(node => ({ value: node.id, label: node.label }))} onValueChange={value => updateEdge({ [endpoint]: value })} />))}
            {field(t("standardProject.detail.relationLabel"), <Input value={editor.value.label} disabled={blocked} onChange={event => updateEdge({ label: event.target.value })} />)}
            {field(t("standardProject.detail.relationType"), <SelectControl aria-label={t("standardProject.detail.relationType")} value={editor.value.relation} disabled={blocked} options={standardRelationTypes[diagram.kind].map(value => ({ value, label: t(`standardProject.detail.relationTypes.${value}`) }))} onValueChange={value => updateEdge({ relation: value as Edge["relation"] })} />)}
            {(["fromCardinality", "toCardinality"] as const).map(key => (["er", "table", "class"].includes(diagram.kind) ? field(t(`standardProject.detail.${key}`), <SelectControl aria-label={t(`standardProject.detail.${key}`)} value={editor.value[key] ?? "none"} disabled={blocked} options={[{ value: "none", label: t("standardProject.unspecified") }, ...["1", "0..1", "*", "1..*", "0..*"].map(value => ({ value, label: value }))]} onValueChange={value => updateEdge({ [key]: value === "none" ? undefined : value as Edge["fromCardinality"] })} />) : null))}
          </>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => { setEditor(null); setError(""); }}>{t("common.cancel")}</Button><Button disabled={blocked || editor?.kind === "node" && !editor.value.label.trim()} onClick={commitEditor}>{t("standardProject.saveDiagram")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !saving) { setDeleting(null); setError(""); } }}>
      <DialogContent showCloseButton={!saving}><DialogHeader><DialogTitle>{t("standardProject.detail.deleteTitle", { name: deleting?.label })}</DialogTitle><DialogDescription>{t("standardProject.detail.deleteDescription")}</DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => { setDeleting(null); setError(""); }}>{t("common.cancel")}</Button><Button variant="destructive" disabled={blocked} onClick={confirmDelete}>{t("diagramLists.actions.delete")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
