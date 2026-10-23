// Provides a lightweight, accessible wrapper around native MP4 playback.
import type { ComponentPropsWithRef } from "react";
import { Film, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { i18n as appI18n } from "../i18n/index";
import { cn } from "./utils";

type VideoPlayerProps = Omit<ComponentPropsWithRef<"video">, "src"> & {
  src?: string;
  title: string;
  description?: string;
  caption?: string;
  className?: string;
  mediaClassName?: string;
};

export function VideoPlayer({
  src,
  title,
  description,
  caption,
  className,
  mediaClassName,
  ...props
}: VideoPlayerProps) {
  const translation = useTranslation();
  const t = translation.i18n.exists("media.video.notConfigured")
    ? translation.t
    : appI18n.t.bind(appI18n);
  const videoSrc = src?.trim();

  return (
    <figure
      data-testid="video-player"
      className={cn("overflow-hidden rounded-lg border border-border bg-background", className)}
    >
      <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
        {videoSrc ? (
          <video
            aria-label={title}
            className={cn("h-full w-full bg-black object-contain", mediaClassName)}
            controls
            playsInline
            preload="metadata"
            {...props}
          >
            <source src={videoSrc} type="video/mp4" />
            {t("media.video.unsupported")}
          </video>
        ) : (
          <div
            role="status"
            className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
          >
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Film className="size-5" />
            </span>
            <span className="font-medium text-foreground">{t("media.video.notConfigured")}</span>
            <span className="max-w-md leading-6">
              {t("media.video.configurationHint")}
            </span>
          </div>
        )}
      </div>
      {(caption || description) && (
        <figcaption className="flex items-start gap-2 px-4 py-3 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            {caption}
            {caption && description ? t("media.captionSeparator") : ""}
            {description}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
