// Adapts configured provider models and Modelpedia metadata to the homepage's model data contract.
import type { ModelContextSettings, StandardTokenUsage } from "@uml-platform/contracts";
import { loadUserSettings } from "../../../../../shared/lib/user-settings";

type HomeModel = { name: string; value: string; icon: string; disabled: boolean; contextWindow?: number; reasoning?: boolean };
export const MODELS: HomeModel[] = [];
export const DEFAULT_MODEL_ID = "";
let selectionLocked = false;
let contextUsesBudget = false;
const icons = ["anthropic", "deepseek", "google", "groq", "kimi", "meta", "mistral", "openai", "openrouter", "xai", "zai"];

// Only one project content area is mounted by the workspace. The composer hook
// refreshes its memoized options when metadata changes, without remounting inputs.
export function configureHomeModels(settings: ReturnType<typeof loadUserSettings>, context: ModelContextSettings, locked: boolean, usage?: StandardTokenUsage) {
  selectionLocked = locked;
  contextUsesBudget = !context?.capacity.context || context.contextBudget < context.capacity.context;
  MODELS.splice(0, MODELS.length, ...settings.providerModelOptions.map(value => {
    const metadata = context?.model === value ? context.capacity : undefined;
    const match = icons.find(icon => value.toLowerCase().includes(icon))
      ?? (/claude/i.test(value) ? "anthropic" : /gemini/i.test(value) ? "google" : /gpt|o[134]-/i.test(value) ? "openai" : undefined);
    return { value, name: metadata?.name ?? value, disabled: false,
      // Unknown providers use the upstream project's own neutral GitHub mark.
      icon: `/assistant-ui/icons/${match ?? "github"}.svg`,
      contextWindow: (context?.model === value ? context.contextBudget : undefined) ?? metadata?.context ?? (usage?.model === value ? usage.contextBudget : undefined), reasoning: metadata?.capabilities?.reasoning === true };
  }));
  return JSON.stringify(MODELS);
}
export const canSelectHomeModel = () => !selectionLocked;
export const homeContextUsesBudget = () => contextUsesBudget;
export const isAvailableModelId = (id: string) => MODELS.some(model => model.value === id);
export const supportsReasoningEffort = (id: string) => MODELS.find(model => model.value === id)?.reasoning === true;
export const getContextWindow = (id: string): number => MODELS.find(model => model.value === id)?.contextWindow ?? 0;
