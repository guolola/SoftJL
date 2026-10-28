// Adds per-model capability badges and places the project's reasoning Switch beside the source selector.
import { type ComponentProps } from "react";
import { useAuiState } from "@assistant-ui/react";
import { ModelingModelSelector } from "../../../../../shared/ui/modeling-model-selector";
import { canSelectHomeModel, MODELS } from "./model";
import { useHomeDemo } from "./environment";
import { homeText, useHomeLocale } from "./home-locale";
import { ModelSelector as OriginalModelSelector } from "../source/elements/model-selector.aui";
import { useHomePortal } from "./portals";

export function ModelSelector({ models, effort, onEffortChange, ...props }: ComponentProps<typeof OriginalModelSelector>) {
  useHomeLocale();
  const { modelContext } = useHomeDemo();
  const portalContainer = useHomePortal();
  const disabled = useAuiState(state => state.thread.isDisabled || state.thread.isRunning);
  const supportsReasoning = modelContext?.model === props.value && modelContext?.capacity.capabilities?.reasoning === true;
  const choices = models.map(model => {
    const metadata = MODELS.find(choice => choice.value === model.id);
    return { ...model, capabilities: { vision: metadata?.vision, reasoning: metadata?.reasoning } };
  });
  return <ModelingModelSelector {...props} models={choices} translate={homeText} portalContainer={portalContainer}
    disabled={disabled || !canSelectHomeModel()} reasoning={effort === "medium"} reasoningSupported={supportsReasoning}
    onReasoningChange={(enabled) => onEffortChange?.(enabled ? "medium" : "low")} />;
}
