// Composes the MCP client catalog, setup dialogs and revocable connection records.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/alert";
import { Skeleton } from "../../../shared/ui/skeleton";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../../shared/ui/dialog";
import { PageContainer } from "../../../shared/template/layout/page";
import { useMcpConnections } from "../model/use-mcp-connections";
import { mcpClients, type McpClientId } from "../model/client-configurations";
import type { Connection } from "../services/mcp-api";
import { ClientCatalog, ClientCatalogHero } from "./client-catalog";
import { ClientSetupDialog } from "./client-setup-dialog";
import { ProjectUsageExamples } from "./project-usage-examples";
import { ConnectionRecordsTable } from "./connection-records-table";

export function McpConnectionsPanel({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useTranslation();
  const state = useMcpConnections(null, onNavigate);
  const [clientId, setClientId] = useState<McpClientId | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Connection | null>(null);
  const clientTrigger = useRef<HTMLButtonElement | null>(null);
  const client = mcpClients.find((item) => item.id === clientId);
  const disabled = state.busy || !state.info?.enabled || Boolean(state.error);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      floatingAlert.success(t("mcp.copied"), { id: "mcp-copy", durationMs: 3000 });
      return true;
    } catch {
      floatingAlert.error(t("mcp.copyFailed"), { id: "mcp-copy", durationMs: 6000 });
      return false;
    }
  }

  function selectClient(id: McpClientId, trigger: HTMLButtonElement) {
    if (state.busy) return;
    clientTrigger.current = trigger;
    state.setToken("");
    // Each new client starts with the current project, never a previous client's account grant.
    state.resetSelection();
    setClientId(id);
  }

  return (
    <section className="min-w-0 space-y-12 pb-8 sm:space-y-16" aria-label={t("mcp.title")}>
      <ClientCatalogHero />
      {state.loading ? (
        <div aria-busy="true" className="@container/mcp-catalog space-y-5">
          <p role="status">{t("mcp.loading")}</p>
          <div className="grid grid-cols-1 gap-6 @[36rem]/mcp-catalog:grid-cols-2 @[56rem]/mcp-catalog:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-80 rounded-xl" />)}
          </div>
        </div>
      ) : (
        <>
          {state.error && <Alert variant="destructive"><AlertTitle>{state.error}</AlertTitle><AlertDescription>{t("mcp.stale")}</AlertDescription><Button variant="outline" disabled={state.busy || state.refreshing} onClick={state.retry}>{t("mcp.retry")}</Button></Alert>}
          {state.info && !state.info.enabled && <Alert><AlertTitle>{t("mcp.status.disabled")}</AlertTitle><AlertDescription>{t("mcp.disabled")}</AlertDescription></Alert>}
          {state.info?.enabled && <>
            <ClientCatalog onSelect={selectClient} serverUrl={state.info.serverUrl ?? ""} onCopy={copy} />

            <div className="min-w-0 space-y-6">
              <div className="space-y-3">
                <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">{t("mcp.guide")}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{t("mcp.guideDescription")}</p>
              </div>
              <ProjectUsageExamples onCopy={copy} />
            </div>
            <ConnectionRecordsTable connections={state.info.connections ?? []} projects={state.info.projects ?? []} disabled={disabled} stale={Boolean(state.error)} onRevoke={setRevokeTarget} />
          </>}
        </>
      )}
      {/* A pending credential mutation keeps its dialog open; closing clears the one-time secret. */}
      <Dialog open={Boolean(client)} onOpenChange={(open) => {
        if (!open && !state.busy) { state.setToken(""); setClientId(null); }
      }}>
        {client && <ClientSetupDialog key={client.id} client={client} state={state} onCopy={copy} finalFocus={clientTrigger} />}
      </Dialog>
      <Dialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open && !state.busy) setRevokeTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("mcp.revokeTitle")}</DialogTitle><DialogDescription>{revokeTarget?.name} · {t("mcp.revokeDescription")}</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={state.busy} onClick={() => setRevokeTarget(null)}>{t("mcp.cancel")}</Button>
            <Button variant="destructive" disabled={disabled} onClick={async () => { if (revokeTarget) await state.revoke(revokeTarget.id); setRevokeTarget(null); }}>{t("mcp.revoke")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function McpConnectionsPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const legacy = typeof window !== "undefined" && window.location.pathname === "/account/connections";
  useEffect(() => { if (legacy) onNavigate("/projects/connections"); }, [legacy, onNavigate]);
  if (legacy) return null;
  return <PageContainer className="w-full min-w-0 max-w-360 bg-background px-5 py-8 sm:px-8 lg:px-12"><McpConnectionsPanel onNavigate={onNavigate} /></PageContainer>;
}
