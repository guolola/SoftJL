// AdminCN ProfileDropdown composition connected to the authenticated user and existing account dialog.
import { useTranslation } from 'react-i18next';
import type { PlatformUser } from '../../user-platform/services/platform-api';
import { Avatar, AvatarFallback, AvatarImage } from '../../../shared/ui/avatar';
import { Button } from '../../../shared/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator } from '../../../shared/ui/dropdown-menu';
import { AccountMenuItems } from './account-menu-items';

export function ProfileDropdown({ user, onAccount, onNavigate }: { user: PlatformUser | null; onAccount: () => void; onNavigate: (path: string) => void }) {
  const { t } = useTranslation();
  const name = user?.displayName || user?.email || t('auth.login');
  const avatar = (large = false) => <Avatar className={large ? 'size-10' : undefined}>
    <AvatarImage src={user?.avatarUrl ?? undefined} alt={name} />
    <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
  </Avatar>;
  return <DropdownMenu>
    <DropdownMenuTrigger aria-label={t('auth.account')} render={<Button variant="ghost" size="icon" className="relative rounded-full hover:bg-transparent" />}>
      {avatar()}
      {user && <span className="ring-card absolute right-0 bottom-0 block size-2 rounded-full bg-success ring-2" />}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-60">
      <DropdownMenuGroup><DropdownMenuLabel className="flex items-center gap-4 px-2 py-2.5 font-normal">
        <div className="relative">{avatar(true)}{user && <span className="ring-card absolute right-0 bottom-0 block size-2 rounded-full bg-success ring-2" />}</div>
        <div className="flex min-w-0 flex-1 flex-col items-start">
          <span className="text-foreground max-w-full truncate text-base font-semibold">{name}</span>
          <span className="text-muted-foreground max-w-full truncate text-sm">{user?.email}</span>
        </div>
      </DropdownMenuLabel></DropdownMenuGroup>
      <DropdownMenuSeparator />
      <AccountMenuItems onAccount={onAccount} onNavigate={onNavigate} />
    </DropdownMenuContent>
  </DropdownMenu>;
}
