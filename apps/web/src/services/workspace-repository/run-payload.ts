// Normalizes run request payloads before they leave the workspace repository.
import type { RunError } from "@uml-platform/contracts";
import { localizeRunFailure } from "../../shared/i18n/api-errors";
type ProviderSettingsPresence = {
  providerConfigId?: string;
};

export function snapshotErrorMessage(
  snapshot: { error?: RunError | null },
  fallback: string,
) {
  return snapshot.error
    ? localizeRunFailure(snapshot.error, fallback)
    : fallback;
}

export function runPayloadWithoutUnmanagedProviderSettings<T extends object>(
  input: T & { providerSettings?: ProviderSettingsPresence | null },
) {
  return input;
}
