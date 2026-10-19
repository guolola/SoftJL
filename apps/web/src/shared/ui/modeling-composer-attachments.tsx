// Shared attachment tiles retain the quick modeling preview, upload feedback and removal behavior.
"use client";

import { useEffect, useState } from "react";
import { AttachmentPrimitive, ComposerPrimitive, useAuiState } from "@assistant-ui/react";
import { AlertCircleIcon, FileText, Loader2Icon, XIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { cn } from "./utils";

type Translate = (value: string) => string;
const identity: Translate = (value) => value;

function usePreviewSource() {
  const { file, src } = useAuiState(useShallow((state): { file?: File; src?: string } => {
    if (state.attachment.type !== "image") return {};
    if (state.attachment.file) return { file: state.attachment.file };
    return { src: state.attachment.content?.find((part) => part.type === "image")?.image };
  }));
  const [entry, setEntry] = useState<{ file: File; url: string }>();
  useEffect(() => {
    if (!file) return;
    // Object URLs belong to the mounted preview and must be revoked on removal or replacement.
    const url = URL.createObjectURL(file);
    setEntry({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return file && entry?.file === file ? entry.url : src;
}

function AttachmentTile({ translate }: { translate: Translate }) {
  const src = usePreviewSource();
  const name = useAuiState((state) => state.attachment.name);
  const typeLabel = useAuiState((state) => translate(
    state.attachment.type === "image" ? "Image" : state.attachment.type === "document" ? "Document" : "File",
  ));
  const status = useAuiState((state) => state.attachment.status);
  const isError = status.type === "incomplete" && status.reason === "error";
  const isUploading = status.type === "running";
  const errorMessage = isError ? status.message ?? translate("Upload failed") : undefined;
  const label = `${translate(src ? `Preview ${name}` : `${typeLabel} attachment ${name}`)}${isError ? translate(", upload failed") : isUploading ? translate(", uploading") : ""}`;
  const tile = (
    <TooltipTrigger render={<div role={src ? "button" : "group"} tabIndex={0} aria-label={label} className={cn(
      "aui-attachment-tile bg-muted hover:after:bg-foreground/10 focus-visible:ring-ring/50 relative size-14 overflow-hidden rounded-[calc(var(--composer-radius,1rem)-var(--composer-padding,8px))] transition-transform outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-black/10 after:transition-colors after:ring-inset focus-visible:ring-1 motion-reduce:transition-none dark:after:ring-white/10",
      src ? "cursor-zoom-in active:scale-[0.96]" : "cursor-default",
      isError && "after:ring-destructive/60 dark:after:ring-destructive/60",
    )} />}>
      {src ? <img src={src} alt="" className="aui-attachment-tile-image h-full w-full object-cover" /> : (
        <div className="grid h-full w-full place-items-center"><FileText className="text-muted-foreground/80 size-6 stroke-[1.5]" /></div>
      )}
      {isUploading && <div aria-hidden="true" className="aui-attachment-tile-uploading bg-background/60 absolute inset-0 flex items-center justify-center backdrop-blur-[2px]"><Loader2Icon className="text-muted-foreground size-4 animate-spin" /></div>}
      {isError && <div aria-hidden="true" className="aui-attachment-tile-error bg-background/70 absolute inset-0 flex items-center justify-center backdrop-blur-[2px]"><AlertCircleIcon className="text-destructive size-4" /></div>}
    </TooltipTrigger>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <AttachmentPrimitive.Root className="aui-attachment-root relative animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none">
          {src ? (
            <Dialog>
              <DialogTrigger nativeButton={false} className="aui-attachment-preview-trigger cursor-zoom-in" render={tile} />
              <DialogContent className="aui-attachment-preview-dialog-content p-2 sm:max-w-3xl">
                <DialogTitle className="sr-only">{translate("Preview")}{name}</DialogTitle>
                <div className="aui-attachment-preview bg-background relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden rounded-sm">
                  <img src={src} alt={translate(`Preview of ${name}`)} className="block h-auto max-h-[80vh] w-auto max-w-full rounded-sm object-contain" />
                </div>
              </DialogContent>
            </Dialog>
          ) : tile}
          <AttachmentPrimitive.Remove asChild>
            <button type="button" aria-label={translate(`Remove ${name}`)} className="aui-attachment-tile-remove absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-40">
              <XIcon className="aui-attachment-remove-icon size-3 stroke-[2.5]" />
            </button>
          </AttachmentPrimitive.Remove>
        </AttachmentPrimitive.Root>
        <TooltipContent side="top">
          <AttachmentPrimitive.Name />
          {errorMessage && <p className="aui-attachment-error-message">{errorMessage}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ModelingComposerAttachments({ translate = identity }: { translate?: Translate }) {
  return (
    <div className="aui-composer-attachments flex w-full flex-row items-center gap-2 overflow-x-auto empty:hidden">
      <ComposerPrimitive.Attachments>{() => <AttachmentTile translate={translate} />}</ComposerPrimitive.Attachments>
    </div>
  );
}
