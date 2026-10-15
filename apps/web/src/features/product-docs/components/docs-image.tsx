// Shows current product screenshots at their natural aspect ratio with a keyboard-accessible preview.
import { useState, type ImgHTMLAttributes } from "react";
import { ZoomIn } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../shared/ui/dialog";

export function DocsImage({ src, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [open, setOpen] = useState(false);
  const { i18n } = useTranslation();
  const english = i18n.resolvedLanguage === "en" || i18n.language === "en";
  if (!src) return null;
  const label = `${english ? "Enlarge image" : "放大图片"}：${alt}`;
  return (
    <span className="my-6 block">
      <Button type="button" variant="ghost" className="group relative block h-auto p-0 w-full cursor-zoom-in overflow-hidden rounded-xl border border-border bg-muted/20 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-500" aria-label={label} onClick={() => setOpen(true)}>
        <img {...props} src={src} alt={alt} loading="lazy" className="h-auto w-full object-contain" />
        <span aria-hidden="true" className="absolute right-3 bottom-3 rounded-md border bg-background/95 p-2 text-foreground shadow-sm"><ZoomIn className="size-4" /></span>
      </Button>
      {alt && <span className="mt-2 block text-center text-xs leading-5 text-muted-foreground">{alt}</span>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-[96vw]">
          <DialogTitle className="pr-8">{alt || (english ? "Screenshot" : "界面截图")}</DialogTitle>
          <DialogDescription className="sr-only">{english ? "Press Escape to close the image preview." : "按 Escape 关闭图片预览。"}</DialogDescription>
          <img src={src} alt={alt} className="max-h-[80dvh] w-full object-contain" />
        </DialogContent>
      </Dialog>
    </span>
  );
}
