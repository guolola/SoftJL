// Coordinates visible-page polling and explicit grants; stale requests cannot overwrite newer state.
import { mcpProjectAccessSchema, type McpProjectAccess } from "@uml-platform/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { mcpApi, McpApiError, type ConnectionInfo } from "../services/mcp-api";

export function useMcpConnections(interactionId: string | null, onNavigate: (path: string) => void) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<McpProjectAccess>(() => {
    const projectId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("projectId");
    return { projectScope: "selected", projectIds: projectId ? [projectId] : [] };
  });
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [client, setClient] = useState<{ clientName: string; clientId: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(false);
  const busyRef = useRef(false);
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const report = useCallback((failure: unknown) => {
    if (!active.current) return;
    if (failure instanceof McpApiError && failure.status === 401) {
      const returnPath = interactionId ? `/account/connections?interaction=${encodeURIComponent(interactionId)}` : "/projects/connections";
      onNavigate(`/login?redirect=${encodeURIComponent(returnPath)}`);
    }
    setError(t(failure instanceof McpApiError && failure.code === "guest_not_allowed" ? "mcp.guestForbidden" : failure instanceof McpApiError && failure.status === 403 ? "mcp.forbidden" : failure instanceof McpApiError && failure.status === 401 ? "mcp.loginRequired" : "mcp.operationFailed"));
  }, [interactionId, onNavigate, t]);
  const reload = useCallback(async () => {
    if (request.current || !active.current) return;
    const controller = new AbortController();
    request.current = controller;
    const generation = revision.current;
    setRefreshing(true);
    try {
      const response = await mcpApi.connections(controller.signal);
      const details = interactionId && response.enabled ? await mcpApi.interaction(interactionId, controller.signal) : null;
      if (!active.current || controller.signal.aborted || generation !== revision.current) return;
      setInfo(response);
      setSelection(current => ({ ...current, projectIds: current.projectIds.filter(id => response.projects?.some(project => project.id === id)) }));
      setClient(details);
      setError("");
    } catch (failure) {
      if (!controller.signal.aborted && generation === revision.current) report(failure);
    } finally {
      if (request.current === controller) request.current = null;
      if (active.current && generation === revision.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [interactionId, report]);
  useEffect(() => {
    active.current = true;
    revision.current += 1;
    setLoading(true);
    setInfo(null);
    setToken("");
    setClient(null);
    setError("");
    void reload();
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && !busyRef.current) void reload();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        request.current?.abort();
        request.current = null;
        setRefreshing(false);
      } else refreshVisible();
    };
    const timer = window.setInterval(refreshVisible, 10_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refreshVisible);
    return () => {
      active.current = false;
      revision.current += 1;
      request.current?.abort();
      request.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [reload]);
  async function mutate(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    // A grant change invalidates any read begun before it, including an in-flight poll.
    revision.current += 1;
    request.current?.abort();
    request.current = null;
    try { await action(); } catch (failure) { report(failure); }
    finally {
      busyRef.current = false;
      if (active.current) { setBusy(false); setRefreshing(false); }
    }
  }
  function finish(redirect: string) {
    const target = new URL(redirect);
    const server = new URL(info!.serverUrl!);
    if (target.origin !== server.origin || !target.pathname.startsWith("/api/mcp/oauth/")) throw new Error(t("mcp.invalidRedirect"));
    window.location.assign(target.href);
  }
  return {
    selection, setSelection, selectionValid: mcpProjectAccessSchema.safeParse(selection).success,
    resetSelection: () => {
      const projectId = new URLSearchParams(window.location.search).get("projectId");
      setSelection({ projectScope: "selected", projectIds: projectId && info?.projects?.some(project => project.id === projectId) ? [projectId] : [] });
    },
    info, client, error, busy, token, setToken, loading, refreshing,
    retry: () => { if (!busyRef.current) void reload(); },
    create: (name: string) => mutate(async () => {
      if (!name.trim() || !info?.csrf || !info.enabled || error) throw new Error(t("mcp.operationFailed"));
      const response = await mcpApi.createToken(name.trim(), info.csrf, mcpProjectAccessSchema.parse(selection));
      if (active.current) setToken(response.token);
      await reload();
    }),
    revoke: (id: string) => mutate(async () => {
      if (!info?.csrf || !info.enabled) return;
      await mcpApi.revoke(id, info.csrf);
      if (active.current) setToken("");
      await reload();
    }),
    consent: () => mutate(async () => {
      if (!interactionId || !client || !info?.csrf || !info.enabled || error) throw new Error(t("mcp.operationFailed"));
      finish((await mcpApi.consent(interactionId, info.csrf, mcpProjectAccessSchema.parse(selection))).redirect);
    }),
    deny: () => mutate(async () => { if (interactionId && info?.csrf) finish((await mcpApi.deny(interactionId, info.csrf)).redirect); }),
  };
}
