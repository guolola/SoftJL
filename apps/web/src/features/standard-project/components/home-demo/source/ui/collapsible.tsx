// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
"use client";
import { useHomeLocale } from "../../integration/home-locale";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  useHomeLocale();
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  );
}

export { CollapsibleTrigger };
