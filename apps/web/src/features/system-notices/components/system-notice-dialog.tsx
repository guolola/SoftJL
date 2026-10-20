// Connects the uploaded notification component to real data and single-announcement dialogs.
import { useState } from "react";
import type { SystemNoticeDto } from "@uml-platform/contracts";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { cn } from "../../../shared/ui/utils";
import NotificationDropdown from "./dropdown-notification";
import { useNotificationCenter } from "../use-notification-center";
import motion from "./notification-motion.module.css";

export function SystemNoticeDialog({ notice, onClose }: { notice: SystemNoticeDto | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  return <Dialog open={!!notice} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{notice?.title ?? t("notices.title")}</DialogTitle>
        <DialogDescription>{notice ? `${t(`notices.types.${notice.type}`)} · ${new Date(notice.publishedAt ?? notice.createdAt).toLocaleString(i18n.language)}` : ""}</DialogDescription>
      </DialogHeader>
      <article className="min-h-0 space-y-3 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7">
        {notice?.contentBlocks.map((block, index) => block.kind === "list_item"
          ? <ul key={index} className="list-disc pl-5"><li>{block.text}</li></ul>
          : <p key={index}>{block.text}</p>)}
      </article>
    </DialogContent>
  </Dialog>;
}

export function SystemNoticeButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const center = useNotificationCenter();
  const [open, setOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<SystemNoticeDto | null>(null);
  const showNotice = (notice: SystemNoticeDto) => {
    setOpen(false);
    setSelectedNotice(notice);
    if (notice.unread) void center.markNoticesRead([notice.id]);
  };
  return <>
    <NotificationDropdown
      open={open}
      onOpenChange={next => { setOpen(next); if (next) void center.refresh(); }}
      trigger={<Button type="button" variant="ghost" size="icon" className={cn(className, "relative")} aria-label={center.unreadCount ? t("notices.buttonUnreadAria", { count: center.unreadCount }) : t("notices.buttonAria")}>
        <Bell className={cn("size-5", center.unreadCount > 0 && motion.bell)} />
        {center.unreadCount > 0 && <span data-slot="notification-unread-dot" className={cn("absolute right-0.5 top-1 size-2 rounded-full bg-sky-600 dark:bg-sky-400", motion.unreadDot)} aria-hidden="true" />}
      </Button>}
      messages={center.messages}
      notices={center.notices}
      unreadCount={center.unreadCount}
      loading={center.loading}
      inboxError={center.inboxError}
      noticeError={center.noticeError}
      busyId={center.busyId}
      onRefresh={() => void center.refresh()}
      onMessageAction={(message, action) => void center.act(message, action)}
      onNoticeSelect={showNotice}
      onNoticeDismiss={notice => void center.dismissNotice(notice.id)}
    />
    <SystemNoticeDialog notice={selectedNotice} onClose={() => setSelectedNotice(null)} />
  </>;
}
