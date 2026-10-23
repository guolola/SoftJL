// Keeps ordinary run progress server-owned so reloading or changing views preserves completed diagrams and questions.
import { i18n } from "../../../shared/i18n/index";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StandardProjectState, StandardModel, StandardConversationMessage } from "@uml-platform/contracts";
import { standardApi, type StandardCommand } from "../services/standard-api";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { ApiClientError } from "../../../services/api-client/index";
import { identifyCommand, pendingCommand, retainCommand } from "../services/command-recovery";
import { clearConversationDraft } from "./use-conversation-draft";
import { primeCompletionChime } from "../../../shared/lib/completion-chime";
import { useStandardCompletionChime } from "./use-standard-completion-chime";

export type StandardConnectionPhase = "online" | "dropped" | "reconnecting" | "resumed";
const transportFailure = (cause: unknown) => cause instanceof TypeError || cause instanceof ApiClientError && (cause.status === 0 || cause.status >= 500);

export function useStandardProject(projectId: string, canEdit: boolean) {
  const [state, setState] = useState<StandardProjectState | null>(null);
  // This hook stays mounted while switching between chat, models, tests, and documents.
  useStandardCompletionChime(projectId, state);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<{ projectId: string; message: StandardConversationMessage } | null>(null);
  const [connection, setConnection] = useState<StandardConnectionPhase>("online");
  const connectionRef = useRef<StandardConnectionPhase>("online");
  const setPhase = (phase: StandardConnectionPhase) => { connectionRef.current = phase; setConnection(phase); };
  const identity = useRef(projectId); identity.current = projectId;
  const polling = useRef(0);
  const busy = useRef(false);
  // Primitive dependencies avoid repeating the same failure on every polling response.
  useEffect(() => {
    if (error) floatingAlert.error(error, { id: `standard-project-${projectId}-error` });
  }, [error, projectId]);
  useEffect(() => {
    if (state?.run?.status === "failed" && state.run.error) {
      floatingAlert.error(state.run.error, { id: `standard-project-${projectId}-error` });
    }
  }, [projectId, state?.run?.id, state?.run?.status, state?.run?.error]);
  const refresh = useCallback(async () => {
    const generation = polling.current;
    try { const result = await standardApi.read(projectId); if (identity.current === projectId && generation === polling.current) {
      const command = pendingCommand(projectId);
      if (command && command.requestId === result.state.run?.requestId) {
        retainCommand(projectId, null);
        if (command.operation === "chat" && command.message) clearConversationDraft(projectId, command.message);
      }
      setState(result.state); setError(""); if (connectionRef.current !== "online") setPhase("resumed");
    } return result.state; }
    catch (cause) { if (identity.current === projectId && generation === polling.current) {
      if (transportFailure(cause)) setPhase("dropped");
      else setError(cause instanceof Error ? cause.message : i18n.t("standardProject.loadFailed"));
    } return undefined; }
  }, [projectId]);
  useEffect(() => {
    setState(null); setError(""); setPending(false); setOptimistic(null); busy.current = false; setPhase("online"); void refresh();
    const generation = polling.current;
    return () => { polling.current = generation + 1; };
  }, [refresh]);
  const running = state?.run?.status === "running";
  const reconnect = useCallback(async () => { setPhase("reconnecting"); await refresh(); }, [refresh]);
  useEffect(() => {
    const offline = () => setPhase("dropped");
    const online = () => void reconnect();
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    if (!navigator.onLine) offline();
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [reconnect]);
  useEffect(() => {
    if (connection !== "resumed") return;
    const timer = setTimeout(() => setPhase("online"), 2500);
    return () => clearTimeout(timer);
  }, [connection]);
  useEffect(() => {
    if ((!running && connection !== "dropped" && connection !== "reconnecting") || pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(poll, 1800); };
    timer = setTimeout(poll, 1200);
    return () => { stopped = true; clearTimeout(timer); };
  }, [running, pending, refresh, connection]);
  const mutate = async (action: () => Promise<{ state: StandardProjectState }>, requestId?: string) => {
    if (!canEdit || busy.current || connectionRef.current === "dropped" || connectionRef.current === "reconnecting") return false;
    busy.current = true;
    setPending(true); setError(""); polling.current++;
    try { const result = await action(); if (identity.current === projectId) setState(result.state); return true; }
    catch (cause) { if (identity.current === projectId) {
      if (transportFailure(cause)) { setPhase("dropped"); const restored = await refresh(); if (requestId && restored?.run?.requestId === requestId) return true; }
      else { setError(cause instanceof Error ? cause.message : i18n.t("standardProject.actionFailed")); if (cause instanceof ApiClientError && cause.status === 409) await refresh(); }
    } return false; }
    finally { if (identity.current === projectId) { busy.current = false; setPending(false); } }
  };
  useEffect(() => {
    if (optimistic?.projectId === projectId && state?.conversation?.some(message => message.id === optimistic.message.id)) setOptimistic(null);
  }, [optimistic, projectId, state?.conversation]);
  // A request-scoped message is shown immediately, then replaced by the durable message
  // with the same id. Stale polling snapshots cannot duplicate or erase the pending turn.
  const visibleState = state && optimistic?.projectId === projectId && !state.conversation?.some(message => message.id === optimistic.message.id)
    ? { ...state, conversation: [...(state.conversation ?? []), optimistic.message] } : state;
  return { state: visibleState, error, pending, connection, reconnect, running: Boolean(running), refresh,
    start: async (command: StandardCommand) => { if (!running && !busy.current) {
      const identified = identifyCommand(projectId, command); const requestId = identified.requestId!;
      const accepted = await mutate(async () => {
        primeCompletionChime();
        if (identified.operation === "chat" && (identified.message?.trim() || identified.attachments?.length)) {
          setOptimistic({ projectId, message: { id: `user:${requestId}`, role: "user", text: identified.message?.trim() || "请根据附件分析项目需求。",
            status: "completed", createdAt: new Date().toISOString(), attachments: identified.attachments, quote: identified.quote } });
        }
        retainCommand(projectId, identified);
        try { const result = await standardApi.start(projectId, identified); retainCommand(projectId, null); return result; }
        catch (cause) {
          if (!transportFailure(cause)) { retainCommand(projectId, null); throw cause; }
          // Reconcile a lost acknowledgement by reading the existing task; never replay generation on reconnect.
          const recovered = await standardApi.read(projectId).catch(() => null);
          if (recovered?.state.run?.requestId === requestId) { retainCommand(projectId, null); return recovered; }
          throw cause;
        }
      }, requestId);
      if (!accepted && identity.current === projectId) setOptimistic(current => current?.message.id === `user:${requestId}` ? null : current);
      return accepted;
    } },
    cancel: () => mutate(() => standardApi.cancel(projectId)),
    feedback: (messageId: string, type: "positive" | "negative") => mutate(() => standardApi.feedback(projectId, messageId, type)),
    saveDescription: (description: string) => { if (!running) return mutate(() => standardApi.saveDescription(projectId, description)); },
    saveModel: (id: string, model: StandardModel) => { if (!running) return mutate(() => standardApi.saveModel(projectId, id, model)); },
  };
}
