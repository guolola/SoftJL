// Loads authorized metadata for every configured choice without changing the selected model or probing providers.
import { useEffect, useState } from "react";
import { providerModelContextsSchema, type ModelContextSettings } from "@uml-platform/contracts";
import { requestJson } from "../api-client/index";
import { PROVIDER_MODEL_METADATA_CHANGED_EVENT } from "../../shared/lib/provider-model-metadata";

export function useProviderModelMetadataRevision(providerConfigId: string) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ providerConfigId: string }>).detail?.providerConfigId === providerConfigId) {
        setRevision(current => current + 1);
      }
    };
    window.addEventListener(PROVIDER_MODEL_METADATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROVIDER_MODEL_METADATA_CHANGED_EVENT, refresh);
  }, [providerConfigId]);
  return revision;
}

export function useProviderModelContexts(projectId: string | null, providerConfigId: string) {
  const revision = useProviderModelMetadataRevision(providerConfigId);
  const identity = JSON.stringify([projectId, providerConfigId, revision]);
  const [resolved, setResolved] = useState<{ identity: string; models: Record<string, ModelContextSettings> }>();
  useEffect(() => {
    if (!projectId || !providerConfigId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const query = new URLSearchParams({ providerConfigId });
        const response = await requestJson<unknown>(`/api/projects/${encodeURIComponent(projectId)}/model-contexts?${query}`, { signal: controller.signal });
        const data = providerModelContextsSchema.parse(response);
        if (!controller.signal.aborted) setResolved({ identity, models: Object.fromEntries(data.models.map(model => [model.model, model])) });
      } catch { /* Missing or unauthorized metadata cannot advertise a capability. */ }
    })();
    return () => controller.abort();
  }, [identity, projectId, providerConfigId]);
  return resolved?.identity === identity ? resolved.models : {};
}
