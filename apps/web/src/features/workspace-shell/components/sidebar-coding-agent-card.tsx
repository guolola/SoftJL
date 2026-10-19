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
    // Keep the current 24px left inset (footer padding plus margin) when the sidebar expands.
    <div data-slot='sidebar-coding-agent-card' className='bg-background relative mb-2 ml-4 flex h-[308px] w-[231px] max-w-[calc(100%_-_1rem)] shrink-0 flex-col items-start gap-4 self-start rounded-md p-4 pb-0 group-data-[collapsible=icon]:hidden'>
      <Button variant='ghost' size='icon-sm' className='text-muted-foreground absolute top-3 right-2' aria-label={t('common.close')} onClick={dismiss}>
        <X aria-hidden='true' />
      </Button>
      <p className='pr-8 text-xl font-semibold'>{t('workspace.sidebar.codingAgentCard.title')}</p>
      <p className='text-sm'>{t('workspace.sidebar.codingAgentCard.description')}</p>
      <Button role='link' nativeButton={false} render={<Link href='/projects/connections' />} onClick={() => setOpenMobile(false)}>
        {t('workspace.sidebar.codingAgentCard.connect')}
      </Button>
      <img
        src='/marketing/generated/sidebar-coding-agent.webp'
        alt=''
        aria-hidden='true'
        width={520}
        height={347}
        className='mt-auto block min-h-0 w-full flex-1 self-center object-contain object-bottom'
      />
    </div>
  );
}
