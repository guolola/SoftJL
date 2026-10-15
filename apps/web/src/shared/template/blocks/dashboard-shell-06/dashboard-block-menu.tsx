// Connects the original block menu to real refresh and navigation actions.
import { EllipsisVerticalIcon } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { useDashboardLabels } from './dashboard-shell-labels'

export type DashboardBlockActions = { onRefresh: () => void; onDetails?: () => void }
export function DashboardBlockMenu({ onRefresh, onDetails }: DashboardBlockActions) {
  const { t } = useDashboardLabels()
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant='ghost' size='icon' className='text-muted-foreground size-6 rounded-full' />}>
      <EllipsisVerticalIcon /><span className='sr-only'>{t('menu')}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end'><DropdownMenuGroup>
      <DropdownMenuItem onClick={onRefresh}>{t('refresh')}</DropdownMenuItem>
      {onDetails && <DropdownMenuItem onClick={onDetails}>{t('details')}</DropdownMenuItem>}
    </DropdownMenuGroup></DropdownMenuContent>
  </DropdownMenu>
}
