// Routes upstream overlays into their isolated theme host; component markup remains unchanged.
import { Tooltip as Original } from "@base-ui/react/tooltip";
import { forwardRef, type ComponentProps } from "react";
import { useHomePortal } from "./portals";
const Portal = forwardRef<HTMLDivElement, ComponentProps<typeof Original.Portal>>(function HomePortal(props, ref) {
  const container = useHomePortal();
  return <Original.Portal {...props} ref={ref} container={props.container ?? container} />;
});
export const Tooltip = { ...Original, Portal };
export namespace Tooltip {
  export namespace Provider { export type Props = Original.Provider.Props; }
  export namespace Root { export type Props = Original.Root.Props; }
  export namespace Trigger { export type Props = Original.Trigger.Props; }
  export namespace Popup { export type Props = Original.Popup.Props; }
  export namespace Positioner { export type Props = Original.Positioner.Props; }
}
