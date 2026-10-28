// Uses the source composer's model menu and reasoning preference on every engineering generation page.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceProjectId } from "../../../services/workspace-repository/index";
import { useModelingModelContext } from "../../../services/workspace-repository/use-modeling-model-context";
import { useModelingReasoning } from "../../../shared/lib/modeling-reasoning";
import { getProviderModelLabel, inferProviderModelGroup } from "../../../shared/lib/provider-model-display";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { ModelingModelSelector } from "../../../shared/ui/modeling-model-selector";
import { ProviderIcon } from "../../../shared/ui/provider-icon";

export function GenerationModelControls({ disabled = false }: { disabled?: boolean;  }) {
  const { t } = useTranslation();
  const projectId = useWorkspaceProjectId();
  const { settings, modelContext, modelContexts } = useModelingModelContext(projectId);
  const [reasoning, setReasoning] = useModelingReasoning();
  const models = useMemo(() => settings.providerModelOptions.map(id => ({
    id,
    name: id === modelContext?.model ? modelContext.capacity.name ?? getProviderModelLabel(id) : getProviderModelLabel(id),
    icon: <ProviderIcon providerId={inferProviderModelGroup(id, settings.providerLabel).id} className="size-3.5" />,
    capabilities: (id === modelContext?.model ? modelContext : modelContexts[id])?.capacity.capabilities,
  })), [settings.providerModelOptions, settings.providerLabel, modelContext, modelContexts]);
  const translate = (value: string) => {
    const labels: Record<string, string> = { "Select model": "standardProject.chat.selectModel", "Search models...": "standardProject.chat.searchModels", "No models found.": "standardProject.chat.noModels", Reasoning: "requirements.composer.reasoning", Vision: "standardProject.chat.visionBadge", Model: "standardProject.chat.selectModel" };
    return labels[value] ? t(labels[value]) : value;
  };
  return <div className="flex min-w-0 items-center gap-1" data-testid="generation-model-controls">
    <ModelingModelSelector models={models} value={settings.defaultModel} registerModelContext={false} align="end"
      disabled={disabled} translate={translate} reasoning={reasoning}
      reasoningSupported={modelContext?.capacity.capabilities?.reasoning === true}
      onValueChange={model => { if (!disabled) patchUserSettings({ defaultModel: model }); }}
      onReasoningChange={value => { if (!disabled) setReasoning(value); }} />
  </div>;
}
