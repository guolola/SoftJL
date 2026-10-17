/* eslint-disable @typescript-eslint/no-namespace -- Preserve the upstream merged component Props API at this adapter boundary. */
// Routes upstream overlays into their isolated theme host; component markup remains unchanged.
import { Popover as Original } from "@base-ui/react/popover";
import { forwardRef, type ComponentProps } from "react";
import { useHomePortal } from "./portals";
const Portal = forwardRef<HTMLDivElement, ComponentProps<typeof Original.Portal>>(function HomePortal(props, ref) {
  const container = useHomePortal();
  return <Original.Portal {...props} ref={ref} container={props.container ?? container} />;
});
export const Popover = { ...Original, Portal };
export namespace Popover {
  export namespace Root { export type Props = Original.Root.Props; }
  export namespace Trigger { export type Props = Original.Trigger.Props; }
  export namespace Popup { export type Props = Original.Popup.Props; }
  export namespace Positioner { export type Props = Original.Positioner.Props; }
  export namespace Title { export type Props = Original.Title.Props; }
  export namespace Description { export type Props = Original.Description.Props; }
}
