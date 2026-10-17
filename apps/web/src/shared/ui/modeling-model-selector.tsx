// Both modeling workflows use the original quick-modeling selector and the same adjacent reasoning control.
"use client";

import { useEffect, useMemo } from "react";
import { useAui } from "@assistant-ui/react";
import {
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorContent,
  useModelSelectorContext,
  type ModelOption,
  type ModelSelectorProps,
} from "./model-selector";
import { Switch } from "./switch";
import { cn } from "./utils";

export type ModelingModelOption = ModelOption;
export type ModelingModelSelectorProps = Omit<ModelSelectorProps, "effort" | "defaultEffort" | "onEffortChange"> & {
  reasoning?: boolean;
  reasoningSupported?: boolean;
  onReasoningChange?: (enabled: boolean) => void;
  disabled?: boolean;
  registerModelContext?: boolean;
};

function ModelContextRegistration() {
  const { value } = useModelSelectorContext();
  const api = useAui();
  useEffect(() => {
    if (value === undefined) return;
    return api.modelContext.register({ getModelContext: () => ({ config: { modelName: value } }) });
  }, [api, value]);
  return null;
}

export function ModelingModelSelector({
  models,
  reasoning,
  reasoningSupported,
  onReasoningChange,
  disabled,
  registerModelContext = true,
  onValueChange,
  searchable,
  variant = "ghost",
  size = "sm",
  align,
  className,
  contentClassName,
  translate = (value) => value,
  ...rootProps
}: ModelingModelSelectorProps) {
  // Reasoning is a boolean beside the trigger; the shared original popup remains a model-only menu.
  const choices = useMemo(() => models.map((model) => ({ ...model, efforts: undefined })), [models]);
  return <>
    <ModelSelectorRoot {...rootProps} models={choices} translate={translate}
      onValueChange={(value) => { if (!disabled) onValueChange?.(value); }}>
      {registerModelContext && <ModelContextRegistration />}
      <ModelSelectorTrigger aria-label={translate("Select model")} variant={variant} size={size} disabled={disabled}
        className={cn("text-muted-foreground hover:text-foreground rounded-[0.5rem] rounded-control h-7 min-w-0 text-[13px] font-normal", className)} />
      <ModelSelectorContent {...(align !== undefined ? { align } : {})} className={contentClassName} searchable={searchable ?? false} />
    </ModelSelectorRoot>
    {reasoningSupported && <span className="inline-flex shrink-0 items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
      <span>{translate("Reasoning")}</span>
      <Switch aria-label={translate("Reasoning")} checked={reasoning === true} disabled={disabled}
        onCheckedChange={(checked) => { if (!disabled) onReasoningChange?.(checked); }} />
    </span>}
  </>;
}
