// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
import Image from "next/image";
import { MODELS } from "../../../../../../../integration/model";

export function docsModelOptions() {
  return MODELS.map((model) => ({
    id: model.value,
    name: model.name,
    icon: (
      <Image
        src={model.icon}
        alt={model.name}
        width={14}
        height={14}
        className="size-3.5"
      />
    ),
    ...(model.disabled ? { disabled: true as const } : undefined),
  }));
}
