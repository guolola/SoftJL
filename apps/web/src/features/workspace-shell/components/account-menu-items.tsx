// Keeps sidebar and header account menus aligned in order, labels, and navigation destinations.
import { BookOpen, FolderKanban, LayoutDashboard, PlugZap, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PRODUCT_TUTORIAL_URL } from '../../../shared/lib/product-links';
import { DropdownMenuGroup, DropdownMenuItem } from '../../../shared/ui/dropdown-menu';
export function AccountMenuItems({ onAccount, onNavigate, onGuideSelect }: {
    onAccount: () => void;
    onNavigate: (path: string) => void;
    onGuideSelect?: () => void;
}) {
    const { t } = useTranslation();
    const destinations = [
        { path: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
        { path: '/projects', label: t('nav.projects'), icon: FolderKanban },
        { path: '/projects/connections', label: t('mcp.title'), icon: PlugZap },
    ];
    return (<DropdownMenuGroup>
      <DropdownMenuItem onClick={onAccount}><User />{t('auth.account')}</DropdownMenuItem>
      {destinations.map(({ path, label, icon: Icon }) => (<DropdownMenuItem key={path} onClick={() => onNavigate(path)}><Icon />{label}</DropdownMenuItem>))}
      <DropdownMenuItem onClick={onGuideSelect} render={<a href={PRODUCT_TUTORIAL_URL} target="_blank" rel="noopener noreferrer"/>}><BookOpen />{t('nav.tutorial')}</DropdownMenuItem>
    </DropdownMenuGroup>);
}
