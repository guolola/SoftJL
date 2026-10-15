// Connects the sidebar account menu to the verified session and existing account/project actions.
import { useRef, useState } from 'react';
import { ChevronRight, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthenticatedRouteSession } from '../../user-platform/components/authenticated-route-session';
import { notifyAuthSessionChanged, platformApi } from '../../user-platform/services/platform-api';
import { Avatar, AvatarFallback, AvatarImage } from '../../../shared/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../../shared/ui/dropdown-menu';
import { floatingAlert } from '../../../shared/ui/floating-alert';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../../../shared/ui/sidebar';
import { AccountMenuItems } from './account-menu-items';

export type SidebarUserDropdownProps = {
  onOpenAccount: () => void;
  onNavigate: (path: string) => void;
};

export function SidebarUserDropdown({
  onOpenAccount, onNavigate,
}: SidebarUserDropdownProps) {
  const { t } = useTranslation();
  const session = useAuthenticatedRouteSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const user = session?.user;
  const name = user?.displayName || user?.email || t('auth.login');
  const avatar = () => (
    <Avatar className="rounded-lg after:rounded-[inherit]">
      <AvatarImage src={user?.avatarUrl ?? undefined} alt={name} className="rounded-[inherit]" />
      <AvatarFallback className="rounded-[inherit]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
  const identity = () => (
    <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">{name}</span>
      <span className="text-muted-foreground truncate text-xs">{user?.email}</span>
    </div>
  );
  const select = (action: () => void) => {
    setOpenMobile(false);
    action();
  };
  const logout = async () => {
    // Keep the verified session intact on failure; notify other consumers only after server logout succeeds.
    if (logoutPending.current || !user) return;
    logoutPending.current = true;
    setLoggingOut(true);
    try {
      await platformApi.logout();
      select(() => onNavigate('/login'));
      notifyAuthSessionChanged();
    } catch {
      floatingAlert.error(t('account.logoutFailed'));
    } finally {
      logoutPending.current = false;
      setLoggingOut(false);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${t('auth.account')}：${name}`}
            disabled={!user || loggingOut}
            render={<SidebarMenuButton size="lg" className="rounded-lg bg-sidebar-accent/50 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground" />}
          >
            {avatar()}
            <div className="flex min-w-0 flex-1 group-data-[collapsible=icon]:hidden">{identity()}</div>
            <ChevronRight className="ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden [[data-popup-open]>&]:rotate-180" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-60 rounded-xl"
            side={isMobile ? 'top' : 'right'}
            align="end"
            sideOffset={isMobile ? 8 : 16}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
                  {avatar()}{identity()}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <AccountMenuItems onAccount={() => select(onOpenAccount)} onNavigate={path => select(() => onNavigate(path))} />
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={loggingOut} onClick={() => void logout()}><LogOut />{t('account.logout')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
