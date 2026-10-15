// Renders the model editor confirmation dialogs while the panel owns edit state and field content.
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  FieldError,
  FieldGroup,
  FieldSet,
} from "../../../shared/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";

type ElementEditorDialogState = {
  collection: { label: string };
  mode: "create" | "edit";
} | null;

type RelationEditorDialogState = {
  mode: "create" | "edit";
} | null;

type DeleteTargetDialogState =
  | { kind: "element"; collection: { label: string }; label: string }
  | { kind: "relation"; label: string }
  | null;

export function ModelEditDialogs({
  elementEditor,
  relationEditor,
  deleteTarget,
  elementOpen,
  relationOpen,
  deleteOpen,
  hasEditingElement,
  hasEditingRelation,
  saving,
  onElementOpenChange,
  onRelationOpenChange,
  onDeleteOpenChange,
  onElementCloseComplete,
  onRelationCloseComplete,
  onDeleteCloseComplete,
  onCommitElement,
  onCommitRelation,
  onConfirmDelete,
  renderElementFields,
  renderRelationFields,
  elementValidationMessage,
  relationValidationMessage,
}: {
  elementEditor: ElementEditorDialogState;
  relationEditor: RelationEditorDialogState;
  deleteTarget: DeleteTargetDialogState;
  elementOpen: boolean;
  relationOpen: boolean;
  deleteOpen: boolean;
  hasEditingElement: boolean;
  hasEditingRelation: boolean;
  saving: boolean;
  onElementOpenChange: (open: boolean) => void;
  onRelationOpenChange: (open: boolean) => void;
  onDeleteOpenChange: (open: boolean) => void;
  onElementCloseComplete: () => void;
  onRelationCloseComplete: () => void;
  onDeleteCloseComplete: () => void;
  onCommitElement: () => void;
  onCommitRelation: () => void;
  onConfirmDelete: () => void;
  renderElementFields: () => ReactNode;
  renderRelationFields: () => ReactNode;
  elementValidationMessage?: string | null;
  relationValidationMessage?: string | null;
}) {
  return (
    <>
      <Dialog
        open={elementOpen}
        onOpenChange={onElementOpenChange}
        onOpenChangeComplete={(open) => !open && onElementCloseComplete()}
      >
        <DialogContent data-form-layout="4" className="max-h-[88vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {elementEditor
                ? `${elementEditor.mode === "create" ? "添加" : "编辑"}${elementEditor.collection.label}`
                : "编辑元素"}
            </DialogTitle>
            <DialogDescription>
              确认后会保存当前模型草稿，并自动更新当前图。
            </DialogDescription>
          </DialogHeader>
          {hasEditingElement ? (
            <FieldSet className="rounded-xl border border-border bg-muted/10 p-4 sm:p-5">
              <FieldGroup className="gap-5">
                {renderElementFields()}
              </FieldGroup>
            </FieldSet>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              未找到可编辑元素。
            </div>
          )}
          {elementValidationMessage ? (
            <FieldError className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              {elementValidationMessage}
            </FieldError>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onElementOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={onCommitElement}
              disabled={!hasEditingElement || saving || Boolean(elementValidationMessage)}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {elementEditor?.mode === "create" ? "确认添加" : "确认编辑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={relationOpen}
        onOpenChange={onRelationOpenChange}
        onOpenChangeComplete={(open) => !open && onRelationCloseComplete()}
      >
        <DialogContent data-form-layout="6" className="max-h-[88vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {relationEditor?.mode === "create" ? "添加关系" : "编辑关系"}
            </DialogTitle>
            <DialogDescription>
              调整端点、类型和关系字段后，确认会保存草稿并自动更新当前图。
            </DialogDescription>
          </DialogHeader>
          {hasEditingRelation ? (
            <FieldSet className="rounded-xl border border-border bg-muted/10 p-4 sm:p-5">
              <FieldGroup className="gap-5">
                {renderRelationFields()}
              </FieldGroup>
            </FieldSet>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              未找到可编辑关系。
            </div>
          )}
          {relationValidationMessage ? (
            <FieldError className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              {relationValidationMessage}
            </FieldError>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onRelationOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={onCommitRelation}
              disabled={!hasEditingRelation || saving || Boolean(relationValidationMessage)}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {relationEditor?.mode === "create" ? "确认添加" : "确认编辑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={onDeleteOpenChange}
        onOpenChangeComplete={(open) => !open && onDeleteCloseComplete()}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.kind === "element"
                ? `删除${deleteTarget.collection.label}`
                : "删除关系"}
            </DialogTitle>
            <DialogDescription>
              将删除{deleteTarget?.label ?? "当前项"}，并清理相关引用或关系。确认删除后会自动保存并更新当前图。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onDeleteOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
