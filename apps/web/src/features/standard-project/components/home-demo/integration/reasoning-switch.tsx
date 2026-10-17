// Places the project's existing reasoning Switch beside the source model selector, outside its popup.
import { type ComponentProps } from "react";
import { useAuiState } from "@assistant-ui/react";
import { ModelingModelSelector } from "../../../../../shared/ui/modeling-model-selector";
import { canSelectHomeModel } from "./model";
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
  return <ModelingModelSelector {...props} models={models} translate={homeText} portalContainer={portalContainer}
    disabled={disabled || !canSelectHomeModel()} reasoning={effort === "medium"} reasoningSupported={supportsReasoning}
    onReasoningChange={(enabled) => onEffortChange?.(enabled ? "medium" : "low")} />;
}
