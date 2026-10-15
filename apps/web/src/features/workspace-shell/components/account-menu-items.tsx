// Keeps sidebar and header account menus aligned in order, labels, and navigation destinations.
import { BookOpen, ClipboardCheck, CreditCard, FolderKanban, LayoutDashboard, PlugZap, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DropdownMenuGroup, DropdownMenuItem } from '../../../shared/ui/dropdown-menu';
export function AccountMenuItems({ onAccount, onNavigate }: {
    onAccount: () => void;
    onNavigate: (path: string) => void;
}) {
    const { t } = useTranslation();
    const destinations = [
        { path: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
        { path: '/projects', label: t('nav.projects'), icon: FolderKanban },
        { path: '/exam', label: t('nav.exam'), icon: ClipboardCheck },
        { path: '/tutorial', label: t('nav.tutorial'), icon: BookOpen },
    ];
    return (<DropdownMenuGroup>
      <DropdownMenuItem onClick={onAccount}><User />{t('auth.account')}</DropdownMenuItem>
      {destinations.map(({ path, label, icon: Icon }) => (<DropdownMenuItem key={path} onClick={() => onNavigate(path)}><Icon />{label}</DropdownMenuItem>))}
    </DropdownMenuGroup>);
}
