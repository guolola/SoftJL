// Uses the AdminCN default-layout Sidebar composition with platform navigation.
import type { ReactNode } from 'react';
import { SidebarBrand } from './sidebar-brand';
import { Sidebar, SidebarContent, SidebarFooter, SidebarResizeHandle } from '../../ui/sidebar';

export function DefaultSidebar({
  children,
  footer,
  resizeLabel,
}: {
  children: ReactNode;
  footer?: ReactNode;
  resizeLabel?: string;
}) {
  return (
    <Sidebar collapsible='icon' variant='sidebar'>
      <SidebarBrand />
      <SidebarContent>
        {children}
      </SidebarContent>
      {footer && <SidebarFooter>{footer}</SidebarFooter>}
      {resizeLabel && <SidebarResizeHandle label={resizeLabel} />}
    </Sidebar>
  );
}
