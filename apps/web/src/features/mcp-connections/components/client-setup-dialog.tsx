// Keeps a selected client's authentication and one-time credentials inside its setup dialog.
import { ProjectAccessSelector } from "./project-access-selector";
import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { SelectControl } from "../../../shared/ui/select";
import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/alert";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../../shared/ui/dialog";
import { clientAuthModes, type mcpClients } from "../model/client-configurations";
import type { useMcpConnections } from "../model/use-mcp-connections";
import { ClientConnectionGuide } from "./client-connection-guide";
import { ClientIcon } from "./client-icon";

export function ClientSetupDialog({ client, state, onCopy, finalFocus }: {
  client: (typeof mcpClients)[number];
  state: ReturnType<typeof useMcpConnections>;
  onCopy: (value: string) => Promise<boolean>;
  finalFocus: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const authModes = clientAuthModes(client.id);
  const [mode, setMode] = useState<"oauth" | "pat">(authModes[0] ?? "oauth");
  // Keep the action guard aligned with the desktop modes actually covered by the guide.
  const authMode = authModes.includes(mode) ? mode : authModes[0] ?? "oauth";
  const canCreateToken = authMode === "pat" && authModes.includes("pat");
  const disabled = state.busy || !state.info?.enabled || Boolean(state.error);

  return (
    <DialogContent className="max-h-[calc(100dvh-3rem)] overflow-y-auto sm:max-w-2xl" finalFocus={finalFocus}>
      <DialogHeader className="pr-8">
        <ClientIcon clientId={client.id} className="mb-2" />
        <DialogTitle className="text-xl">{t("mcp.catalog.connectTitle", { name: client.name })}</DialogTitle>
        <DialogDescription>{t("mcp.setupDescription")}</DialogDescription>
      </DialogHeader>
      {state.error && <Alert variant="destructive"><AlertTitle>{state.error}</AlertTitle><AlertDescription>{t("mcp.stale")}</AlertDescription><Button variant="outline" disabled={state.busy || state.refreshing} onClick={state.retry}>{t("mcp.retry")}</Button></Alert>}
      {authModes.length > 0 && <div className="space-y-2">
        <Label htmlFor="mcp-auth-mode">{t("mcp.authMode")}</Label>
        <SelectControl id="mcp-auth-mode" value={authMode} disabled={authModes.length === 1 || state.busy} onValueChange={(value) => { if (authModes.includes(value as "oauth" | "pat")) setMode(value as "oauth" | "pat"); }} options={authModes.map((value) => ({ value, label: t(value === "oauth" ? "mcp.oauth" : "mcp.pat") }))} />
        {authModes.length === 1 && <p className="text-sm text-muted-foreground">{t(authMode === "pat" ? "mcp.catalog.tokenOnly" : "mcp.catalog.oauthOnly")}</p>}
      </div>}
      <ClientConnectionGuide clientId={client.id} url={state.info?.serverUrl ?? ""} mode={authMode} onCopy={onCopy} />
      {authModes.includes("oauth") && authMode === "oauth" && <p className="text-sm leading-6 text-muted-foreground">{t("mcp.oauthHelp")}</p>}
      {canCreateToken && (
        <div className="space-y-4 border-t pt-5">
          <ProjectAccessSelector projects={state.info?.projects ?? []} value={state.selection} onChange={state.setSelection} disabled={disabled} />
          <div className="space-y-2"><Label htmlFor="mcp-token-name">{t("mcp.name")}</Label><Input id="mcp-token-name" maxLength={80} placeholder={t("mcp.namePlaceholder")} value={name} disabled={disabled} onChange={(event) => setName(event.target.value)} /></div>
          <Button disabled={disabled || !name.trim() || !state.selectionValid} onClick={() => { if (canCreateToken && !disabled && state.selectionValid && name.trim()) void state.create(name); }}>{t("mcp.create")}</Button>
          <p className="text-xs leading-5 text-muted-foreground">{t("mcp.tokenHelp")}</p>
        </div>
      )}
      {state.token && <div className="space-y-3 border-t pt-5">
        <Label htmlFor="mcp-new-token">{t("mcp.token")}</Label>
        <Input id="mcp-new-token" type="password" readOnly value={state.token} autoComplete="off" />
        <div className="flex flex-wrap gap-2"><Button onClick={() => void onCopy(state.token)}>{t("mcp.copyToken")}</Button><Button variant="outline" onClick={() => state.setToken("")}>{t("mcp.closeToken")}</Button></div>
      </div>}
    </DialogContent>
  );
}
