// Renders the editable diagram model panel, including element, relation, and delete workflows.
import { validateModelInput, type ModelingStage } from "@uml-platform/contracts";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { StudioPagination } from "../../../shared/ui/studio-data-table";
import {
  buildDiagramDetailModel,
  type DiagramDetailItem,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import {
  cloneDraftModel,
  collectionItems,
  createRelationshipDraft,
  editableCollectionsFor,
  itemLabel,
  relationEndpointKey,
  relationName,
  relationshipItems,
  removeDanglingRelations,
  stringListValue,
  stringValue,
  updateDraftCollection,
  updateDraftItem,
  type EditableCollection,
} from "../lib/model-editing";
import {
  getRelationDisplayLabel,
  getRelationEndpointLabel,
  matchesItemSearch,
} from "../lib/diagram-detail-view-model";
import { ModelEditDialogs } from "./model-edit-dialogs";
import {
  ModelElementListSection,
  ModelRelationshipListSection,
  type ModelRelationshipListItem,
} from "./model-edit-lists";
import { ModelElementEditor } from "./model-element-editor";
import { ModelRelationEditor } from "./model-relation-editor";
import { diagramRelationTypeLabel } from "../lib/diagram-presentation";

const EDITOR_PAGE_SIZE_OPTIONS = [8, 12, 24] as const;

function ModelListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: (typeof EDITOR_PAGE_SIZE_OPTIONS)[number];
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: (typeof EDITOR_PAGE_SIZE_OPTIONS)[number]) => void;
}) {
  const { t } = useTranslation();
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <StudioPagination
      total={total}
      page={page}
      pageCount={totalPages}
      pageSize={pageSize}
      onPageChange={onPageChange}
      onPageSizeChange={(value) => onPageSizeChange(value as (typeof EDITOR_PAGE_SIZE_OPTIONS)[number])}
      pageSizeOptions={[...EDITOR_PAGE_SIZE_OPTIONS]}
      itemLabel={t("diagramLists.pagination.items", { defaultValue: "个项目" })}
      className="rounded-xl border bg-card"
    />
  );
}

export function ModelEditPanel({
  draft,
  setDraft,
  onCommitDraft,
  onSelectElement,
  selectedElement,
  saving,
  visibleSection = "all",
  focusSection,
  sourceRuleOptions = [],
  readOnly = false,
  stage = "requirements",
}: {
  draft: Record<string, unknown> | null;
  setDraft: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  onCommitDraft: (nextDraft: Record<string, unknown>) => Promise<void>;
  onSelectElement: (element: DiagramDetailItem) => void;
  selectedElement?: { kind: string; id: string } | null;
  saving: boolean;
  readOnly?: boolean;
  stage?: ModelingStage;
  visibleSection?: "all" | "elements" | "relationships";
  focusSection?: "elements" | "relationships" | null;
  sourceRuleOptions?: Array<{ id: string; label: string }>;
}) {
  const { t } = useTranslation();
  const elementsSectionRef = useRef<HTMLDivElement | null>(null);
  const relationshipsSectionRef = useRef<HTMLDivElement | null>(null);
  const [elementSearch, setElementSearch] = useState("");
  const [elementKindFilter, setElementKindFilter] = useState<"all" | SemanticElementKind>(
    "all",
  );
  const [relationSearch, setRelationSearch] = useState("");
  const [relationKindFilter, setRelationKindFilter] = useState("all");
  const [elementPage, setElementPage] = useState(1);
  const [elementPageSize, setElementPageSize] = useState<(typeof EDITOR_PAGE_SIZE_OPTIONS)[number]>(8);
  const [relationPage, setRelationPage] = useState(1);
  const [relationPageSize, setRelationPageSize] = useState<(typeof EDITOR_PAGE_SIZE_OPTIONS)[number]>(8);
  const [elementEditor, setElementEditor] = useState<{
    collection: EditableCollection;
    itemId: string;
    draft: Record<string, unknown>;
    mode: "create" | "edit";
  } | null>(null);
  const [relationEditor, setRelationEditor] = useState<{
    relationId: string;
    draft: Record<string, unknown>;
    mode: "create" | "edit";
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "element"; collection: EditableCollection; id: string; label: string }
    | { kind: "relation"; id: string; label: string }
    | null
  >(null);
  const [elementDialogOpen, setElementDialogOpen] = useState(false);
  const [relationDialogOpen, setRelationDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const detailModel = useMemo(() => buildDiagramDetailModel(draft), [draft]);

  useEffect(() => {
    if (!focusSection || visibleSection !== "all") return;
    const target = focusSection === "elements"
      ? elementsSectionRef.current
      : relationshipsSectionRef.current;
    if (!target) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    target.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }, [focusSection, visibleSection]);

  if (!draft) return null;

  const editorDraft = elementEditor?.draft ?? relationEditor?.draft ?? draft;
  const setEditorDraft = (
    updater:
      | Record<string, unknown>
      | ((current: Record<string, unknown>) => Record<string, unknown>),
  ) => {
    if (elementEditor) {
      setElementEditor((current) => {
        if (!current) return current;
        const nextDraft = typeof updater === "function" ? updater(current.draft) : updater;
        return { ...current, draft: nextDraft };
      });
      return;
    }
    if (relationEditor) {
      setRelationEditor((current) => {
        if (!current) return current;
        const nextDraft = typeof updater === "function" ? updater(current.draft) : updater;
        return { ...current, draft: nextDraft };
      });
      return;
    }
    setDraft((current) => {
      if (!current) return current;
      return typeof updater === "function" ? updater(current) : updater;
    });
  };

  const collections = editableCollectionsFor(draft, stage);
  const editorCollections = editableCollectionsFor(editorDraft, stage);
  const editableItemsById = new Map<string, { collection: EditableCollection; item: Record<string, unknown> }>();
  for (const collection of collections) {
    for (const item of collectionItems(draft, collection)) {
      const itemId = stringValue(item.id);
      if (itemId) editableItemsById.set(itemId, { collection, item });
    }
  }
  const filteredGroups = detailModel.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (elementKindFilter === "all" || item.kind === elementKindFilter) &&
          matchesItemSearch(item, elementSearch.trim()),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const filteredElements = filteredGroups.flatMap((group) => group.items);
  const elementTotalPages = Math.max(1, Math.ceil(filteredElements.length / elementPageSize));
  const effectiveElementPage = Math.min(elementPage, elementTotalPages);
  const paginatedElements = filteredElements.slice(
    (effectiveElementPage - 1) * elementPageSize,
    effectiveElementPage * elementPageSize,
  );
  const detailItemsById = new Map(detailModel.items.map((item) => [item.id, item]));
  const detailRelationshipsById = new Map(detailModel.relationships.map((relation) => [relation.id, relation]));
  const endpointOptions = editorCollections.flatMap((collection) =>
    collectionItems(editorDraft, collection).map((item) => ({
      id: String(item.id ?? ""),
      label: `${collection.label}：${itemLabel(item, collection) || item.id}`,
    })),
  ).filter((item) => item.id);
  const relationships = relationshipItems(draft);
  const relationshipSummaries: ModelRelationshipListItem[] = relationships.map((relation) => {
    const id = String(relation.id ?? "");
    const detailRelation = detailRelationshipsById.get(id);
    const displayLabel = detailRelation
      ? getRelationDisplayLabel(detailRelation, detailItemsById)
      : relationName(relation) || id;
    const typeKey = detailRelation?.typeLabel ?? (stringValue(relation.type) || "uncategorized");
    const typeLabel = diagramRelationTypeLabel(typeKey, t);
    const sourceKey = relationEndpointKey(draft, "source");
    const targetKey = relationEndpointKey(draft, "target");
    const sourceLabel = detailRelation
      ? getRelationEndpointLabel(detailRelation, detailItemsById, "source")
      : stringValue(relation[sourceKey]);
    const targetLabel = detailRelation
      ? getRelationEndpointLabel(detailRelation, detailItemsById, "target")
      : stringValue(relation[targetKey]);
    const fieldsText = detailRelation?.fields
      .map((field) => `${field.label} ${field.value}`)
      .join(" ") ?? "";
    return {
      id,
      displayLabel,
      typeKey,
      typeLabel,
      sourceLabel,
      targetLabel,
      searchText: [
        displayLabel,
        typeLabel,
        sourceLabel,
        targetLabel,
        fieldsText,
        stringValue(relation.type),
      ].join(" ").toLowerCase(),
    };
  });
  const relationTypeCounts = relationshipSummaries.reduce<Map<string, number>>((counts, relation) => {
    counts.set(relation.typeKey, (counts.get(relation.typeKey) ?? 0) + 1);
    return counts;
  }, new Map());
  const relationFilterOptions = Array.from(relationTypeCounts.entries()).map(([value, count]) => ({
    value,
    label: diagramRelationTypeLabel(value, t),
    count,
  }));
  const filteredRelationships = relationshipSummaries.filter((relation) => {
    const matchesKind = relationKindFilter === "all" || relation.typeKey === relationKindFilter;
    const query = relationSearch.trim().toLowerCase();
    return matchesKind && (!query || relation.searchText.includes(query));
  });
  const relationTotalPages = Math.max(1, Math.ceil(filteredRelationships.length / relationPageSize));
  const effectiveRelationPage = Math.min(relationPage, relationTotalPages);
  const paginatedRelationships = filteredRelationships.slice(
    (effectiveRelationPage - 1) * relationPageSize,
    effectiveRelationPage * relationPageSize,
  );

  const updateItem = (
    collection: EditableCollection,
    itemId: string,
    updater: (item: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    setEditorDraft((current) => updateDraftItem(current, collection, itemId, updater));
  };

  const updateRelation = (
    relationId: string,
    updater: (item: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    setEditorDraft((current) => {
      const nextRelationships = relationshipItems(current).map((currentRelation) =>
        String(currentRelation.id ?? "") === relationId ? updater(currentRelation) : currentRelation,
      );
      if (["sequence", "analysis"].includes(String(current.diagramKind))) return { ...current, messages: nextRelationships };
      return { ...current, relationships: nextRelationships };
    });
  };

  const actorOptions = collectionItems(editorDraft, {
    key: "actors",
    label: "角色",
    nameKey: "name",
    create: () => ({}),
  }).map((actor) => ({ value: stringValue(actor.id), label: stringValue(actor.name) || stringValue(actor.id) }));
  const laneOptions = collectionItems(editorDraft, {
    key: "swimlanes",
    label: "泳道",
    nameKey: "name",
    create: () => ({}),
  }).map((lane) => ({ value: stringValue(lane.id), label: stringValue(lane.name) || stringValue(lane.id) }));
  const messageOptions = relationshipItems(editorDraft).map((message) => ({
    value: stringValue(message.id),
    label: stringValue(message.name) || stringValue(message.id),
  }));
  const tableOptions = collectionItems(editorDraft, {
    key: "tables",
    label: "数据表",
    nameKey: "name",
    create: () => ({}),
  }).map((table) => ({ value: stringValue(table.id), label: stringValue(table.name) || stringValue(table.id) }));
  const columnsForTable = (tableId: string) => {
    const table = collectionItems(editorDraft, {
      key: "tables",
      label: "数据表",
      nameKey: "name",
      create: () => ({}),
    }).find((item) => stringValue(item.id) === tableId);
    const columns = Array.isArray(table?.columns)
      ? (table.columns as Array<Record<string, unknown>>)
      : [];
    return columns.map((column) => ({
      value: stringValue(column.id),
      label: stringValue(column.name) || stringValue(column.id),
    }));
  };

  const editingElement = elementEditor
    ? collectionItems(elementEditor.draft, elementEditor.collection).find(
        (item) => stringValue(item.id) === elementEditor.itemId,
      ) ?? null
    : null;
  const editingRelation = relationEditor
    ? relationshipItems(relationEditor.draft).find(
        (relation) => stringValue(relation.id) === relationEditor.relationId,
      ) ?? null
    : null;

  const commitElementEdit = async () => {
    if (!elementEditor) return;
    const nextDraft = elementEditor.draft;
    setElementDialogOpen(false);
    await onCommitDraft(nextDraft);
  };

  const commitRelationEdit = async () => {
    if (!relationEditor) return;
    const nextDraft = relationEditor.draft;
    setRelationDialogOpen(false);
    await onCommitDraft(nextDraft);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    let nextDraft: Record<string, unknown>;
    if (deleteTarget.kind === "element") {
      nextDraft = removeDanglingRelations(
        updateDraftCollection(draft, deleteTarget.collection, (currentItems) =>
          currentItems.filter((currentItem) => stringValue(currentItem.id) !== deleteTarget.id),
        ),
      );
    } else {
      const nextRelationships = relationshipItems(draft).filter(
        (currentRelation) => stringValue(currentRelation.id) !== deleteTarget.id,
      );
      nextDraft =
        ["sequence", "analysis"].includes(String(draft.diagramKind))
          ? { ...draft, messages: nextRelationships }
          : { ...draft, relationships: nextRelationships };
    }
    setDeleteDialogOpen(false);
    await onCommitDraft(nextDraft);
  };

  const createElement = (collection: EditableCollection) => {
    if (collection.allowCreate === false) return;
    const nextItem = collection.create();
    const itemId = stringValue(nextItem.id);
    const nextDraft = updateDraftCollection(draft, collection, (currentItems) => [
      ...currentItems,
      nextItem,
    ]);
    setElementEditor({
      collection,
      itemId,
      draft: nextDraft,
      mode: "create",
    });
    setElementDialogOpen(true);
  };

  const editElement = (
    elementId: string,
    editable: { collection: EditableCollection },
  ) => {
    setElementEditor({
      collection: editable.collection,
      itemId: elementId,
      draft: cloneDraftModel(draft),
      mode: "edit",
    });
    setElementDialogOpen(true);
  };

  const deleteElement = (
    elementId: string,
    editable: { collection: EditableCollection; item: Record<string, unknown> },
  ) => {
    if (editable.collection.allowDelete === false) return;
    setDeleteTarget({
      kind: "element",
      collection: editable.collection,
      id: elementId,
      label: `${editable.collection.label} ${
        itemLabel(editable.item, editable.collection) ||
        `未命名${editable.collection.label}`
      }`,
    });
    setDeleteDialogOpen(true);
  };

  const createRelation = () => {
    const nextRelation = createRelationshipDraft(draft, stage);
    const relationId = stringValue(nextRelation.id);
    const nextDraft =
      ["sequence", "analysis"].includes(String(draft.diagramKind))
        ? { ...draft, messages: [...relationshipItems(draft), nextRelation] }
        : { ...draft, relationships: [...relationshipItems(draft), nextRelation] };
    setRelationEditor({
      relationId,
      draft: nextDraft,
      mode: "create",
    });
    setRelationDialogOpen(true);
  };

  const editRelation = (relationId: string) => {
    setRelationEditor({
      relationId,
      draft: cloneDraftModel(draft),
      mode: "edit",
    });
    setRelationDialogOpen(true);
  };

  const deleteRelation = (relationId: string, displayLabel: string) => {
    setDeleteTarget({
      kind: "relation",
      id: relationId,
      label: `关系 ${displayLabel || "未命名关系"}`,
    });
    setDeleteDialogOpen(true);
  };

  const relationshipOrderIds = detailModel.relationships.map(
    (relation) => relation.id,
  );
  const validSourceRuleIds = new Set(sourceRuleOptions.map((option) => option.id));
  const validateSourceIds = (value: unknown) => {
    const ids = stringListValue(value);
    if (ids.length === 0) return "请至少选择一条当前有效的来源需求规则。";
    const invalidIds = ids.filter((id) => !validSourceRuleIds.has(id));
    return invalidIds.length > 0
      ? `来源需求规则已失效：${invalidIds.join("、")}`
      : null;
  };
  const elementValidationMessage =
    editorDraft.diagramKind === "context" && elementEditor && editingElement
      ? elementEditor.collection.key === "system"
        ? stringValue(editingElement.id) !== "system"
          ? "中心系统标识必须保持为 system。"
          : !itemLabel(editingElement, elementEditor.collection).trim()
            ? "请填写中心系统名称。"
            : null
        : !itemLabel(editingElement, elementEditor.collection).trim()
          ? `请填写${elementEditor.collection.label}名称。`
          : validateSourceIds(editingElement.sourceRequirementIds)
      : null;
  const validEndpointIds = new Set(endpointOptions.map((option) => option.id));
  const relationValidationMessage =
    editorDraft.diagramKind === "context" && relationEditor && editingRelation
      ? !validEndpointIds.has(stringValue(editingRelation.sourceId)) ||
        !validEndpointIds.has(stringValue(editingRelation.targetId))
        ? "请选择有效的关系起点和终点。"
        : !stringValue(editingRelation.label)
          ? "请填写关系名称。"
          : validateSourceIds(editingRelation.sourceRequirementIds)
      : null;

  return (
    <>
      <div className="space-y-8">
        {!readOnly && validateModelInput(draft, stage).length > 0 ? <div role="status" className="rounded border border-amber-500 p-3 text-sm"><p>草稿尚未通过校验，请补齐后保存。当前图保留上次有效结果。</p><ul>{validateModelInput(draft, stage).map((issue, index) => <li key={index}>{issue.elementId ?? issue.path}：{issue.message}</li>)}</ul></div> : null}
        {draft.diagramKind === "table" ? <p className="text-sm">表间关系由表的外键约束生成，请在表编辑中维护主键、唯一约束和复合外键。</p> : null}
        {visibleSection !== "relationships" ? <div ref={elementsSectionRef} tabIndex={-1} aria-label={t("diagramLists.elements.section")} className="scroll-mt-4 space-y-3 outline-none"><ModelElementListSection
          elementSearch={elementSearch}
          onElementSearchChange={(value) => { setElementSearch(value); setElementPage(1); }}
          elementKindFilter={elementKindFilter}
          onElementKindFilterChange={(value) => { setElementKindFilter(value); setElementPage(1); }}
          detailGroups={detailModel.groups}
          detailItemCount={detailModel.items.length}
          collections={collections}
          filteredElements={paginatedElements}
          editableItemsById={editableItemsById}
          selectedElement={selectedElement}
          saving={saving}
          onCreateElement={readOnly ? undefined : createElement}
          onEditElement={readOnly ? undefined : editElement}
          onDeleteElement={readOnly ? undefined : deleteElement}
          onSelectElement={onSelectElement}
        /><ModelListPagination page={effectiveElementPage} pageSize={elementPageSize} total={filteredElements.length} onPageChange={setElementPage} onPageSizeChange={(value) => { setElementPageSize(value); setElementPage(1); }} /></div> : null}

        {visibleSection !== "elements" ? <div ref={relationshipsSectionRef} tabIndex={-1} aria-label={t("diagramLists.relations.section")} className="scroll-mt-4 space-y-3 outline-none"><ModelRelationshipListSection
          relationSearch={relationSearch}
          onRelationSearchChange={(value) => { setRelationSearch(value); setRelationPage(1); }}
          relationKindFilter={relationKindFilter}
          onRelationKindFilterChange={(value) => { setRelationKindFilter(value); setRelationPage(1); }}
          relationshipsCount={relationships.length}
          filteredRelationships={paginatedRelationships}
          relationFilterOptions={relationFilterOptions}
          endpointOptionsCount={endpointOptions.length}
          relationshipOrderIds={relationshipOrderIds}
          saving={saving}
          onCreateRelation={readOnly || draft.diagramKind === "table" ? undefined : createRelation}
          onMoveRelation={!readOnly && ["sequence", "analysis"].includes(String(draft.diagramKind)) ? (id, offset) => {
            const messages = [...relationshipItems(draft)];
            const index = messages.findIndex((message) => message.id === id);
            if (index < 0 || !messages[index + offset]) return;
            [messages[index], messages[index + offset]] = [messages[index + offset]!, messages[index]!];
            void onCommitDraft({ ...draft, messages });
          } : undefined}
          onEditRelation={readOnly || draft.diagramKind === "table" ? undefined : editRelation}
          onDeleteRelation={readOnly || draft.diagramKind === "table" ? undefined : deleteRelation}
        /><ModelListPagination page={effectiveRelationPage} pageSize={relationPageSize} total={filteredRelationships.length} onPageChange={setRelationPage} onPageSizeChange={(value) => { setRelationPageSize(value); setRelationPage(1); }} /></div> : null}
      </div>

      <ModelEditDialogs
        elementEditor={elementEditor}
        relationEditor={relationEditor}
        deleteTarget={deleteTarget}
        elementOpen={elementDialogOpen}
        relationOpen={relationDialogOpen}
        deleteOpen={deleteDialogOpen}
        hasEditingElement={Boolean(elementEditor && editingElement)}
        hasEditingRelation={Boolean(relationEditor && editingRelation)}
        saving={saving}
        onElementOpenChange={setElementDialogOpen}
        onRelationOpenChange={setRelationDialogOpen}
        onDeleteOpenChange={setDeleteDialogOpen}
        onElementCloseComplete={() => setElementEditor(null)}
        onRelationCloseComplete={() => setRelationEditor(null)}
        onDeleteCloseComplete={() => setDeleteTarget(null)}
        onCommitElement={commitElementEdit}
        onCommitRelation={commitRelationEdit}
        onConfirmDelete={confirmDelete}
        renderElementFields={() =>
          elementEditor && editingElement ? (
            <ModelElementEditor
              stage={stage}
              editorDraft={editorDraft}
              collection={elementEditor.collection}
              item={editingElement}
              itemId={elementEditor.itemId}
              actorOptions={actorOptions}
              laneOptions={laneOptions}
              messageOptions={messageOptions}
              tableOptions={tableOptions}
              columnsForTable={columnsForTable}
              updateItem={updateItem}
              sourceRuleOptions={sourceRuleOptions}
            />
          ) : null
        }
        renderRelationFields={() =>
          relationEditor && editingRelation ? (
            <div>
              <ModelRelationEditor
                stage={stage}
              editorDraft={editorDraft}
                relation={editingRelation}
                relationId={relationEditor.relationId}
                endpointOptions={endpointOptions}
                columnsForTable={columnsForTable}
                updateRelation={updateRelation}
                sourceRuleOptions={sourceRuleOptions}
              />
            </div>
          ) : null
        }
        elementValidationMessage={elementValidationMessage}
        relationValidationMessage={relationValidationMessage}
      />
    </>
  );
}
