// Coordinates independent inbox/announcement loads and persistent read/decision actions.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InboxMessage, SystemNoticeDto } from "@uml-platform/contracts";
import { localizeCaughtFailure } from "../../shared/i18n/api-errors";
import { useFloatingAlert } from "../../shared/ui/floating-alert";
import { AUTH_SESSION_CHANGED_EVENT } from "../user-platform/services/platform-api";
import { inboxApi } from "./inbox-api";
import { systemNoticeApi } from "./system-notice-api";

export function useNotificationCenter() {
  const { t } = useTranslation();
  const translation = useRef(t);
  translation.current = t;
  const { showAlert } = useFloatingAlert();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [notices, setNotices] = useState<SystemNoticeDto[]>([]);
  const [inboxError, setInboxError] = useState("");
  const [noticeError, setNoticeError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inboxRevision = useRef(0);
  const noticeRevision = useRef(0);
  const activeAction = useRef<symbol | null>(null);
  const refresh = useCallback(async () => {
    const inboxVersion = inboxRevision.current, noticeVersion = noticeRevision.current;
    setLoading(true);
    // One unavailable feed must not hide the other feed's data or error state.
    const [inbox, general] = await Promise.allSettled([inboxApi.list(), systemNoticeApi.listPublished()]);
    // An older refresh must not reinsert an item after a read/dismiss action has completed.
    if (inboxVersion === inboxRevision.current) {
      if (inbox.status === "fulfilled") { setMessages(inbox.value.messages); setInboxError(""); }
      else setInboxError(localizeCaughtFailure(inbox.reason, translation.current("notices.loadFailed")));
    }
    if (noticeVersion === noticeRevision.current) {
      if (general.status === "fulfilled") { setNotices(general.value.notices); setNoticeError(""); }
      else setNoticeError(localizeCaughtFailure(general.reason, translation.current("notices.loadFailed")));
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    const onSession = () => {
      ++inboxRevision.current; ++noticeRevision.current;
      activeAction.current = null; setBusyId(null);
      setMessages([]); setNotices([]); void refresh();
    };
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => { window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSession); window.clearInterval(interval); };
  }, [refresh]);
  const act = async (message: InboxMessage, action: "read" | "dismiss" | "accept" | "decline") => {
    if (activeAction.current) return;
    const task = Symbol(), version = ++inboxRevision.current;
    activeAction.current = task;
    setBusyId(message.id);
    try {
      const result = await inboxApi.act(message, action);
      if (version === inboxRevision.current) { ++inboxRevision.current; setMessages(result.messages); }
    }
    catch (error) { showAlert({ title: localizeCaughtFailure(error, t("notices.actionFailed")), tone: "destructive" }); }
    finally { if (activeAction.current === task) { activeAction.current = null; setBusyId(null); } }
  };
  const markNoticesRead = async (ids: string[]) => {
    if (!ids.length) return;
    const version = ++noticeRevision.current;
    try {
      const result = await systemNoticeApi.markRead(ids);
      if (version === noticeRevision.current) { ++noticeRevision.current; setNotices(result.notices); }
    }
    catch (error) { showAlert({ title: localizeCaughtFailure(error, t("notices.markReadFailed")), tone: "destructive" }); }
  };
  const dismissNotice = async (id: string) => {
    if (activeAction.current) return;
    const task = Symbol(), version = ++noticeRevision.current;
    activeAction.current = task;
    setBusyId(`notice:${id}`);
    try {
      const result = await systemNoticeApi.dismiss(id);
      if (version === noticeRevision.current) { ++noticeRevision.current; setNotices(result.notices); }
    } catch (error) {
      showAlert({ title: localizeCaughtFailure(error, t("notices.actionFailed")), tone: "destructive" });
    } finally { if (activeAction.current === task) { activeAction.current = null; setBusyId(null); } }
  };
  return { messages, notices, inboxError, noticeError, loading, busyId, refresh, act, markNoticesRead, dismissNotice, unreadCount: messages.filter(message => message.unread).length + notices.filter(notice => notice.unread).length };
}
