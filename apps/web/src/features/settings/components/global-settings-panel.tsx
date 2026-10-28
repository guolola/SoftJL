// Owns provider configuration, selection drafts, discovery and connection testing.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { KeyRound, Plus, RotateCw } from "lucide-react";
import type {
  ProviderDiscoveredModel,
  ProviderModelCapabilityMap,
  ProviderModelDiscoveryProgressEvent,
} from "@uml-platform/contracts";
import { providerModelCapabilityMapSchema, providerModelCapabilitySchema } from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { Dialog } from "../../../shared/ui/dialog";
import { ProviderConfigTable } from "./provider-config-table";
import { ProviderModelSettingsDialog } from "./provider-model-settings-dialog";
import { SettingRow } from './block37-preferences';
import { ProviderCreationBlock34, type ProviderCreationForm } from './provider-creation-block34';
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from "../../../shared/lib/user-settings";
import {
  getProviderLabel,
  getProviderAllowedModels,
  getProviderModelCapabilities,
  resolveProviderModel,
  sortProviderConfigsByScope,
} from "../../../shared/lib/provider-config-models";
import {
  platformApi,
  PlatformApiError,
  type PlatformProviderConfig,
} from "../../user-platform/services/platform-api";
import {
  invalidateProviderConfigCache,
  loadProviderConfigs,
} from "../../user-platform/services/provider-config-cache";
import {
  localizeApiFailure,
  localizeCaughtFailure,
} from "../../../shared/i18n/api-errors";

type GlobalSettingsPanelProps = {
  active: boolean;
  currentUserId: string;
  onNavigate?: (route: string) => void;
  onSaved?: () => void;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

function sortProviderConfigs(configs: PlatformProviderConfig[]) {
  return sortProviderConfigsByScope(configs);
}

export type GlobalSettingsActions = { save: () => void; reset: () => void };

const EMPTY_PROVIDER_CREATION_FORM: ProviderCreationForm = {
  name: "",
  baseUrl: "",
  apiKey: "",
  defaultModel: "",
};

function discoveredModelsToCapabilities(
  models: ProviderDiscoveredModel[],
): ProviderModelCapabilityMap {
  return Object.fromEntries(
    models.flatMap((model) => {
      const id = model.id.trim();
      if (!id) return [];
      return [
        [
          id,
          providerModelCapabilitySchema.parse({
            id,
            category: model.category,
            structuredOutputMode: model.structuredOutputMode,
            supportsJsonSchema: model.supportsJsonSchema,
            supportsJsonObject: model.supportsJsonObject,
            strictJson: model.strictJson,
            modeLabel: model.modeLabel,
            warning: model.warning,
            probeStatus: model.probeStatus,
            probeReason: model.probeReason,
            probedAt: model.probedAt,
          }),
        ],
      ];
    }),
  );
}

function providerConfigToDiscoveredModels(
  config: PlatformProviderConfig,
): ProviderDiscoveredModel[] {
  return getProviderAllowedModels(config).map((model) => ({
    id: model,
    ...(config.modelCapabilities?.[model] ?? {}),
  }));
}

function providerDiscoveryProgressText(event: ProviderModelDiscoveryProgressEvent, t: TFunction) {
  if (event.type === "started") return t("providerSettings.connectingCatalog");
  if (event.type === "models_listed") return t("providerSettings.listedModels", { count: event.rawCount });
  if (event.type === "name_filtered") {
    return t("providerSettings.filteredModels", { count: event.candidateCount });
  }
  if (event.type === "probe_started") {
    return t("providerSettings.probingModel", { model: event.modelId, index: event.index, total: event.total });
  }
  if (event.type === "probe_completed") {
    return t("providerSettings.probedModel", { model: event.modelId, index: event.index, total: event.total });
  }
  if (event.type === "completed") {
    return t("providerSettings.discoveredModels", { count: event.result.models.length });
  }
  return t("providerSettings.discoveryFailed");
}

function providerDiscoveryProgressValue(
  event: ProviderModelDiscoveryProgressEvent,
) {
  if (event.type === "started") return 8;
  if (event.type === "models_listed") return 16;
  if (event.type === "name_filtered") return event.candidateCount === 0 ? 80 : 24;
  if (event.type === "probe_started" || event.type === "probe_completed") {
    if (event.total <= 0) return 80;
    return Math.min(96, 24 + Math.round((event.index / event.total) * 70));
  }
  if (event.type === "completed") return 100;
  return 100;
}

export const GlobalSettingsPanel = forwardRef<GlobalSettingsActions, GlobalSettingsPanelProps>(function GlobalSettingsPanel({
  active,
  currentUserId,
  onNavigate,
  onSaved,
  embedded = false,
  onDirtyChange,
}: GlobalSettingsPanelProps, ref) {
  const { t } = useTranslation();
  const translationRef = useRef(t);
  translationRef.current = t;
  const [savedSettings, setSavedSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const providerBusyRef = useRef(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [providerConfigs, setProviderConfigs] = useState<PlatformProviderConfig[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerStatus, setProviderStatus] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerDialogMode, setProviderDialogMode] = useState<"create" | "edit">("create");
  const [editingProviderId, setEditingProviderId] = useState("");
  const [modelSettingsProvider, setModelSettingsProvider] = useState<PlatformProviderConfig>();
  const [providerForm, setProviderForm] = useState<ProviderCreationForm>({
    ...EMPTY_PROVIDER_CREATION_FORM,
  });
  const [discoveredModels, setDiscoveredModels] = useState<ProviderDiscoveredModel[]>([]);
  const [modelCatalogSource, setModelCatalogSource] = useState<"existing" | "discovered" | "">("");
  const [discoveryProgressText, setDiscoveryProgressText] = useState("");
  const [discoveryProgressValue, setDiscoveryProgressValue] = useState(0);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [deletingProvider, setDeletingProvider] = useState(false);

  const applyProviderConfigList = useCallback(
    (configs: PlatformProviderConfig[], preferredProviderConfigId?: string) => {
      const visibleConfigs = sortProviderConfigs(
        configs.filter((config) => config.status !== "revoked"),
      );
      setProviderConfigs(visibleConfigs);
      setProviderStatus("");
      setSettings((current) => {
        const selected =
          visibleConfigs.find((config) => config.id === preferredProviderConfigId && config.status === "active" && getProviderAllowedModels(config).length > 0) ??
          visibleConfigs.find((config) => config.id === current.providerConfigId && config.status === "active" && getProviderAllowedModels(config).length > 0) ??
          visibleConfigs.find((config) => config.status === "active" && getProviderAllowedModels(config).length > 0);
        if (!selected) {
          return {
            ...current,
            providerConfigId: "",
            providerModelCapabilities: {},
            providerModelOptions: [],
            providerLabel: "",
            providerDefaultModelSeededFor: "",
            defaultModel: "",
          };
        }
        const shouldSeedProviderDefault =
          selected.id !== current.providerConfigId ||
          current.providerDefaultModelSeededFor !== selected.id;
        return {
          ...current,
          providerConfigId: selected.id,
          providerModelCapabilities: getProviderModelCapabilities(selected),
          providerModelOptions: getProviderAllowedModels(selected),
          providerLabel: getProviderLabel(selected),
          providerDefaultModelSeededFor: selected.id,
          defaultModel: shouldSeedProviderDefault
            ? resolveProviderModel(selected, selected.defaultModel ?? "")
            : resolveProviderModel(selected, current.defaultModel),
        };
      });
    },
    [],
  );

  const refreshProviderConfigs = useCallback(
    async (preferredProviderConfigId?: string) => {
      invalidateProviderConfigCache(currentUserId);
      const response = await loadProviderConfigs(currentUserId, { force: true });
      applyProviderConfigList(response.providerConfigs, preferredProviderConfigId);
      return response;
    },
    [applyProviderConfigList, currentUserId],
  );

  useEffect(() => {
    if (!active || !currentUserId) return;
    const stored = loadUserSettings();
    setSettings(stored);
    setSavedSettings(stored);
    setProviderLoading(true);
    setProviderStatus("");
    setAuthRequired(false);
    let mounted = true;
    loadProviderConfigs(currentUserId)
      .then((response) => {
        if (mounted) applyProviderConfigList(response.providerConfigs);
      })
      .catch((error) => {
        if (!mounted) return;
        if (error instanceof PlatformApiError && error.status === 403) {
          setProviderStatus(translationRef.current("providerSettings.accessDenied"));
          return;
        }
        setAuthRequired(
          error instanceof PlatformApiError && error.status === 401,
        );
        setProviderStatus(
          error instanceof PlatformApiError && error.status === 401
            ? translationRef.current("providerSettings.loginRequired")
            : localizeCaughtFailure(error, translationRef.current("providerSettings.authCheckFailed")),
        );
      })
      .finally(() => {
        if (mounted) setProviderLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [active, applyProviderConfigList, currentUserId]);

  const selectedProvider = useMemo(
    () => providerConfigs.find((config) => config.id === settings.providerConfigId),
    [providerConfigs, settings.providerConfigId],
  );
  const selectedProviderModels = useMemo(
    () => getProviderAllowedModels(selectedProvider),
    [selectedProvider],
  );
  const editingProvider = useMemo(
    () => providerConfigs.find((config) => config.id === editingProviderId),
    [editingProviderId, providerConfigs],
  );
  const resolvedDefaultModel = selectedProvider
    ? resolveProviderModel(selectedProvider, settings.defaultModel)
    : "";
  const discoveredModelIds = useMemo(
    () =>
      Array.from(
        new Set(
          discoveredModels
            .map((model) => model.id.trim())
            .filter(Boolean),
        ),
      ),
    [discoveredModels],
  );
  const canDiscoverModels = Boolean(providerForm.baseUrl.trim() && providerForm.apiKey.trim());
  // Discovery validates new models; saved models retain their existing capability records.
  const canSaveProvider = Boolean(
    providerForm.name.trim() && canDiscoverModels && modelCatalogSource === "discovered" &&
      discoveredModelIds.includes(providerForm.defaultModel.trim()),
  );
  const resetProviderCreationForm = useCallback(() => {
    setProviderForm({ ...EMPTY_PROVIDER_CREATION_FORM });
    setDiscoveredModels([]);
    setModelCatalogSource("");
    setDiscoveryProgressText("");
    setDiscoveryProgressValue(0);
    setEditingProviderId("");
  }, []);

  const updateProviderCreationField = <K extends keyof ProviderCreationForm>(
    key: K,
    value: ProviderCreationForm[K],
  ) => {
    setProviderForm((current) => ({ ...current, [key]: value }));
    if (key === "baseUrl" || key === "apiKey") {
      setDiscoveredModels([]);
      setModelCatalogSource("");
      setDiscoveryProgressText("");
      setDiscoveryProgressValue(0);
    }
  };

  const openCreateProviderDialog = () => {
    resetProviderCreationForm();
    setProviderDialogMode("create");
    setProviderDialogOpen(true);
  };

  const openEditProviderDialog = (config: PlatformProviderConfig) => {
    if (config.scopeType !== "user" || config.scopeId !== currentUserId || providerBusyRef.current) return;
    resetProviderCreationForm();
    setProviderDialogMode("edit");
    setEditingProviderId(config.id);
    setProviderForm({ name: config.name, baseUrl: config.baseUrl, apiKey: "", defaultModel: config.defaultModel ?? getProviderAllowedModels(config)[0] ?? "" });
    setDiscoveredModels(providerConfigToDiscoveredModels(config));
    setModelCatalogSource("existing");
    setProviderDialogOpen(true);
  };

  // A single selected ID is the source of truth for all row switches.
  const enableProvider = (config: PlatformProviderConfig) => {
    if (config.status !== "active" || !getProviderAllowedModels(config).length || providerLoading || deletingProvider) return;
    setSettings(current => ({ ...current, providerConfigId: config.id, providerModelCapabilities: getProviderModelCapabilities(config), providerModelOptions: getProviderAllowedModels(config), providerLabel: getProviderLabel(config), providerDefaultModelSeededFor: config.id, defaultModel: resolveProviderModel(config, config.defaultModel ?? "") }));
  };

  const handleProviderDialogOpenChange = (open: boolean) => {
    if (!open && (savingProvider || providerBusyRef.current)) return;
    setProviderDialogOpen(open);
    if (!open) {
      resetProviderCreationForm();
    }
  };

  const discoverModels = async () => {
    if (providerBusyRef.current) return;
    if (!providerForm.name.trim()) {
      floatingAlert.error(t("providerSettings.nameRequired"));
      return;
    }
    if (!canDiscoverModels) {
      floatingAlert.error(t("providerSettings.baseKeyRequired"));
      return;
    }
    try {
      const url = new URL(providerForm.baseUrl.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported provider URL");
    } catch {
      floatingAlert.error(t("providerSettings.invalidBaseUrl"));
      return;
    }
    // Keep saved and already discovered models even when the upstream directory drops them.
    const existingModels = Array.from(new Map([
      ...discoveredModels,
      ...(editingProvider ? providerConfigToDiscoveredModels(editingProvider) : []),
    ].map(model => [model.id, model])).values());
    const existingIds = new Set(existingModels.map(model => model.id));
    providerBusyRef.current = true;
    setDiscoveringModels(true);
    setModelCatalogSource("");
    setDiscoveryProgressText(t("providerSettings.connectingCatalog"));
    setDiscoveryProgressValue(4);
    try {
      let models: ProviderDiscoveredModel[] = [];
      const streamState: {
        completed: boolean;
        failure: {
          code?: string;
          retryable?: boolean;
          status?: number;
        } | null;
      } = { completed: false, failure: null };
      await platformApi.discoverProviderModelsStream(
        {
          baseUrl: providerForm.baseUrl.trim(),
          apiKey: providerForm.apiKey.trim(),
          existingModelIds: Array.from(existingIds),
        },
        (event) => {
          setDiscoveryProgressText(providerDiscoveryProgressText(event, t));
          setDiscoveryProgressValue(providerDiscoveryProgressValue(event));
          if (event.type === "completed") {
            streamState.completed = true;
            models = event.result.models.filter((model) => model.id.trim() && !existingIds.has(model.id));
          }
          if (event.type === "error") {
            streamState.failure = {
              code: event.code,
              retryable: event.retryable,
              status: event.status,
            };
          }
        },
      );
      const streamFailure = streamState.failure;
      if (streamFailure) {
        const status = streamFailure.status ?? 502;
        const payload = streamFailure.code
          ? {
              error: {
                code: streamFailure.code,
                category: "provider",
                retryable: streamFailure.retryable === true,
              },
            }
          : null;
        throw new PlatformApiError(
          localizeApiFailure(payload, status, t("providerSettings.discoveryFailed")),
          status,
          streamFailure.code ?? null,
          streamFailure.retryable === true,
        );
      }
      // A disconnected stream cannot establish a successfully fetched catalog.
      if (!streamState.completed) throw new Error("Provider discovery stream ended without a result");
      // A completed response must contain actual capability records before it can enable saving.
      discoveredModelsToCapabilities(models);
      const allModels = [...existingModels, ...models];
      setDiscoveredModels(allModels);
      setModelCatalogSource("discovered");
      setProviderForm((current) => {
        const modelIds = allModels.map((model) => model.id.trim()).filter(Boolean);
        const currentDefault = current.defaultModel.trim();
        return {
          ...current,
          defaultModel: modelIds.includes(currentDefault)
            ? currentDefault
            : modelIds[0] ?? "",
        };
      });
      if (allModels.length === 0) {
        floatingAlert.error(t("providerSettings.noModels"));
        return;
      }
      floatingAlert.success(t("providerSettings.discoveredModels", { count: models.length }));
    } catch (error) {
      setDiscoveredModels(existingModels);
      setModelCatalogSource("");
      setDiscoveryProgressValue(100);
      const message = localizeCaughtFailure(error, t("providerSettings.discoveryFailed"));
      setDiscoveryProgressText(message);
      floatingAlert.error(message);
    } finally {
      providerBusyRef.current = false;
      setDiscoveringModels(false);
    }
  };

  const reportProviderFailure = (message: string) => floatingAlert.error(message);

  const saveProviderConfig = async () => {
    if (providerBusyRef.current) return;
    // Mirror the disabled save button here so incomplete or stale validation cannot be submitted.
    if (!providerForm.name.trim()) {
      reportProviderFailure(t("providerSettings.nameRequired"));
      return;
    }
    if (!canDiscoverModels) {
      reportProviderFailure(t("providerSettings.baseKeyRequired"));
      return;
    }
    if (modelCatalogSource !== "discovered" || !discoveredModelIds.includes(providerForm.defaultModel.trim())) {
      reportProviderFailure(t("providerSettings.selectDefaultFirst"));
      return;
    }
    providerBusyRef.current = true;
    setSavingProvider(true);
    try {
      const payload = {
        name: providerForm.name.trim(),
        baseUrl: providerForm.baseUrl.trim(),
        defaultModel: providerForm.defaultModel.trim(),
        allowedModels: discoveredModelIds,
        // Do not normalize or replace saved capability records while adding new models.
        modelCapabilities: {
          ...discoveredModelsToCapabilities(discoveredModels.filter(model =>
            !editingProvider || !getProviderAllowedModels(editingProvider).includes(model.id))),
          ...providerModelCapabilityMapSchema.parse(editingProvider?.modelCapabilities ?? {}),
        },
      };
      const saved =
        providerDialogMode === "edit" && editingProvider
          ? await platformApi.updateProviderConfig(editingProvider.id, {
              ...payload,
              apiKey: providerForm.apiKey.trim(),
            })
          : await platformApi.createProviderConfig({
              ...payload,
              apiKey: providerForm.apiKey.trim(),
            });
      // Editing an inactive row must preserve the currently enabled provider.
      await refreshProviderConfigs(providerDialogMode === "create" ? saved.id : undefined);
      setSettings(current => current.providerConfigId === saved.id ? { ...current, defaultModel: resolveProviderModel(saved, saved.defaultModel ?? "") } : current);
      floatingAlert.success(
        providerDialogMode === "edit"
          ? t("providerSettings.providerUpdated")
          : t("providerSettings.providerAdded"),
      );
      setProviderDialogOpen(false);
      resetProviderCreationForm();
    } catch {
      floatingAlert.error(t("providerSettings.saveProviderFailed"));
    } finally {
      providerBusyRef.current = false;
      setSavingProvider(false);
    }
  };

  const deleteProvider = async (config: PlatformProviderConfig) => {
    if (config.scopeType !== "user" || config.scopeId !== currentUserId || deletingProvider) return;
    if (!window.confirm(t("providerSettings.deleteConfirm", { name: config.name }))) return;
    setDeletingProvider(true);
    try {
      await platformApi.revokeProviderConfig(config.id);
      await refreshProviderConfigs();
      floatingAlert.success(t("providerSettings.providerDeleted"));
    } catch {
      floatingAlert.error(t("providerSettings.deleteFailed"));
    } finally {
      setDeletingProvider(false);
    }
  };

  const save = () => {
    try {
      if (!settings.providerConfigId) {
        floatingAlert.error(t("providerSettings.managedRequired"));
        return;
      }
      if (!selectedProvider || selectedProviderModels.length === 0) {
        floatingAlert.error(t("providerSettings.noModelsForProvider"));
        return;
      }
      if (!selectedProviderModels.includes(resolvedDefaultModel)) {
        floatingAlert.error(t("providerSettings.modelMustBelong"));
        return;
      }
      const next = {
        ...loadUserSettings(),
        providerConfigId: settings.providerConfigId,
        providerDefaultModelSeededFor: settings.providerDefaultModelSeededFor,
        providerModelCapabilities: getProviderModelCapabilities(selectedProvider),
        providerModelOptions: getProviderAllowedModels(selectedProvider),
        providerLabel: getProviderLabel(selectedProvider),
        defaultModel: resolvedDefaultModel,
      };
      saveUserSettings(next);
      setSettings(next);
      setSavedSettings(next);
      floatingAlert.success(t("providerSettings.saved"));
      onSaved?.();
    } catch {
      floatingAlert.error(t("providerSettings.saveFailed"));
    }
  };

  const reset = () => {
    const usable = providerConfigs.filter(config => config.status === "active" && getProviderAllowedModels(config).length > 0);
    const defaultProvider = usable.find(config => config.scopeType === "system") ?? usable[0];
    if (defaultProvider) enableProvider(defaultProvider);
    floatingAlert.message(t("providerSettings.restored"));
  };

  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  useImperativeHandle(ref, () => ({ save, reset }));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  if (authRequired) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t("providerSettings.loginNotice")}
        </div>
        {onNavigate && (
          <Button
            type="button"
            onClick={() => onNavigate("/login")}
          >
            {t("providerSettings.goLogin")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <section aria-label={t("providerSettings.title")} className="space-y-4">
        <SettingRow label={t("providerSettings.title")} hint={t("providerSettings.description")}><Button type="button" size="sm" variant="outline" onClick={openCreateProviderDialog}><Plus className="size-4" />{t("providerSettings.addProvider")}</Button></SettingRow>
        <ProviderConfigTable configs={providerConfigs} currentUserId={currentUserId} selectedId={settings.providerConfigId} selectedModel={resolvedDefaultModel} loading={providerLoading} busy={deletingProvider} onEnable={enableProvider} onEdit={openEditProviderDialog} onEditModels={config => {
          if (config.scopeType === "user" && config.scopeId === currentUserId && config.status === "active" && !deletingProvider) setModelSettingsProvider(config);
        }} onDelete={config => void deleteProvider(config)} />
        <p className="text-xs text-muted-foreground">{t("providerSettings.singleEnabledHint")}</p>
        {providerStatus && <p role="status" className="text-xs text-muted-foreground">{providerStatus}</p>}
      </section>

      {!embedded && <div className="flex flex-wrap items-center justify-between gap-2 justify-end mt-5">
        <Button variant="ghost" onClick={reset}>
          <RotateCw className="size-4" />
          {t("providerSettings.restore")}
        </Button>
        <Button onClick={save}>
          <KeyRound className="size-4" />
          {t("providerSettings.save")}
        </Button>
      </div>}

      <Dialog open={providerDialogOpen} onOpenChange={handleProviderDialogOpenChange}>
        <ProviderCreationBlock34 mode={providerDialogMode} canSave={canSaveProvider} form={providerForm} models={discoveredModels} busy={discoveringModels || savingProvider} discovering={discoveringModels} saving={savingProvider} progressText={discoveryProgressText} progress={discoveryProgressValue} onField={updateProviderCreationField} onDiscover={() => void discoverModels()} onSave={() => void saveProviderConfig()} onCancel={() => handleProviderDialogOpenChange(false)} />
      </Dialog>
      {modelSettingsProvider && <ProviderModelSettingsDialog key={modelSettingsProvider.id} provider={modelSettingsProvider} currentUserId={currentUserId} onClose={() => setModelSettingsProvider(undefined)} />}
    </>
  );
});
