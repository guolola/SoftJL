// Offers optional manual project backgrounds without title matching or business labels.
import { Card } from "../../../shared/ui/card";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import { Check, Images } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { cn } from "../../../shared/ui/utils";
import {
  PROJECT_BACKGROUND_OPTIONS,
  resolveProjectBackground,
} from "../lib/project-backgrounds";

type ProjectBackgroundPickerProps = {
  value: ProjectBackgroundKey | null;
  onChange: (value: ProjectBackgroundKey | null) => void;
  disabled?: boolean;
};

export function ProjectBackgroundPicker({
  value,
  onChange,
  disabled = false,
}: ProjectBackgroundPickerProps) {
  const { t } = useTranslation();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const selectedBackground = resolveProjectBackground(value);

  const selectBackground = (backgroundKey: ProjectBackgroundKey | null) => {
    if (disabled) return;
    onChange(backgroundKey);
    setGalleryOpen(false);
  };

  return (
    <div className="grid gap-3">
      <Card className="gap-0 py-0 overflow-hidden">
        <div className="relative aspect-[16/7] min-h-28 overflow-hidden bg-muted">
          {selectedBackground && <img
            data-testid="project-background-preview-image"
            src={selectedBackground.imageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />}
          <div className="absolute inset-0 bg-background/60" />
          <Button
            type="button"
            size="default"
            variant="default"
            disabled={disabled}
            className="absolute left-1/2 top-1/2 border -translate-x-1/2 -translate-y-1/2"
            onClick={() => setGalleryOpen(true)}
          >
            <Images className="size-3.5" />
            {t("projectBackground.select")}
          </Button>
        </div>
      </Card>
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden p-4 sm:max-w-5xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{t("projectBackground.title")}</DialogTitle>
            <DialogDescription>
              {t("projectBackground.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 overflow-hidden">
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant={value === null ? "secondary" : "outline"}
                aria-pressed={value === null}
                disabled={disabled}
                onClick={() => selectBackground(null)}
              >
                {t("projectBackground.none")}
              </Button>
            </div>
            <div
              data-testid="project-background-gallery"
              aria-label={t("projectBackground.gallery")}
              className="grid max-h-[calc(100dvh-15rem)] min-h-0 grid-cols-3 grid-rows-7 gap-2 overflow-hidden sm:grid-cols-7 sm:grid-rows-3 sm:gap-3"
            >
              {PROJECT_BACKGROUND_OPTIONS.map((background, index) => {
                const selected = value === background.key;
                return (
                  <Button variant="outline"
                    key={background.key}
                    type="button"
                    aria-pressed={selected}
                    aria-label={t("projectBackground.option", { number: index + 1 })}
                    disabled={disabled}
                    className={cn(
                      "group relative aspect-video h-auto min-h-0 w-full overflow-hidden rounded-lg border-2 p-0 transition-[border-color,box-shadow,transform] focus-visible:border-ring",
                      selected ? "border-primary shadow-sm" : "border-transparent hover:border-foreground/30",
                    )}
                    onClick={() => selectBackground(background.key)}
                  >
                    <img
                      src={background.imageUrl}
                      alt=""
                      className="absolute inset-0 size-full object-cover transition-transform group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                    {selected && (
                      <span className="absolute right-1 top-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="size-3" />
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
