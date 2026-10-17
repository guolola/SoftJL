// Keeps runtime-owned menus and selection portals inside the source theme without changing their controls.
export * from "@assistant-ui/react";
import { ActionBarMorePrimitive as More, SelectionToolbarPrimitive as Selection } from "@assistant-ui/react";
import { forwardRef, type ComponentProps, type ComponentRef } from "react";
import { useHomePortal } from "./portals";
const MoreContent = forwardRef<ComponentRef<typeof More.Content>, ComponentProps<typeof More.Content>>(function MoreContent(props, ref) {
  const container = useHomePortal();
  return <More.Content {...props} ref={ref} portalProps={{ ...props.portalProps, container: props.portalProps?.container ?? container?.current }} />;
});
const SelectionRoot = forwardRef<ComponentRef<typeof Selection.Root>, ComponentProps<typeof Selection.Root>>(function SelectionRoot(props, ref) {
  return <Selection.Root {...props} ref={ref} className={`homepage-theme ${props.className ?? ""}`} />;
});
export const ActionBarMorePrimitive = { ...More, Content: MoreContent };
export const SelectionToolbarPrimitive = { ...Selection, Root: SelectionRoot };
