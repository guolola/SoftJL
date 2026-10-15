// AdminCN sidebar composition for platform pages outside an individual project.
import { ClipboardCheck, CreditCard, FolderKanban, LayoutDashboard, PlugZap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Link from '../../../shared/lib/template-link';
import { DefaultSidebar } from '../../../shared/template/layout/default-sidebar';
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '../../../shared/ui/sidebar';
import { SidebarUserDropdown, type SidebarUserDropdownProps } from './sidebar-user-dropdown';
import { SidebarPromotionalVideoCard } from './sidebar-promotional-video-card';
export function PlatformSidebar({ path, ...accountActions }: {
    path: string;
} & SidebarUserDropdownProps) {
    const { t } = useTranslation();
    const { setOpenMobile } = useSidebar();
    const items = [
        { path: '/dashboard', title: t('nav.dashboard'), icon: LayoutDashboard },
        { path: '/projects', title: t('nav.projects'), icon: FolderKanban },
        { path: '/exam', title: t('nav.exam'), icon: ClipboardCheck },
    ];
    return <DefaultSidebar footer={<><SidebarPromotionalVideoCard /><SidebarUserDropdown {...accountActions}/></>}>
    <SidebarGroup><SidebarGroupContent><SidebarMenu>
      {items.map(item => <SidebarMenuItem key={item.path}>
        <SidebarMenuButton tooltip={item.title} aria-current={(item.path === '/projects' ? path === '/projects' || path === '/projects/new' : path.startsWith(item.path)) ? "page" : undefined} isActive={(item.path === '/projects' ? path === '/projects' || path === '/projects/new' : path.startsWith(item.path))} className="data-active:bg-primary/10!" onClick={() => setOpenMobile(false)} render={<Link href={item.path}/>}>
          <item.icon /><span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>)}
    </SidebarMenu></SidebarGroupContent></SidebarGroup>
  </DefaultSidebar>;
}
