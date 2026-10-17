// Renders global model and workspace preferences in either a dialog or an embedded settings tab.
import { Progress } from '../../../shared/ui/progress';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { KeyRound, Loader2, Pencil, Plus, PlugZap, RotateCw, Save, Trash2 } from "lucide-react";
import type { ProviderDiscoveredModel, ProviderModelCapabilityMap, ProviderModelDiscoveryProgressEvent, } from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Switch } from "../../../shared/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../shared/ui/select";
import { SettingRow } from './block37-preferences';
import { ProviderCreationBlock34, type ProviderCreationForm } from './provider-creation-block34';
import { DEFAULT_USER_SETTINGS, loadUserSettings, saveUserSettings, type UserSettings, } from "../../../shared/lib/user-settings";
import { getProviderLabel, getProviderAllowedModels, getProviderModelCapabilities, providerScopeLabel, resolveProviderModel, sortProviderConfigsByScope, } from "../../../shared/lib/provider-config-models";
import { platformApi, PlatformApiError, type PlatformProviderConfig, } from "../../user-platform/services/platform-api";
import { invalidateProviderConfigCache, loadProviderConfigs, } from "../../user-platform/services/provider-config-cache";
import { localizeApiFailure, localizeCaughtFailure, } from "../../../shared/i18n/api-errors";
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
export type GlobalSettingsActions = {
    save: () => void;
    reset: () => void;
};
const EMPTY_PROVIDER_CREATION_FORM: ProviderCreationForm = {
    name: "",
    baseUrl: "",
    apiKey: "",
    defaultModel: "",
};
function buildTemporaryProviderSignature(form: ProviderCreationForm, modelIds: string[]) {
    return JSON.stringify([
        form.baseUrl.trim(),
        form.apiKey,
        form.defaultModel.trim(),
        modelIds,
    ]);
}
function discoveredModelsToCapabilities(models: ProviderDiscoveredModel[], compatibleMode: string): ProviderModelCapabilityMap {
    return Object.fromEntries(models.flatMap((model) => {
        const id = model.id.trim();
        if (!id)
            return [];
        return [
            [
                id,
                {
                    id,
                    category: model.category ?? "text_chat",
                    structuredOutputMode: model.structuredOutputMode ?? "compatible",
                    supportsJsonSchema: model.supportsJsonSchema ?? false,
                    supportsJsonObject: model.supportsJsonObject ?? false,
                    strictJson: model.strictJson ?? "unknown",
                    modeLabel: model.modeLabel ?? compatibleMode,
                    warning: model.warning,
                    probeStatus: model.probeStatus ?? "unknown",
                    probeReason: model.probeReason,
                    probedAt: model.probedAt ?? new Date().toISOString(),
                },
            ],
        ];
    }));
}
function providerConfigToDiscoveredModels(config: PlatformProviderConfig): ProviderDiscoveredModel[] {
    return getProviderAllowedModels(config).map((model) => ({
        id: model,
        ...(config.modelCapabilities?.[model] ?? {}),
    }));
}
function providerDiscoveryProgressText(event: ProviderModelDiscoveryProgressEvent, t: TFunction) {
    if (event.type === "started")
        return t("providerSettings.connectingCatalog");
    if (event.type === "models_listed")
        return t("providerSettings.listedModels", { count: event.rawCount });
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
function providerDiscoveryProgressValue(event: ProviderModelDiscoveryProgressEvent) {
    if (event.type === "started")
        return 8;
    if (event.type === "models_listed")
        return 16;
    if (event.type === "name_filtered")
        return event.candidateCount === 0 ? 80 : 24;
    if (event.type === "probe_started" || event.type === "probe_completed") {
        if (event.total <= 0)
            return 80;
        return Math.min(96, 24 + Math.round((event.index / event.total) * 70));
    }
    if (event.type === "completed")
        return 100;
    return 100;
}
export const GlobalSettingsPanel = forwardRef<GlobalSettingsActions, GlobalSettingsPanelProps>(function GlobalSettingsPanel({ active, currentUserId, onNavigate, onSaved, embedded = false, onDirtyChange, }: GlobalSettingsPanelProps, ref) {
    const { t } = useTranslation();
    const translationRef = useRef(t);
    translationRef.current = t;
    const [savedSettings, setSavedSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
    const [testFeedback, setTestFeedback] = useState("");
    const providerBusyRef = useRef(false);
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
    const [providerConfigs, setProviderConfigs] = useState<PlatformProviderConfig[]>([]);
    const [providerLoading, setProviderLoading] = useState(false);
    const [providerStatus, setProviderStatus] = useState("");
    const [authRequired, setAuthRequired] = useState(false);
    const [providerDialogOpen, setProviderDialogOpen] = useState(false);
    const [providerDialogMode, setProviderDialogMode] = useState<"create" | "edit">("create");
    const [editingProviderId, setEditingProviderId] = useState("");
    const [providerForm, setProviderForm] = useState<ProviderCreationForm>({
        ...EMPTY_PROVIDER_CREATION_FORM,
    });
    const [discoveredModels, setDiscoveredModels] = useState<ProviderDiscoveredModel[]>([]);
    const [modelCatalogSource, setModelCatalogSource] = useState<"existing" | "discovered" | "">("");
    const [discoveryProgressText, setDiscoveryProgressText] = useState("");
    const [discoveryProgressValue, setDiscoveryProgressValue] = useState(0);
    const [discoveringModels, setDiscoveringModels] = useState(false);
    const [testingTemporaryProvider, setTestingTemporaryProvider] = useState(false);
    const [savingProvider, setSavingProvider] = useState(false);
    const [deletingProvider, setDeletingProvider] = useState(false);
    const [testedProviderSignature, setTestedProviderSignature] = useState("");
    const applyProviderConfigList = useCallback((configs: PlatformProviderConfig[], preferredProviderConfigId?: string) => {
        const activeConfigs = sortProviderConfigs(configs.filter((config) => config.status === "active"));
        setProviderConfigs(activeConfigs);
        setProviderStatus("");
        setSettings((current) => {
            const selected = activeConfigs.find((config) => config.id === preferredProviderConfigId) ??
                activeConfigs.find((config) => config.id === current.providerConfigId) ??
                activeConfigs[0];
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
            const shouldSeedProviderDefault = selected.id !== current.providerConfigId ||
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
    }, []);
    const refreshProviderConfigs = useCallback(async (preferredProviderConfigId?: string) => {
        invalidateProviderConfigCache(currentUserId);
        const response = await loadProviderConfigs(currentUserId, { force: true });
        applyProviderConfigList(response.providerConfigs, preferredProviderConfigId);
        return response;
    }, [applyProviderConfigList, currentUserId]);
    useEffect(() => {
        if (!active || !currentUserId)
            return;
        const stored = loadUserSettings();
        setSettings(stored);
        setSavedSettings(stored);
        setProviderLoading(true);
        setProviderStatus("");
        setAuthRequired(false);
        let mounted = true;
        loadProviderConfigs(currentUserId)
            .then((response) => {
            if (mounted)
                applyProviderConfigList(response.providerConfigs);
        })
            .catch((error) => {
            if (!mounted)
                return;
            if (error instanceof PlatformApiError && error.status === 403) {
                setProviderStatus(translationRef.current("providerSettings.accessDenied"));
                return;
            }
            setAuthRequired(error instanceof PlatformApiError && error.status === 401);
            setProviderStatus(error instanceof PlatformApiError && error.status === 401
                ? translationRef.current("providerSettings.loginRequired")
                : localizeCaughtFailure(error, translationRef.current("providerSettings.authCheckFailed")));
        })
            .finally(() => {
            if (mounted)
                setProviderLoading(false);
        });
        return () => {
            mounted = false;
        };
    }, [active, applyProviderConfigList, currentUserId]);
    const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
    const selectedProvider = useMemo(() => providerConfigs.find((config) => config.id === settings.providerConfigId), [providerConfigs, settings.providerConfigId]);
    const selectedProviderModels = useMemo(() => getProviderAllowedModels(selectedProvider), [selectedProvider]);
    const selectedProviderIsOwnedUserConfig = Boolean(selectedProvider &&
        selectedProvider.scopeType === "user" &&
        selectedProvider.scopeId === currentUserId);
    const editingProvider = useMemo(() => providerConfigs.find((config) => config.id === editingProviderId), [editingProviderId, providerConfigs]);
    const resolvedDefaultModel = selectedProvider
        ? resolveProviderModel(selectedProvider, settings.defaultModel)
        : "";
    const providerEmptyLabel = providerLoading
        ? t("providerSettings.loadingProvider")
        : providerConfigs.length === 0
            ? t("providerSettings.noProvider")
            : t("providerSettings.selectProvider");
    const discoveredModelIds = useMemo(() => Array.from(new Set(discoveredModels
        .map((model) => model.id.trim())
        .filter(Boolean))), [discoveredModels]);
    const currentProviderSignature = useMemo(() => buildTemporaryProviderSignature(providerForm, discoveredModelIds), [discoveredModelIds, providerForm]);
    const temporaryProviderTestPassed = testedProviderSignature !== "" &&
        testedProviderSignature === currentProviderSignature &&
        discoveredModelIds.length > 0;
    const canDiscoverModels = Boolean(providerForm.baseUrl.trim() && providerForm.apiKey.trim());
    const canTestTemporaryProvider = Boolean(providerForm.baseUrl.trim() &&
        providerForm.apiKey.trim() &&
        providerForm.defaultModel.trim() &&
        discoveredModelIds.length > 0);
    const providerDialogNeedsPassedTest = Boolean(providerDialogMode === "create" ||
        providerForm.apiKey.trim() ||
        modelCatalogSource === "discovered" ||
        (providerDialogMode === "edit" &&
            editingProvider &&
            providerForm.baseUrl.trim() !== editingProvider.baseUrl));
    const resetProviderCreationForm = useCallback(() => {
        setProviderForm({ ...EMPTY_PROVIDER_CREATION_FORM });
        setDiscoveredModels([]);
        setModelCatalogSource("");
        setDiscoveryProgressText("");
        setDiscoveryProgressValue(0);
        setTestedProviderSignature("");
        setTestFeedback("");
        setEditingProviderId("");
    }, []);
    const updateProviderCreationField = <K extends keyof ProviderCreationForm>(key: K, value: ProviderCreationForm[K]) => {
        setProviderForm((current) => ({ ...current, [key]: value }));
        setTestFeedback("");
        if (key === "baseUrl") {
            setDiscoveredModels([]);
            setModelCatalogSource("");
            setDiscoveryProgressText("");
            setDiscoveryProgressValue(0);
        }
        if (key !== "name") {
            setTestedProviderSignature("");
        }
    };
    const openCreateProviderDialog = () => {
        resetProviderCreationForm();
        setProviderDialogMode("create");
        setProviderDialogOpen(true);
    };
    const openEditProviderDialog = () => {
        if (!selectedProvider || !selectedProviderIsOwnedUserConfig)
            return;
        setProviderDialogMode("edit");
        setEditingProviderId(selectedProvider.id);
        setProviderForm({
            name: selectedProvider.name,
            baseUrl: selectedProvider.baseUrl,
            apiKey: "",
            defaultModel: selectedProvider.defaultModel ?? selectedProviderModels[0] ?? "",
        });
        setDiscoveredModels(providerConfigToDiscoveredModels(selectedProvider));
        setModelCatalogSource("existing");
        setDiscoveryProgressText("");
        setDiscoveryProgressValue(0);
        setTestedProviderSignature("");
        setProviderDialogOpen(true);
    };
    const handleProviderDialogOpenChange = (open: boolean) => {
        if (!open && (savingProvider || (providerDialogMode === "create" && providerBusyRef.current)))
            return;
        setProviderDialogOpen(open);
        if (!open) {
            resetProviderCreationForm();
        }
    };
    const discoverModels = async () => {
        if (providerBusyRef.current)
            return;
        if (!canDiscoverModels) {
            floatingAlert.error(t("providerSettings.baseKeyRequired"));
            return;
        }
        providerBusyRef.current = true;
        setDiscoveringModels(true);
        setTestedProviderSignature("");
        setDiscoveredModels([]);
        setModelCatalogSource("");
        setDiscoveryProgressText(t("providerSettings.connectingCatalog"));
        setDiscoveryProgressValue(4);
        try {
            let models: ProviderDiscoveredModel[] = [];
            const streamState: {
                failure: {
                    code?: string;
                    retryable?: boolean;
                    status?: number;
                } | null;
            } = { failure: null };
            await platformApi.discoverProviderModelsStream({
                baseUrl: providerForm.baseUrl.trim(),
                apiKey: providerForm.apiKey.trim(),
            }, (event) => {
                setDiscoveryProgressText(providerDiscoveryProgressText(event, t));
                setDiscoveryProgressValue(providerDiscoveryProgressValue(event));
                if (event.type === "completed") {
                    models = event.result.models.filter((model) => model.id.trim());
                }
                if (event.type === "error") {
                    streamState.failure = {
                        code: event.code,
                        retryable: event.retryable,
                        status: event.status,
                    };
                }
            });
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
                throw new PlatformApiError(localizeApiFailure(payload, status, t("providerSettings.discoveryFailed")), status, streamFailure.code ?? null, streamFailure.retryable === true);
            }
            setDiscoveredModels(models);
            setModelCatalogSource("discovered");
            setProviderForm((current) => {
                const modelIds = models.map((model) => model.id.trim()).filter(Boolean);
                const currentDefault = current.defaultModel.trim();
                return {
                    ...current,
                    defaultModel: modelIds.includes(currentDefault)
                        ? currentDefault
                        : modelIds[0] ?? "",
                };
            });
            if (models.length === 0) {
                floatingAlert.error(t("providerSettings.noModels"));
                return;
            }
            floatingAlert.success(t("providerSettings.discoveredModels", { count: models.length }));
        }
        catch (error) {
            setDiscoveredModels([]);
            setModelCatalogSource("");
            setDiscoveryProgressValue(100);
            const message = localizeCaughtFailure(error, t("providerSettings.discoveryFailed"));
            setDiscoveryProgressText(message);
            floatingAlert.error(message);
        }
        finally {
            providerBusyRef.current = false;
            setDiscoveringModels(false);
        }
    };
    const testTemporaryProvider = async () => {
        if (providerBusyRef.current)
            return;
        if (!canTestTemporaryProvider) {
            floatingAlert.error(t("providerSettings.selectDefaultFirst"));
            return;
        }
        providerBusyRef.current = true;
        setTestingTemporaryProvider(true);
        setTestedProviderSignature("");
        setTestFeedback("");
        try {
            const result = await platformApi.testTemporaryProviderConfig({
                baseUrl: providerForm.baseUrl.trim(),
                apiKey: providerForm.apiKey.trim(),
                model: providerForm.defaultModel.trim(),
            });
            if (result.ok === false) {
                setTestFeedback(t("providerSettings.testFailed"));
                floatingAlert.error(t("providerSettings.testFailed"));
                return;
            }
            setTestedProviderSignature(currentProviderSignature);
            setTestFeedback(t("providerSettings.testPassed"));
            floatingAlert.success(t("providerSettings.testSuccess"));
        }
        catch (error) {
            const message = localizeCaughtFailure(error, t("providerSettings.testFailed"));
            setTestFeedback(message);
            floatingAlert.error(message);
        }
        finally {
            providerBusyRef.current = false;
            setTestingTemporaryProvider(false);
        }
    };
    const reportProviderFailure = (message: string) => { setTestFeedback(message); floatingAlert.error(message); };
    const saveProviderConfig = async () => {
        if (providerBusyRef.current)
            return;
        // Keep save actionable so each missing prerequisite can explain the next required step.
        if (!providerForm.name.trim()) {
            reportProviderFailure(t("providerSettings.nameRequired"));
            return;
        }
        const baseUrlChanged = Boolean(providerDialogMode === "edit" &&
            editingProvider &&
            providerForm.baseUrl.trim() !== editingProvider.baseUrl);
        const apiKeyRequired = providerDialogMode === "create" || baseUrlChanged;
        if (!providerForm.baseUrl.trim() || (apiKeyRequired && !providerForm.apiKey.trim())) {
            reportProviderFailure(t("providerSettings.baseKeyRequired"));
            return;
        }
        if (!providerForm.defaultModel.trim() || discoveredModelIds.length === 0) {
            reportProviderFailure(t("providerSettings.selectDefaultFirst"));
            return;
        }
        if (providerDialogNeedsPassedTest && !temporaryProviderTestPassed) {
            reportProviderFailure(t("providerSettings.testRequired"));
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
                modelCapabilities: discoveredModelsToCapabilities(discoveredModels, t("providerSettings.compatibleMode")),
            };
            const saved = providerDialogMode === "edit" && editingProvider
                ? await platformApi.updateProviderConfig(editingProvider.id, {
                    ...payload,
                    apiKey: providerForm.apiKey.trim() || undefined,
                })
                : await platformApi.createProviderConfig({
                    ...payload,
                    apiKey: providerForm.apiKey.trim(),
                });
            await refreshProviderConfigs(saved.id);
            floatingAlert.success(providerDialogMode === "edit"
                ? t("providerSettings.providerUpdated")
                : t("providerSettings.providerAdded"));
            setProviderDialogOpen(false);
            resetProviderCreationForm();
        }
        catch (_error) {
            setTestFeedback(t("providerSettings.saveProviderFailed"));
            floatingAlert.error(t("providerSettings.saveProviderFailed"));
        }
        finally {
            providerBusyRef.current = false;
            setSavingProvider(false);
        }
    };
    const deleteSelectedProvider = async () => {
        if (!selectedProvider || !selectedProviderIsOwnedUserConfig || deletingProvider)
            return;
        if (!window.confirm(t("providerSettings.deleteConfirm", { name: selectedProvider.name })))
            return;
        setDeletingProvider(true);
        try {
            await platformApi.revokeProviderConfig(selectedProvider.id);
            await refreshProviderConfigs();
            floatingAlert.success(t("providerSettings.providerDeleted"));
        }
        catch (_error) {
            floatingAlert.error(t("providerSettings.deleteFailed"));
        }
        finally {
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
                ...settings,
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
        }
        catch {
            floatingAlert.error(t("providerSettings.saveFailed"));
        }
    };
    const reset = () => {
        setSettings(DEFAULT_USER_SETTINGS);
        floatingAlert.message(t("providerSettings.restored"));
    };
    const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
    useImperativeHandle(ref, () => ({ save, reset }));
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
    if (authRequired) {
        return (<div className="space-y-4">
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t("providerSettings.loginNotice")}
        </div>
        {onNavigate && (<Button type="button" onClick={() => onNavigate("/login")}>
            {t("providerSettings.goLogin")}
          </Button>)}
      </div>);
    }
    return (<>
      <div className="space-y-2">
        <SettingRow label={t("providerSettings.title")} hint={t("providerSettings.description")}><Button type="button" size="sm" variant="outline" onClick={openCreateProviderDialog}><Plus className="size-4"/>{t("providerSettings.addProvider")}</Button></SettingRow>
        <SettingRow label={t("providerSettings.managedConfig")} htmlFor="managed-provider-config"><div className="w-full space-y-1.5 sm:w-56">
              <Select value={settings.providerConfigId || "__none__"} onValueChange={(value) => {
            const providerConfigId = value === "__none__" ? "" : value;
            const config = providerConfigs.find((item) => item.id === providerConfigId);
            setSettings((current) => ({
                ...current,
                providerConfigId,
                providerModelCapabilities: providerConfigId
                    ? getProviderModelCapabilities(config)
                    : {},
                providerModelOptions: providerConfigId ? getProviderAllowedModels(config) : [],
                providerLabel: providerConfigId ? getProviderLabel(config) : "",
                providerDefaultModelSeededFor: providerConfigId ? providerConfigId : "",
                defaultModel: providerConfigId
                    ? resolveProviderModel(config, current.providerConfigId === providerConfigId
                        ? current.defaultModel
                        : config?.defaultModel ?? "")
                    : "",
            }));
        }} disabled={providerLoading || providerConfigs.length === 0}>
                <SelectTrigger id="managed-provider-config" aria-label={t("providerSettings.managedConfig")} className="h-9 w-full">
                  <SelectValue placeholder={providerEmptyLabel}/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    {providerEmptyLabel}
                  </SelectItem>
                  {providerConfigs.map((config) => (<SelectItem key={config.id} value={config.id}>
                      {t("providerSettings.configLabel", { name: config.name, scope: providerScopeLabel(config, {
                    user: t("providerSettings.scopes.user"),
                    system: t("providerSettings.scopes.system"),
                    project: t("providerSettings.scopes.project"),
                    managed: t("providerSettings.scopes.managed"),
                }) })}
                    </SelectItem>))}
                </SelectContent>
              </Select>
              
              {providerStatus && !selectedProvider ? (<span className="text-[11px] text-muted-foreground">{providerStatus}</span>) : null}
              {selectedProviderIsOwnedUserConfig && (<div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" size="sm" variant="outline" onClick={openEditProviderDialog} disabled={deletingProvider}>
                    <Pencil className="size-4"/>
                    {t("providerSettings.edit")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={deleteSelectedProvider} disabled={deletingProvider}>
                    {deletingProvider ? (<Loader2 className="size-4 animate-spin"/>) : (<Trash2 className="size-4"/>)}
                    {t("providerSettings.delete")}
                  </Button>
                </div>)}
        </div></SettingRow>
        <SettingRow label={t("providerSettings.defaultModel")} hint={t("providerSettings.selectAllowedModel")} htmlFor="managed-default-model"><div className="w-full space-y-1.5 sm:w-56">
              {selectedProvider ? (<Select value={resolvedDefaultModel} onValueChange={(value) => update("defaultModel", value)} disabled={selectedProviderModels.length === 0}>
                  <SelectTrigger id="managed-default-model" aria-label={t("providerSettings.defaultModel")} className="h-9 w-full">
                    <SelectValue placeholder={t("providerSettings.selectAllowedModel")}/>
                  </SelectTrigger>
                  <SelectContent>
                    {selectedProviderModels.map((model) => (<SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>))}
                  </SelectContent>
                </Select>) : (<Select value="__none__" disabled>
                  <SelectTrigger id="managed-default-model" aria-label={t("providerSettings.defaultModel")} className="h-9 w-full">
                    <SelectValue placeholder={t("providerSettings.selectProviderFirst")}/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("providerSettings.selectProviderFirst")}</SelectItem>
                  </SelectContent>
                </Select>)}
              {selectedProvider && selectedProviderModels.length === 0 && (<span className="text-[11px] text-warning">
                  {t("providerSettings.providerNoModelsHint")}
                </span>)}
        </div></SettingRow>
        <SettingRow label={t("providerSettings.autoRules")} hint={t("providerSettings.autoRulesHint")} htmlFor="auto-rules"><Switch id="auto-rules" checked={settings.autoGenerate} onCheckedChange={value => update("autoGenerate", value)}/></SettingRow>
        <SettingRow label={t("providerSettings.staleBanner")} hint={t("providerSettings.staleBannerHint")} htmlFor="stale-banner"><Switch id="stale-banner" checked={settings.showStaleBanner} onCheckedChange={value => update("showStaleBanner", value)}/></SettingRow>
      </div>

      {!embedded && <div className="flex flex-wrap items-center justify-between gap-2 justify-end mt-5">
        <Button variant="ghost" onClick={reset}>
          <RotateCw className="size-4"/>
          {t("providerSettings.restore")}
        </Button>
        <Button onClick={save}>
          <KeyRound className="size-4"/>
          {t("providerSettings.save")}
        </Button>
      </div>}

      <Dialog open={providerDialogOpen} onOpenChange={handleProviderDialogOpenChange}>
        {providerDialogMode === "create" ? <ProviderCreationBlock34 open={providerDialogOpen} form={providerForm} models={discoveredModels} busy={discoveringModels || testingTemporaryProvider || savingProvider} discovering={discoveringModels} testing={testingTemporaryProvider} saving={savingProvider} canDiscover={canDiscoverModels} canTest={canTestTemporaryProvider} testPassed={temporaryProviderTestPassed} feedback={testFeedback} progressText={discoveryProgressText} progress={discoveryProgressValue} onField={updateProviderCreationField} onDiscover={() => void discoverModels()} onTest={() => void testTemporaryProvider()} onSave={() => void saveProviderConfig()} onCancel={() => handleProviderDialogOpenChange(false)}/> : <DialogContent data-form-layout="4" className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{providerDialogMode === "edit" ? t("providerSettings.editProvider") : t("providerSettings.createProvider")}</DialogTitle>
            <DialogDescription>
              {providerDialogMode === "edit"
                ? t("providerSettings.editDescription").replace(/[。.]+$/u, "")
                : t("providerSettings.createDescription").replace(/[。.]+$/u, "")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 rounded-xl border border-border bg-muted/10 p-4 sm:p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-name">{t("providerSettings.name")}</Label>
              <Input id="provider-create-name" value={providerForm.name} onChange={(event) => updateProviderCreationField("name", event.target.value)} placeholder={t("providerSettings.namePlaceholder")}/>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-base-url">Base URL</Label>
              <Input id="provider-create-base-url" value={providerForm.baseUrl} onChange={(event) => updateProviderCreationField("baseUrl", event.target.value)} placeholder="https://api.example.com" spellCheck={false}/>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-api-key">API Key</Label>
              <Input id="provider-create-api-key" type="password" value={providerForm.apiKey} onChange={(event) => updateProviderCreationField("apiKey", event.target.value)} autoComplete="off" spellCheck={false} placeholder={providerDialogMode === "edit"
                ? t("providerSettings.keepSecret")
                : undefined}/>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-default-model">{t("providerSettings.defaultModel")}</Label>
              <Select value={providerForm.defaultModel || "__none__"} onValueChange={(value) => updateProviderCreationField("defaultModel", value === "__none__" ? "" : value)} disabled={discoveredModelIds.length === 0}>
                <SelectTrigger id="provider-create-default-model" aria-label={t("providerSettings.providerDefaultModel")} className="h-9 w-full">
                  <SelectValue placeholder={t("providerSettings.fetchModelsFirst")}/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    {t("providerSettings.fetchModelsFirst")}
                  </SelectItem>
                  {discoveredModelIds.map((model) => (<SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>))}
                </SelectContent>
              </Select>
              {(discoveringModels || discoveryProgressText) && (<div className="grid gap-1">
                  <Progress value={discoveryProgressValue} aria-label={t("providerSettings.discoveryProgress")}/>
                  <span className="text-[11px] text-muted-foreground">
                    {discoveryProgressText}
                  </span>
                </div>)}
              {discoveredModelIds.length > 0 ? (<span className="text-[11px] text-muted-foreground">
                  {t("providerSettings.modelCount", { count: discoveredModelIds.length })}
                  {temporaryProviderTestPassed
                    ? ` · ${t("providerSettings.testPassed")}`
                    : providerDialogNeedsPassedTest
                        ? ` · ${t("providerSettings.waitingTest")}`
                        : ` · ${t("providerSettings.readyToSave")}`}
                </span>) : (<span className="text-[11px] text-muted-foreground">
                  {t("providerSettings.fetchBeforeActions")}
                </span>)}
            </div>
          </div>
          <DialogFooter className="flex-wrap">
            <Button type="button" variant="ghost" onClick={() => handleProviderDialogOpenChange(false)} disabled={savingProvider}>
              {t("providerSettings.cancel")}
            </Button>
            <Button type="button" variant="outline" onClick={discoverModels} disabled={discoveringModels || testingTemporaryProvider || savingProvider || !canDiscoverModels}>
              {discoveringModels ? (<Loader2 className="size-4 animate-spin"/>) : (<RotateCw className="size-4"/>)}
              {t("providerSettings.fetchModels")}
            </Button>
            <Button type="button" variant="outline" onClick={testTemporaryProvider} disabled={discoveringModels || testingTemporaryProvider || savingProvider || !canTestTemporaryProvider}>
              {testingTemporaryProvider ? (<Loader2 className="size-4 animate-spin"/>) : (<PlugZap className="size-4"/>)}
              {t("providerSettings.testConfig")}
            </Button>
            <Button type="button" onClick={saveProviderConfig} disabled={discoveringModels || testingTemporaryProvider || savingProvider}>
              {savingProvider ? (<Loader2 className="size-4 animate-spin"/>) : (<Save className="size-4"/>)}
              {t("providerSettings.saveProvider")}
            </Button>
          </DialogFooter>
        </DialogContent>}
      </Dialog>
    </>);
});
