// Presents the template's avatar and elapsed-time footer, plus per-instance provenance in details.
import { UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarImage, AvatarFallback } from '../../../shared/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../shared/ui/tooltip';
import { memberInitials } from '../../user-platform/lib/project-workspace-presentation';
import { formatGenerationDuration, type GenerationInfo, type NodeGenerationInfo } from '../lib/lineage-generation';
export function GenerationStamp({ info, representative }: { info?: GenerationInfo; representative?: boolean }) {
  const { t, i18n } = useTranslation();
  const name = info?.member?.displayName || info?.member?.email || t('lineage.generation.unknownPerson');
  const duration = !info?.generated ? t('lineage.statuses.not_generated') : info.durationMs === undefined ? t('lineage.generation.unrecorded') : formatGenerationDuration(info.durationMs, i18n.resolvedLanguage ?? 'en');
  const scope = t('lineage.generation.' + (info?.scope === 'rules-batch' ? 'rulesBatch' : 'elapsed'));
  return <div className='flex min-w-0 items-center gap-1.5'>
    <TooltipProvider delay={0}><Tooltip>
      <TooltipTrigger render={<span aria-label={name} className='shrink-0' />}>
        <Avatar size='sm'>
          {info?.member?.avatarUrl && <AvatarImage src={info.member.avatarUrl} alt={name} />}
          <AvatarFallback>{info?.member ? memberInitials(info.member) : <UserRound className='size-3.5' />}</AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent role='tooltip'>{name}</TooltipContent>
    </Tooltip></TooltipProvider>
    <TooltipProvider delay={0}><Tooltip>
      <TooltipTrigger render={<span className='text-muted-foreground truncate text-xs tabular-nums' />}>{duration}</TooltipTrigger>
      <TooltipContent role='tooltip'><span>{scope}: {duration}{representative && info ? <><br />{t('lineage.generation.representative', { label: info.label })}</> : null}</span></TooltipContent>
    </Tooltip></TooltipProvider>
  </div>;
}
export function GenerationDetails({ info }: { info?: NodeGenerationInfo }) {
  const { t, i18n } = useTranslation();
  return <div className='space-y-3'>
    <p className='text-sm font-semibold'>{t('lineage.generation.title')}</p>
    {info?.instances.length ? info.instances.map(instance => <div key={instance.instanceId} className='space-y-1.5'>
      <p className='text-xs font-medium'>{instance.label}</p>
      <GenerationStamp info={instance} />
      {instance.scope === 'rules-batch' && <p className='text-muted-foreground text-xs'>{t('lineage.generation.rulesBatch')}</p>}
      {instance.completedAt && <p className='text-muted-foreground text-xs'>{new Date(instance.completedAt).toLocaleString(i18n.resolvedLanguage)}</p>}
    </div>) : <GenerationStamp />}
  </div>;
}
