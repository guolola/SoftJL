// Renders the Figma-inspired system notice timeline and top-bar trigger.
import { useEffect, useMemo, useState } from "react";
import type { SystemNoticeDto, SystemNoticeType } from "@uml-platform/contracts";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import confetti from "canvas-confetti";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Badge } from "../../../shared/ui/badge";
import { cn } from "../../../shared/ui/utils";
import { systemNoticeApi } from "../system-notice-api";
import type { badgeVariants } from "../../../shared/ui/badge";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";

type NoticeBadgeVariant = NonNullable<
  Parameters<typeof badgeVariants>[0]
>["variant"];

const NOTICE_TYPE_DOT_CLASS: Record<SystemNoticeType, string> = {
  model_update: "bg-info",
  feature_update: "bg-info",
  important: "bg-destructive",
  maintenance: "bg-warning",
};

const NOTICE_TYPE_BADGE_VARIANT: Record<SystemNoticeType, NoticeBadgeVariant> = {
  model_update: "secondary",
  feature_update: "secondary",
  important: "destructive",
  maintenance: "secondary",
};

function fireSystemNoticeConfetti() {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
  };
  const fire = (
    particleRatio: number,
    opts: Parameters<typeof confetti>[0],
  ) => {
    void confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  };

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });
  fire(0.2, {
    spread: 60,
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
}

function formatDateTimeParts(value: string | null | undefined, locale: string, t: TFunction) {
  if (!value) return { date: t("notices.unpublished"), time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: "" };
  const formattedDate = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
  const time = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return { date: formattedDate, time };
}

function formatRelativeTime(value: string | null | undefined, locale: string, t: TFunction) {
  if (!value) return t("notices.unpublished");
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return t("notices.published");
  const diffMs = Math.max(0, Date.now() - time);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / dayMs);
  if (days <= 0) return t("notices.today");
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (days < 7) return formatter.format(-days, "day");
  if (days < 30) return formatter.format(-Math.floor(days / 7), "week");
  return formatter.format(-Math.floor(days / 30), "month");
}

function SystemNoticeTimelineItem({
  notice,
  isLast,
}: {
  notice: SystemNoticeDto;
  isLast: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en" : "zh-CN";
  const published = notice.publishedAt ?? notice.createdAt;
  const dateParts = formatDateTimeParts(published, locale, t);
  const listItems = notice.contentBlocks.filter((block) => block.kind === "list_item");
  const paragraphs = notice.contentBlocks.filter((block) => block.kind === "paragraph");

  return (
    <article className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-6 px-4 py-4">
      <div className="relative flex min-h-14 flex-col items-end pr-[25px] text-right">
        <div className="font-mono text-xs font-medium leading-4 text-muted-foreground">
          {formatRelativeTime(published, locale, t)}
        </div>
        <div className="mt-1 text-sm leading-5 text-muted-foreground">
          <div>{dateParts.date}</div>
          {dateParts.time && <div>{dateParts.time}</div>}
        </div>
        {!isLast && (
          <span className="absolute bottom-0 right-[-1px] top-0 w-px bg-border" />
        )}
        <span
          data-testid="system-notice-dot"
          data-notice-type={notice.type}
          className={cn(
            "absolute right-[-7px] top-[5px] size-[14px] rounded-full border-2 border-card shadow-sm",
            NOTICE_TYPE_DOT_CLASS[notice.type],
          )}
        />
      </div>
      <div className="min-w-0 pb-2">
        <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-base font-medium leading-6 text-foreground">
          {notice.icon && <span className="shrink-0">{notice.icon}</span>}
          <span className="min-w-0 break-words">{notice.title}</span>
          <Badge
            variant={NOTICE_TYPE_BADGE_VARIANT[notice.type]}
            className="shrink-0 text-[10px]"
          >
            {t(`notices.types.${notice.type}`)}
          </Badge>
          {notice.unread && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {t("notices.unread")}
            </Badge>
          )}
        </h3>
        {notice.contentBlocks.length > 0 && (
          <div className="mt-3 grid gap-3 rounded-md border border-border bg-muted/40 px-4 py-4 text-sm leading-[22px] text-muted-foreground">
            {paragraphs.map((block, index) => (
              <p key={`paragraph-${index}`} className="break-words">
                {block.text}
              </p>
            ))}
            {listItems.length > 0 && (
              <ul className="grid gap-2">
                {listItems.map((block, index) => (
                  <li key={`list-${index}`} className="flex min-w-0 gap-2">
                    <span className="mt-0.5 font-mono text-primary">{index + 1}</span>
                    <span className="min-w-0 break-words">{block.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function SystemNoticeTimeline({ notices }: { notices: SystemNoticeDto[] }) {
  const { t } = useTranslation();
  if (notices.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center px-6 text-sm text-muted-foreground">
        {t("notices.empty")}
      </div>
    );
  }
  return (
    <div className="min-w-0 py-2">
      {notices.map((notice, index) => (
        <SystemNoticeTimelineItem
          key={notice.id}
          notice={notice}
          isLast={index === notices.length - 1}
        />
      ))}
    </div>
  );
}

export function SystemNoticeDialog({
  open,
  onOpenChange,
  notices,
  loading,
  error,
  onMarkRead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notices: SystemNoticeDto[];
  loading: boolean;
  error: string;
  onMarkRead: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[min(928px,calc(100vh-4rem))] w-[1120px] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-xl border-border bg-card p-0 shadow-lg sm:max-w-[calc(100vw-2rem)] xl:max-w-[1120px]"
        overlayClassName="bg-foreground/40 "
      >
        <DialogHeader className="border-b border-border bg-background/80 px-6 py-4 text-left ">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="px-3 py-1 text-[11px] tracking-[0.08em]">
              {t("notices.badge")}
            </Badge>
            <DialogTitle className="text-xl leading-7 text-foreground">
              {t("notices.title")}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            {t("notices.timelineDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-2 pr-6">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("notices.loading")}
            </div>
          ) : error ? (
            <div className="flex min-h-64 items-center justify-center px-6 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="w-full min-w-0 overflow-x-auto">
              <SystemNoticeTimeline notices={notices} />
            </div>
          )}
        </div>
        <div className="flex justify-center border-t border-border bg-card/90 px-4 py-4 ">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full max-w-md"
            onClick={onMarkRead}
            disabled={loading}
          >
            <CheckCircle2 className="size-4" />
            {t("notices.markRead")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SystemNoticeButton({
  className,
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<SystemNoticeDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const noticeIds = useMemo(() => notices.map((notice) => notice.id), [notices]);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await systemNoticeApi.listPublished();
      setNotices(response.notices);
      setUnreadCount(response.unreadCount);
    } catch (loadError) {
      setError(localizeCaughtFailure(loadError, t("notices.loadFailed")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openDialog = () => {
    setOpen(true);
    void refresh();
  };

  const markRead = async () => {
    try {
      const response = await systemNoticeApi.markRead(noticeIds);
      setNotices(response.notices);
      setUnreadCount(response.unreadCount);
      fireSystemNoticeConfetti();
      setOpen(false);
    } catch (readError) {
      showAlert({
        title: localizeCaughtFailure(readError, t("notices.markReadFailed")),
        tone: "destructive",
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(className, "relative")}
          onClick={openDialog}
          title={t("notices.title")}
          aria-label={unreadCount > 0
            ? t("notices.buttonUnreadAria", { count: unreadCount })
            : t("notices.buttonAria")}
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span
              data-slot="notification-unread-dot"
              aria-hidden="true"
              className="absolute right-0.5 top-1 size-2 animate-bounce rounded-full bg-sky-600 motion-reduce:animate-none dark:bg-sky-400"
            />
          )}
        </Button>
      </div>
      <SystemNoticeDialog
        open={open}
        onOpenChange={setOpen}
        notices={notices}
        loading={loading}
        error={error}
        onMarkRead={() => void markRead()}
      />
    </>
  );
}
