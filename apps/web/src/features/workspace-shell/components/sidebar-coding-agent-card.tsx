// Guides project users from their design workspace to the existing Coding Agent connections page.
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Link from '../../../shared/lib/template-link';
import { Button } from '../../../shared/ui/button';
import { useSidebar } from '../../../shared/ui/sidebar';
import { useSidebarCardDismissal } from '../lib/use-sidebar-card-dismissal';

export function SidebarCodingAgentCard() {
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();
  const { dismissed, dismiss } = useSidebarCardDismissal('coding-agent');

  if (dismissed) return null;

  return (
    <div data-slot='sidebar-coding-agent-card' className='bg-background relative mx-1 mb-2 flex shrink-0 flex-col items-start gap-2 rounded-md p-3 group-data-[collapsible=icon]:hidden'>
      <Button variant='ghost' size='icon-sm' className='text-muted-foreground absolute top-3 right-2' aria-label={t('common.close')} onClick={dismiss}>
        <X aria-hidden='true' />
      </Button>
      <p className='pr-8 text-sm font-semibold'>{t('workspace.sidebar.codingAgentCard.title')}</p>
      <p className='text-xs text-muted-foreground'>{t('workspace.sidebar.codingAgentCard.description')}</p>
      <Button role='link' nativeButton={false} render={<Link href='/projects/connections' />} onClick={() => setOpenMobile(false)}>
        {t('workspace.sidebar.codingAgentCard.connect')}
      </Button>
    </div>
  );
}
