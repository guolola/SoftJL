// Presents explicit project consent independently of the connection-management workbench.
import { ProjectAccessSelector } from "./project-access-selector";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../shared/ui/card";
import { Skeleton } from "../../../shared/ui/skeleton";
import { useMcpConnections } from "../model/use-mcp-connections";

type McpConsentProps = { interactionId: string; onNavigate: (path: string) => void };

export function McpConsentPanel({ interactionId, onNavigate }: McpConsentProps) {
  const { t } = useTranslation();
  const state = useMcpConnections(interactionId, onNavigate);
  const disabled = state.busy || !state.info?.enabled || Boolean(state.error);

  return <Card className="w-full min-w-0 overflow-visible shadow-xl">
    {state.loading ? <CardContent aria-busy="true" className="space-y-5">
      <p role="status" className="text-sm text-muted-foreground">{t("mcp.loading")}</p>
      <Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" />
    </CardContent> : <>
      <CardHeader>
        <CardTitle><h1 className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-5 shrink-0" />{t("mcp.consentTitle", { name: state.client?.clientName ?? t("mcp.title") })}</h1></CardTitle>
        {state.client && <CardDescription className="break-all">{t("mcp.clientId")}: {state.client.clientId}</CardDescription>}
        <CardDescription>{t("mcp.consentHelp")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {state.error && <Alert variant="destructive"><AlertTitle>{state.error}</AlertTitle><AlertDescription>{t("mcp.stale")}</AlertDescription><Button variant="outline" disabled={state.busy || state.refreshing} onClick={state.retry}>{t("mcp.retry")}</Button></Alert>}
        {state.info && !state.info.enabled && <Alert><AlertTitle>{t("mcp.status.disabled")}</AlertTitle><AlertDescription>{t("mcp.disabled")}</AlertDescription></Alert>}
        {state.info?.enabled && <>
          <ProjectAccessSelector projects={state.info.projects ?? []} value={state.selection} onChange={state.setSelection} disabled={disabled} />
          <div className="flex flex-wrap gap-3"><Button disabled={disabled || !state.client || !state.selectionValid} onClick={() => { if (state.selectionValid && !disabled) void state.consent(); }}>{t("mcp.authorize")}</Button><Button variant="outline" disabled={state.busy} onClick={() => void state.deny()}>{t("mcp.cancel")}</Button></div>
        </>}
      </CardContent>
    </>}
  </Card>;
}

export function McpConsentPage(props: McpConsentProps) {
  return <main className="relative isolate flex min-h-svh w-full flex-1 items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
    {/* The decorative workbench stays inert; only the consent card receives focus or interaction. */}
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-br from-primary/10 via-background to-muted" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-background/65 backdrop-blur-md dark:bg-background/85" />
    <div className="w-full min-w-0 max-w-2xl"><McpConsentPanel key={props.interactionId} {...props} /></div>
  </main>;
}
