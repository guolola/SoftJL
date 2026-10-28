// Notifies open model controls after persisted capacity or capability settings change.
export const PROVIDER_MODEL_METADATA_CHANGED_EVENT = "uml-provider-model-metadata-changed";

export function notifyProviderModelMetadataChanged(providerConfigId: string) {
  window.dispatchEvent(new CustomEvent(PROVIDER_MODEL_METADATA_CHANGED_EVENT, { detail: { providerConfigId } }));
}
