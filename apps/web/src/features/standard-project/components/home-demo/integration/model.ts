// Adapts configured provider models and Models.dev metadata to the homepage's model data contract.
import type { ModelContextSettings, StandardTokenUsage } from "@uml-platform/contracts";
import { loadUserSettings } from "../../../../../shared/lib/user-settings";
import { inferProviderModelGroup } from "../../../../../shared/lib/provider-model-display";

type HomeModel = { name: string; value: string; providerId: string; disabled: boolean; contextWindow?: number; reasoning?: boolean; vision?: boolean };
export const MODELS: HomeModel[] = [];
export const DEFAULT_MODEL_ID = "";
let selectionLocked = false;
let contextUsesBudget = false;

// Only one project content area is mounted by the workspace. The composer hook
// refreshes its memoized options when metadata changes, without remounting inputs.
export function configureHomeModels(settings: ReturnType<typeof loadUserSettings>, context: ModelContextSettings, locked: boolean, usage?: StandardTokenUsage, contexts: Record<string, ModelContextSettings> = {}) {
  selectionLocked = locked;
  contextUsesBudget = !context?.capacity.context || context.contextBudget < context.capacity.context;
  MODELS.splice(0, MODELS.length, ...settings.providerModelOptions.map(value => {
    const metadata = context?.model === value ? context.capacity : contexts[value]?.capacity;
    return { value, name: metadata?.name ?? value, disabled: false,
      providerId: inferProviderModelGroup(value, settings.providerLabel).id,
      contextWindow: (context?.model === value ? context.contextBudget : undefined) ?? metadata?.context ?? (usage?.model === value ? usage.contextBudget : undefined), reasoning: metadata?.capabilities?.reasoning === true, vision: metadata?.capabilities?.vision === true };
  }));
  return JSON.stringify(MODELS);
}
export const canSelectHomeModel = () => !selectionLocked;
export const homeContextUsesBudget = () => contextUsesBudget;
export const isAvailableModelId = (id: string) => MODELS.some(model => model.value === id);
export const supportsReasoningEffort = (id: string) => MODELS.find(model => model.value === id)?.reasoning === true;
export const getContextWindow = (id: string): number => MODELS.find(model => model.value === id)?.contextWindow ?? 0;
