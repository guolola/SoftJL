// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
import { ProviderIcon } from "@/shared/ui/provider-icon";
import { MODELS } from "../../../../../../../integration/model";

export function docsModelOptions() {
  return MODELS.map((model) => ({
    id: model.value,
    name: model.name,
    icon: (
      <ProviderIcon providerId={model.providerId} className="size-3.5" />
    ),
    ...(model.disabled ? { disabled: true as const } : undefined),
  }));
}
