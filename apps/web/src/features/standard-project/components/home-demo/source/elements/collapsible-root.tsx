// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
"use client";
import { useHomeLocale } from "../../integration/home-locale";


import { Collapsible } from "@base-ui/react/collapsible";
import { forwardRef } from "react";

export const CollapsibleRoot = forwardRef<
  React.ComponentRef<typeof Collapsible.Root>,
  React.ComponentPropsWithoutRef<typeof Collapsible.Root>
>(function CollapsibleRoot(props, ref) {
  useHomeLocale();
  return <Collapsible.Root ref={ref} data-slot="collapsible" {...props} />;
});

export function CollapsibleTrigger({ ...props }: Collapsible.Trigger.Props) {
  useHomeLocale();
  return <Collapsible.Trigger data-slot="collapsible-trigger" {...props} />;
}

export function CollapsibleContent({ ...props }: Collapsible.Panel.Props) {
  useHomeLocale();
  return <Collapsible.Panel data-slot="collapsible-content" {...props} />;
}
