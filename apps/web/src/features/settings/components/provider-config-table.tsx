// Presents provider selection and owner-only actions without exposing connection credentials.
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Switch } from "../../../shared/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../shared/ui/table";
import { getProviderAllowedModels } from "../../../shared/lib/provider-config-models";
import type { PlatformProviderConfig } from "../../user-platform/services/platform-api";

type Props = {
  configs: PlatformProviderConfig[];
  currentUserId: string;
  selectedId: string;
  selectedModel: string;
  loading: boolean;
  busy: boolean;
  onEnable: (config: PlatformProviderConfig) => void;
  onEdit: (config: PlatformProviderConfig) => void;
  onDelete: (config: PlatformProviderConfig) => void;
};

export function ProviderConfigTable({ configs, currentUserId, selectedId, selectedModel, loading, busy, onEnable, onEdit, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  const dateFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "zh-CN", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table aria-label={t("providerSettings.title")}>
        <TableHeader className="bg-muted/50">
          <TableRow>
            {["providerName", "status", "defaultModel", "updatedAt", "enabled", "actions"].map(column => (
              <TableHead key={column} className="px-3">{t(`providerSettings.${column}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {configs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                {t(loading ? "providerSettings.loadingProvider" : "providerSettings.noProvider")}
              </TableCell>
            </TableRow>
          )}
          {configs.map(config => {
            const owned = config.scopeType === "user" && config.scopeId === currentUserId;
            const isSystem = config.scopeType === "system";
            const usable = config.status === "active" && getProviderAllowedModels(config).length > 0;
            const updated = new Date(config.updatedAt);
            return (
              <TableRow key={config.id}>
                <TableCell className="px-3 py-3 font-medium">{config.name}</TableCell>
                <TableCell className="px-3">
                  <Badge variant="secondary" className={isSystem ? "bg-muted text-muted-foreground" : usable ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}>
                    {t(isSystem ? "providerSettings.default" : usable ? "providerSettings.available" : "providerSettings.unavailable")}
                  </Badge>
                </TableCell>
                <TableCell className="px-3">{(selectedId === config.id ? selectedModel : config.defaultModel) || "—"}</TableCell>
                <TableCell className="whitespace-nowrap px-3 text-muted-foreground">
                  {Number.isNaN(updated.getTime()) ? "—" : <time dateTime={config.updatedAt}>{dateFormat.format(updated)}</time>}
                </TableCell>
                <TableCell className="px-3">
                  <Switch
                    aria-label={t("providerSettings.enableProvider", { name: config.name })}
                    checked={selectedId === config.id}
                    disabled={loading || busy || !usable}
                    onCheckedChange={checked => { if (checked && usable) onEnable(config); }}
                  />
                  {!usable && <p className="mt-1 text-xs text-muted-foreground">{t(config.status === "active" ? "providerSettings.providerNoModelsHint" : "providerSettings.unavailable")}</p>}
                </TableCell>
                <TableCell className="px-3">
                  {owned ? (
                    <div className="flex items-center gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={t("providerSettings.editNamedProvider", { name: config.name })} disabled={busy} onClick={() => onEdit(config)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={t("providerSettings.deleteNamedProvider", { name: config.name })} disabled={busy} onClick={() => onDelete(config)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
