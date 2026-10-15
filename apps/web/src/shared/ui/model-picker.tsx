import { Button } from "./button";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { i18n as appI18n } from "../i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "./utils";
import {
  getProviderModelLabel,
  inferProviderModelGroup,
} from "../lib/provider-model-display";
import {
  USER_SETTINGS_CHANGED_EVENT,
  loadUserSettings,
} from "../lib/user-settings";
import { ProviderIcon } from "./provider-icon";

function getProviderModelGroups(
  modelIds: string[],
  fallbackLabel: string,
  capabilities: ReturnType<typeof loadUserSettings>["providerModelCapabilities"],
) {
  const groups = new Map<
    string,
    {
      id: string;
      label: string;
      models: Array<{
        id: string;
        shortLabel: string;
        fullLabel: string;
        supportsJsonSchema: boolean;
        structuredOutputMode: "strict_json" | "json_object" | "compatible";
      }>;
    }
  >();

  modelIds.forEach((modelId) => {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    const group = inferProviderModelGroup(trimmed, fallbackLabel);
    if (!groups.has(group.id)) {
      groups.set(group.id, { ...group, models: [] });
    }
    const structuredOutputMode =
      capabilities[trimmed]?.structuredOutputMode ??
      (capabilities[trimmed]?.supportsJsonSchema === true
        ? "strict_json"
        : capabilities[trimmed]?.supportsJsonObject === true
          ? "json_object"
          : "compatible");
    groups.get(group.id)?.models.push({
      id: trimmed,
      shortLabel: getProviderModelLabel(trimmed),
      fullLabel: trimmed,
      supportsJsonSchema: structuredOutputMode === "strict_json",
      structuredOutputMode,
    });
  });

  return Array.from(groups.values());
}

export function ModelPicker({
  value,
  onValueChange,
  align = "start",
  triggerClassName,
  fullWidth = false,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  align?: "start" | "center" | "end";
  triggerClassName?: string;
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  const { t: translate, i18n: activeI18n } = useTranslation();
  const t = activeI18n.exists("modelPicker.switch") ? translate : appI18n.t.bind(appI18n);
  const [providerSettings, setProviderSettings] = useState(() => {
    const settings = loadUserSettings();
    return {
      providerConfigId: settings.providerConfigId,
      providerLabel: settings.providerLabel,
      providerModelCapabilities: settings.providerModelCapabilities,
      providerModelOptions: settings.providerModelOptions,
    };
  });
  useEffect(() => {
    const syncSettings = () => {
      const settings = loadUserSettings();
      setProviderSettings({
        providerConfigId: settings.providerConfigId,
        providerLabel: settings.providerLabel,
        providerModelCapabilities: settings.providerModelCapabilities,
        providerModelOptions: settings.providerModelOptions,
      });
    };
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
  }, []);

  const providerModels = useMemo(
    () => providerSettings.providerModelOptions.filter((model) => model.trim().length > 0),
    [providerSettings.providerModelOptions],
  );
  const providerModelGroups = useMemo(
    () => getProviderModelGroups(
      providerModels,
      providerSettings.providerLabel,
      providerSettings.providerModelCapabilities,
    ),
    [
      providerModels,
      providerSettings.providerLabel,
      providerSettings.providerModelCapabilities,
    ],
  );
  const display = {
    triggerLabel: providerModels.includes(value.trim())
      ? getProviderModelLabel(value)
      : t("modelPicker.notSelected"),
  };
  const selectedProvider = providerModels.includes(value.trim())
    ? inferProviderModelGroup(value, providerSettings.providerLabel)
    : null;
  const emptyStateLabel = providerSettings.providerConfigId
    ? t("modelPicker.noModels")
    : t("modelPicker.selectProvider");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline"
          type="button"
          className={cn(
            "h-9 w-28 min-w-0 justify-start gap-1.5 overflow-hidden px-3 py-2 sm:w-40",
            fullWidth && "w-full justify-between rounded-md text-left sm:w-full",
            disabled && "cursor-not-allowed opacity-50 hover:bg-background",
            triggerClassName,
          )}
          title={value.trim() || t("modelPicker.switch")}
          disabled={disabled}
        />} >
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
            <ProviderIcon providerId={selectedProvider?.id ?? ""} className="size-3.5" />
            <span className="truncate">{display.triggerLabel}</span>
          </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-56">
        {providerModelGroups.length > 0 ? (
          providerModelGroups.map((vendor) => (
            <DropdownMenuSub key={vendor.id}>
              <DropdownMenuSubTrigger className="gap-2 text-xs">
                <ProviderIcon providerId={vendor.id} />
                <span className="font-medium">{vendor.label}</span>
                {vendor.models.some((model) => model.id === value) && (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {vendor.models.find((model) => model.id === value)?.shortLabel}
                  </span>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 min-w-52 overflow-y-auto">
                {vendor.models.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => onValueChange(model.id)}
                    className="flex items-center justify-between gap-3 text-xs"
                    title={model.fullLabel}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate">{model.shortLabel}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                          model.structuredOutputMode === "strict_json"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : model.structuredOutputMode === "json_object"
                              ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {model.structuredOutputMode === "strict_json"
                          ? t("modelPicker.modes.strictJson")
                          : model.structuredOutputMode === "json_object"
                            ? t("modelPicker.modes.jsonObject")
                            : t("modelPicker.modes.compatible")}
                      </span>
                    </span>
                    {model.id === value && (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        ) : (
          <DropdownMenuItem
            disabled
            className="max-w-64 whitespace-normal text-xs text-muted-foreground"
          >
            {emptyStateLabel}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
