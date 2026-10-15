// Renders the model editor element and relationship list sections from prepared view data.
import { SpotlightCard } from "../../../shared/ui/interactive-card";
import { Input } from '../../../shared/ui/input';
import { ArrowRight, ChevronDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { SelectControl } from "../../../shared/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../shared/ui/dropdown-menu";
import { cn } from "../../../shared/ui/utils";
import {
  type DiagramDetailItem,
  type SemanticElementKind,
} from "../../../entities/diagram/lib/model-details";
import {
  itemLabel,
  type EditableCollection,
} from "../lib/model-editing";
import { getRelationAccentClass } from "../lib/diagram-detail-view-model";
import { editorOwnerLabel, namedActionLabel } from "./model-edit-fields";

type EditableItemReference = {
  collection: EditableCollection;
  item: Record<string, unknown>;
};

export type ModelRelationshipListItem = {
  id: string;
  displayLabel: string;
  sourceLabel: string;
  targetLabel: string;
  typeKey: string;
  typeLabel: string;
  searchText: string;
};

export function ModelElementListSection({
  elementSearch,
  onElementSearchChange,
  elementKindFilter,
  onElementKindFilterChange,
  detailGroups,
  detailItemCount,
  collections,
  filteredElements,
  editableItemsById,
  selectedElement,
  saving,
  onCreateElement,
  onEditElement,
  onDeleteElement,
  onSelectElement,
}: {
  elementSearch: string;
  onElementSearchChange: (value: string) => void;
  elementKindFilter: "all" | SemanticElementKind;
  onElementKindFilterChange: (value: "all" | SemanticElementKind) => void;
  detailGroups: Array<{ kind: SemanticElementKind; items: DiagramDetailItem[] }>;
  detailItemCount: number;
  collections: EditableCollection[];
  filteredElements: DiagramDetailItem[];
  editableItemsById: Map<string, EditableItemReference>;
  selectedElement?: { kind: string; id: string } | null;
  saving: boolean;
  onCreateElement?: (collection: EditableCollection) => void;
  onEditElement?: (elementId: string, editable: EditableItemReference) => void;
  onDeleteElement?: (elementId: string, editable: EditableItemReference) => void;
  onSelectElement: (element: DiagramDetailItem) => void;
}) {
  const { t } = useTranslation();
  const creatableCollections = collections.filter((collection) => collection.allowCreate !== false);
  return (
    <section className="space-y-4">
      <div className="border-b border-border pb-3">
        <h3 className="text-lg font-semibold text-foreground">{t("diagramLists.elements.title")}</h3>
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-3 pb-1"
          aria-label={t("diagramLists.elements.toolbar")}
        >
          <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-wrap sm:items-center sm:gap-2">
            <label className="relative w-full min-w-0 sm:w-auto sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("diagramLists.elements.search")}
                value={elementSearch}
                onChange={(event) => onElementSearchChange(event.target.value)}
                className="h-9 w-full min-w-0 border pl-9 pr-3 text-xs sm:w-64"
                placeholder={t("diagramLists.elements.searchPlaceholder")}
              />
            </label>
            {detailGroups.length > 0 ? (
              <SelectControl
                aria-label={t("diagramLists.elements.filter")}
                value={elementKindFilter}
                onValueChange={(value) => onElementKindFilterChange(value as "all" | SemanticElementKind)}
                className="w-36 shrink-0"
                options={[
                  { value: "all", label: t("diagramLists.elements.allTypes") },
                  ...detailGroups.map((group) => ({ value: group.kind, label: t(`diagrams.semantic.${group.kind}.label`) })),
                ]}
              />
            ) : null}
          </div>
          {onCreateElement && creatableCollections.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" className="ml-auto h-9 shrink-0" />}
                disabled={saving}
                aria-label={t("common.add")}
              >
                <Plus className="size-3.5" /> {t("common.add")} <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {creatableCollections.map((collection) => (
                  <DropdownMenuItem key={collection.key} onClick={() => onCreateElement(collection)}>
                    {t("diagramLists.elements.add", { kind: editorOwnerLabel(collection.label) })}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      <div>
        {detailGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            {t("diagramLists.elements.empty")}
          </div>
        ) : filteredElements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            {t("diagramLists.elements.noMatches")}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {filteredElements.map((element) => {
              const editable = editableItemsById.get(element.id);
              const active =
                selectedElement?.kind === element.kind &&
                selectedElement.id === element.id;
              return (
                <SpotlightCard
                  key={`${element.kind}:${element.id}`}
                  data-selected={active ? "true" : "false"}
                  className={cn(
                    "min-h-[9rem] text-left text-sm",
                    active
                      ? "border-primary shadow-sm shadow-primary/10"
                      : "",
                  )}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t("diagramLists.elements.locate", { name: element.label })}
                    aria-pressed={active}
                    className="absolute inset-0 z-10 size-auto cursor-pointer rounded-xl p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => onSelectElement(element)}
                  />
                  <div className="pointer-events-none relative z-20 flex min-h-[9rem] flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {t(`diagrams.semantic.${element.kind}.label`)}
                      </Badge>
                      <div className="pointer-events-auto flex min-w-0 flex-1 justify-end gap-1">
                      {editable && onEditElement && onDeleteElement ? (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            aria-label={namedActionLabel(
                              t("diagramLists.actions.edit"),
                              editorOwnerLabel(editable.collection.label),
                              itemLabel(editable.item, editable.collection),
                            )}
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditElement(element.id, editable);
                            }}
                          >
                            <span className="sr-only">{t("diagramLists.actions.edit")}</span>
                            <Pencil className="size-3.5" />
                          </Button>
                          {editable.collection.allowDelete !== false ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="destructive"
                              className="size-7"
                              aria-label={namedActionLabel(
                                t("diagramLists.actions.delete"),
                                editorOwnerLabel(editable.collection.label),
                                itemLabel(editable.item, editable.collection),
                              )}
                              disabled={saving}
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteElement(element.id, editable);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                      </div>
                    </div>
                    <div className="mt-3 line-clamp-2 min-w-0 break-words text-sm font-semibold leading-5 text-foreground">
                      {element.label}
                    </div>
                    <div className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {element.description || t("diagramLists.elements.noDescription")}
                    </div>
                  </div>
                </SpotlightCard>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function ModelRelationshipListSection({
  relationSearch,
  onRelationSearchChange,
  relationKindFilter,
  onRelationKindFilterChange,
  relationshipsCount,
  filteredRelationships,
  relationFilterOptions,
  endpointOptionsCount,
  relationshipOrderIds,
  saving,
  onCreateRelation,
  onEditRelation,
  onMoveRelation,
  onDeleteRelation,
}: {
  relationSearch: string;
  onRelationSearchChange: (value: string) => void;
  relationKindFilter: string;
  onRelationKindFilterChange: (value: string) => void;
  relationshipsCount: number;
  filteredRelationships: ModelRelationshipListItem[];
  relationFilterOptions: Array<{ value: string; label: string; count: number }>;
  endpointOptionsCount: number;
  relationshipOrderIds: string[];
  saving: boolean;
  onCreateRelation?: () => void;
  onMoveRelation?: (relationId: string, offset: -1 | 1) => void;
  onEditRelation?: (relationId: string) => void;
  onDeleteRelation?: (relationId: string, displayLabel: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <div className="border-b border-border pb-3">
        <h3 className="text-lg font-semibold text-foreground">{t("diagramLists.relations.title")}</h3>
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-3 pb-1"
          aria-label={t("diagramLists.relations.toolbar")}
        >
          <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-wrap sm:items-center sm:gap-2">
            <label className="relative w-full min-w-0 sm:w-auto sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("diagramLists.relations.search")}
                value={relationSearch}
                onChange={(event) => onRelationSearchChange(event.target.value)}
                className="h-9 w-full min-w-0 border pl-9 pr-3 text-xs sm:w-64"
                placeholder={t("diagramLists.relations.searchPlaceholder")}
              />
            </label>
            {relationshipsCount > 0 ? (
              <SelectControl
                aria-label={t("diagramLists.relations.filter")}
                value={relationKindFilter}
                onValueChange={onRelationKindFilterChange}
                className="w-36 shrink-0"
                options={[
                  { value: "all", label: t("diagramLists.relations.allTypes") },
                  ...relationFilterOptions.map((option) => ({ value: option.value, label: option.label })),
                ]}
              />
            ) : null}
          </div>
          {onCreateRelation && <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto h-9 shrink-0"
            disabled={endpointOptionsCount === 0 || saving}
            onClick={onCreateRelation}
          >
            <Plus className="size-3.5" /> {t("diagramLists.relations.add")}
          </Button>}
        </div>
      </div>
      <div className="space-y-3">
        {relationshipsCount === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            {t("diagramLists.relations.empty")}
          </div>
        ) : filteredRelationships.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            {t("diagramLists.relations.noMatches")}
          </div>
        ) : (
          filteredRelationships.map((relationSummary) => {
            const {
              id,
              displayLabel,
              sourceLabel,
              targetLabel,
              typeLabel,
            } = relationSummary;
            return (
              <SpotlightCard
                key={id}
                className={cn(
                  "gap-0 py-0 border-l-4",
                  getRelationAccentClass(
                    Math.max(0, relationshipOrderIds.indexOf(id)),
                  ),
                )}
              >
                <div className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-4 py-3 text-center">
                    <div className="truncate text-sm font-medium text-foreground">
                      {sourceLabel || t("diagramLists.relations.noSource")}
                    </div>
                  </div>
                  <div className="grid min-w-[160px] flex-[1.3] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center text-xs text-muted-foreground">
                    <span className="h-px min-w-8 bg-border" />
                    <span className="max-w-40 truncate bg-card px-2 text-center">
                      <span className="block truncate text-foreground">
                        {displayLabel}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {typeLabel}
                      </span>
                    </span>
                    <span className="relative h-px min-w-8 bg-border">
                      <ArrowRight className="absolute right-0 top-1/2 size-4 -translate-y-1/2 translate-x-1/2 text-border" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-4 py-3 text-center">
                    <div className="truncate text-sm font-medium text-foreground">
                      {targetLabel || t("diagramLists.relations.noTarget")}
                    </div>
                  </div>
                  {onMoveRelation ? <div className="flex flex-col gap-1">
                    <Button type="button" variant="ghost" size="sm" aria-label={`上移消息 ${displayLabel}`} disabled={saving || relationshipOrderIds.indexOf(id) === 0} onClick={() => onMoveRelation(id, -1)}>上移</Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`下移消息 ${displayLabel}`} disabled={saving || relationshipOrderIds.indexOf(id) === relationshipOrderIds.length - 1} onClick={() => onMoveRelation(id, 1)}>下移</Button>
                  </div> : null}
                  {onEditRelation && onDeleteRelation && <><Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={namedActionLabel(t("diagramLists.actions.edit"), t("diagramLists.relations.kind"), displayLabel)}
                    disabled={saving}
                    onClick={() => onEditRelation(id)}
                  >
                    <span className="sr-only">{t("diagramLists.actions.edit")}</span>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="size-8"
                    aria-label={namedActionLabel(t("diagramLists.actions.delete"), t("diagramLists.relations.kind"), displayLabel)}
                    disabled={saving}
                    onClick={() => onDeleteRelation(id, displayLabel)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button></>}
                </div>
              </SpotlightCard>
            );
          })
        )}
      </div>
    </section>
  );
}
