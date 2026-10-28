// Edits persisted personal model capacity and capabilities independently of connection credentials or discovery.
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelCapacityInput, ProviderCapacities } from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../shared/ui/select";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import { notifyProviderModelMetadataChanged } from "../../../shared/lib/provider-model-metadata";
import { platformApi, type PlatformProviderConfig } from "../../user-platform/services/platform-api";

type Model = ProviderCapacities["models"][number];
type CapabilityChoice = "reference" | "supported" | "unsupported";
const choice = (value?: boolean): CapabilityChoice => value === undefined ? "reference" : value ? "supported" : "unsupported";
const booleanValue = (value: CapabilityChoice) => value === "reference" ? null : value === "supported";

export function ProviderModelSettingsDialog({ provider, currentUserId, onClose }: {
  provider: PlatformProviderConfig; currentUserId: string; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<ProviderCapacities>();
  const [error, setError] = useState<{ failure: unknown }>();
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState(provider.defaultModel ?? "");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const owned = provider.scopeType === "user" && provider.scopeId === currentUserId && provider.status === "active";
  useEffect(() => {
    let active = true;
    if (!owned) return;
    setError(undefined);
    setData(undefined);
    void platformApi.getProviderCapacities(provider.id).then(result => {
      if (!active) return;
      setData(result);
      setSelectedId(current => result.models.some(model => model.modelId === current) ? current : result.models[0]?.modelId ?? "");
    }).catch(failure => {
      if (active) setError({ failure });
    });
    return () => { active = false; };
  }, [owned, provider.id, reload]);
  const selected = data?.models.find(model => model.modelId === selectedId);
  const save = async (capacity: ModelCapacityInput) => {
    if (!owned || !selected || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const model = await platformApi.setProviderCapacity(provider.id, selected.modelId, capacity);
      setData(current => current ? { ...current, models: current.models.map(item => item.modelId === model.modelId ? model : item) } : current);
      // Refresh both current-model constraints and the full model selector after the durable write succeeds.
      notifyProviderModelMetadataChanged(provider.id);
      floatingAlert.success(t("providerSettings.modelSettings.saved"));
    } catch (failure) {
      floatingAlert.error(localizeCaughtFailure(failure, t("providerSettings.modelSettings.saveFailed")));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy.current) onClose(); }}>
    <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl" showCloseButton={!saving}>
      <DialogHeader>
        <DialogTitle>{t("providerSettings.modelSettings.title")}</DialogTitle>
        <DialogDescription>{provider.name} · {t("providerSettings.modelSettings.description")}</DialogDescription>
      </DialogHeader>
      {!owned ? <p role="status">{t("providerSettings.modelSettings.ownerOnly")}</p> : error ? <div role="alert" className="space-y-2">
        <p>{localizeCaughtFailure(error.failure, t("providerSettings.modelSettings.loadFailed"))}</p><Button variant="outline" onClick={() => setReload(current => current + 1)}>{t("providerSettings.modelSettings.retry")}</Button>
      </div> : !data ? <p role="status">{t("providerSettings.modelSettings.loading")}</p> : !data.models.length ? <p role="status">{t("providerSettings.modelSettings.empty")}</p> : <div className="space-y-4">
        <Label htmlFor="provider-capacity-model">{t("providerSettings.modelSettings.model")}</Label>
        <Select value={selectedId} onValueChange={value => { if (value && !busy.current) setSelectedId(value); }} disabled={saving}>
          <SelectTrigger id="provider-capacity-model" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{data.models.map(model => <SelectItem key={model.modelId} value={model.modelId}>{model.modelId}</SelectItem>)}</SelectContent>
        </Select>
        {selected && <ModelSettings key={JSON.stringify([selected.modelId, selected.updatedAt, selected.overrides])} model={selected} saving={saving} onSave={save} />}
      </div>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => { if (!busy.current) onClose(); }}>{t("providerSettings.modelSettings.close")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function ModelSettings({ model, saving, onSave }: { model: Model; saving: boolean; onSave: (capacity: ModelCapacityInput) => Promise<void> }) {
  const { t } = useTranslation();
  const id = useId();
  const [context, setContext] = useState(model.overrides.context?.toString() ?? "");
  const [output, setOutput] = useState(model.overrides.output?.toString() ?? "");
  const [reasoning, setReasoning] = useState(choice(model.overrides.capabilities?.reasoning));
  const [vision, setVision] = useState(choice(model.overrides.capabilities?.vision));
  const validNumber = (value: string, min: number, max: number) => value === "" || Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
  const effectiveContext = context === "" ? model.reference.context : Number(context);
  const effectiveOutput = output === "" ? model.reference.output : Number(output);
  const valid = validNumber(context, 1024, 100000000) && validNumber(output, 1, 10000000)
    && !(effectiveContext && effectiveOutput && effectiveOutput > effectiveContext);
  const dirty = context !== (model.overrides.context?.toString() ?? "") || output !== (model.overrides.output?.toString() ?? "")
    || reasoning !== choice(model.overrides.capabilities?.reasoning) || vision !== choice(model.overrides.capabilities?.vision);
  const tokenLabel = (value: number | null) => value?.toLocaleString() ?? t("providerSettings.modelSettings.unknown");
  const capabilityLabel = (value: boolean | null | undefined) => t(`providerSettings.modelSettings.${value === true ? "supported" : value === false ? "unsupported" : "unknown"}`);
  return <div className="space-y-4">
    <p className="text-muted-foreground text-xs">{t("providerSettings.modelSettings.effective", { context: tokenLabel(model.context), output: tokenLabel(model.output), reasoning: capabilityLabel(model.capabilities?.reasoning), vision: capabilityLabel(model.capabilities?.vision) })}</p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {(["context", "output"] as const).map(field => <div key={field} className="space-y-2">
        <Label htmlFor={`${id}-${field}`}>{t(`providerSettings.modelSettings.${field}`)}</Label>
        <Input id={`${id}-${field}`} type="number" step={1} min={field === "context" ? 1024 : 1} max={field === "context" ? 100000000 : 10000000}
          list={`${id}-${field}-presets`} value={field === "context" ? context : output} disabled={saving}
          placeholder={t("providerSettings.modelSettings.referenceTokens", { value: tokenLabel(model.reference[field]) })}
          onChange={event => (field === "context" ? setContext : setOutput)(event.target.value)} />
        <datalist id={`${id}-${field}-presets`}>{(field === "context" ? [32768, 64000, 128000, 262144, 1000000] : [4096, 8192, 16384, 32768, 65536]).map(value => <option key={value} value={value} />)}</datalist>
      </div>)}
      {(["reasoning", "vision"] as const).map(field => <div key={field} className="space-y-2">
        <Label htmlFor={`${id}-${field}`}>{t(`providerSettings.modelSettings.${field}`)}</Label>
        <Select value={field === "reasoning" ? reasoning : vision} disabled={saving} onValueChange={value => {
          if (value === "reference" || value === "supported" || value === "unsupported") (field === "reasoning" ? setReasoning : setVision)(value);
        }}>
          <SelectTrigger id={`${id}-${field}`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="reference">{t("providerSettings.modelSettings.referenceCapability", { value: capabilityLabel(model.reference.capabilities?.[field]) })}</SelectItem>
            <SelectItem value="supported">{t("providerSettings.modelSettings.supported")}</SelectItem>
            <SelectItem value="unsupported">{t("providerSettings.modelSettings.unsupported")}</SelectItem>
          </SelectContent>
        </Select>
      </div>)}
    </div>
    <p className="text-muted-foreground text-xs">{t("providerSettings.modelSettings.referenceHint")}</p>
    {!valid && <p role="alert" className="text-destructive text-xs">{t("providerSettings.modelSettings.invalid")}</p>}
    <Button disabled={saving || !valid || !dirty} onClick={() => {
      if (saving || !valid || !dirty) return;
      void onSave({ context: context === "" ? null : Number(context), output: output === "" ? null : Number(output),
        capabilities: { reasoning: booleanValue(reasoning), vision: booleanValue(vision) } });
    }}>{t(saving ? "providerSettings.modelSettings.saving" : "providerSettings.modelSettings.save")}</Button>
  </div>;
}
