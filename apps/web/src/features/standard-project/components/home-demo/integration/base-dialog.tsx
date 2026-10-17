/* eslint-disable @typescript-eslint/no-namespace -- Preserve the upstream merged component Props API at this adapter boundary. */
// Routes upstream overlays into their isolated theme host; component markup remains unchanged.
import { Dialog as Original } from "@base-ui/react/dialog";
import { forwardRef, type ComponentProps } from "react";
import { useHomePortal } from "./portals";
const Portal = forwardRef<HTMLDivElement, ComponentProps<typeof Original.Portal>>(function HomePortal(props, ref) {
  const container = useHomePortal();
  return <Original.Portal {...props} ref={ref} container={props.container ?? container} />;
});
export const Dialog = { ...Original, Portal };
export namespace Dialog {
  export namespace Root { export type Props = Original.Root.Props; }
  export namespace Trigger { export type Props = Original.Trigger.Props; }
  export namespace Portal { export type Props = Original.Portal.Props; }
  export namespace Close { export type Props = Original.Close.Props; }
  export namespace Backdrop { export type Props = Original.Backdrop.Props; }
  export namespace Popup { export type Props = Original.Popup.Props; }
  export namespace Title { export type Props = Original.Title.Props; }
  export namespace Description { export type Props = Original.Description.Props; }
}
