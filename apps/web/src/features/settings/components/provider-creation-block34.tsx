// Adapts dashboard-dialog-34's original regions to provider creation; networking remains in GlobalSettingsPanel.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2Icon, CircleCheckIcon, GlobeIcon, KeyRoundIcon, Loader2Icon, PlugZapIcon, RocketIcon, SearchIcon } from 'lucide-react';
import type { ProviderDiscoveredModel } from '@uml-platform/contracts';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/shared/ui/input-group';
import { Label } from '@/shared/ui/label';
import { Progress } from '@/shared/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { Separator } from '@/shared/ui/separator';
import { cn } from '@/shared/ui/utils';

export type ProviderCreationForm = { name: string; baseUrl: string; apiKey: string; defaultModel: string };
type Props = {
  open: boolean; form: ProviderCreationForm; models: ProviderDiscoveredModel[]; busy: boolean; discovering: boolean; testing: boolean; saving: boolean;
  canDiscover: boolean; canTest: boolean; testPassed: boolean; feedback: string; progressText: string; progress: number;
  onField: <K extends keyof ProviderCreationForm>(key: K, value: ProviderCreationForm[K]) => void;
  onDiscover: () => void; onTest: () => void; onSave: () => void; onCancel: () => void;
};
const ConnectorDots = ({ active }: { active: boolean }) => (
  <div className='flex items-center gap-1' aria-hidden='true'>
    {[0, 1, 2].map(dot => (
      <span
        key={dot}
        style={{ animationDelay: `${dot * 150}ms` }}
        className={cn('bg-muted-foreground/40 size-1 rounded-full', active && 'bg-primary animate-pulse')}
      />
    ))}
  </div>
)


export function ProviderCreationBlock34(props: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  useEffect(() => { if (!props.open) setQuery(''); }, [props.open]);
  // Match the existing saved catalog: normalized model IDs remain unique, independent of search.
  const catalog = Array.from(new Map(props.models.map(model => [model.id.trim(), { ...model, id: model.id.trim() }])).values());
  const models = catalog.filter(model => model.id.toLowerCase().includes(query.trim().toLowerCase()));
  const prerequisite = !props.form.name.trim() ? t('providerSettings.nameRequired') : !props.canDiscover ? t('providerSettings.baseKeyRequired') : !props.form.defaultModel || props.models.length === 0 ? t('providerSettings.fetchBeforeActions') : !props.testPassed ? t('providerSettings.testRequired') : t('providerSettings.readyToSave');
  return <DialogContent data-block="dashboard-dialog-34" className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
    <DialogHeader className="items-center gap-3 px-6 pt-8 pb-5 text-center">
      <div className="flex items-center gap-3">
        <span className="bg-foreground text-background flex size-11 items-center justify-center rounded-xl shadow-xs"><PlugZapIcon className="size-6" /></span>
        <ConnectorDots active={props.busy} />
        <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl shadow-xs"><RocketIcon className="size-5" /></span>
      </div>
      <div className="space-y-1"><DialogTitle className="text-lg font-semibold">{t('providerSettings.createProvider')}</DialogTitle><DialogDescription>{t('providerSettings.createDescription').replace(/[。.]+$/u, '')}</DialogDescription></div>
    </DialogHeader>
    <div className={cn('flex-1 space-y-5 overflow-x-hidden overflow-y-auto border-t px-4 py-5 sm:px-6', props.busy && 'opacity-60')}>
      <div className="flex items-center gap-3">
        <Avatar size="lg"><AvatarFallback><Building2Icon className="size-4" /></AvatarFallback></Avatar>
        <div className="min-w-0 flex-1"><Label htmlFor="provider-create-name" className="text-sm font-medium">{t('providerSettings.name')}</Label><Input id="provider-create-name" className="h-9" value={props.form.name} onChange={event => props.onField('name',event.target.value)} placeholder={t('providerSettings.namePlaceholder')} disabled={props.busy} /></div>
        <Button variant="outline" disabled={props.busy || !props.canDiscover} onClick={props.onDiscover} className="h-9 shrink-0 self-end max-sm:size-9 max-sm:p-0" aria-label={t('providerSettings.fetchModels')}>
          {props.discovering ? <Loader2Icon className="size-4 animate-spin" /> : <PlugZapIcon className="size-4" />}<span className="max-sm:sr-only">{t('providerSettings.fetchModels')}</span>
        </Button>
      </div>
      <Separator />
      <fieldset className="space-y-2.5" disabled={props.busy}>
        <legend className="text-sm font-semibold">{t('providerSettings.providerDefaultModel')}</legend>
        <Card className="gap-0 py-0 shadow-none">
          <div className="flex items-center gap-2 border-b p-2"><InputGroup className="flex-1"><InputGroupAddon><SearchIcon className="size-4" /></InputGroupAddon><InputGroupInput value={query} onChange={event => setQuery(event.target.value)} placeholder={t('account.block37.searchModels')} aria-label={t('account.block37.searchModels')} /></InputGroup></div>
          <RadioGroup value={props.form.defaultModel} onValueChange={value => props.onField('defaultModel', value)} disabled={props.busy} aria-label={t('providerSettings.providerDefaultModel')}>
          <ul className="divide-y" aria-label={t('providerSettings.providerDefaultModel')}>
            {models.length === 0 && <li className="text-muted-foreground px-3 py-6 text-center text-sm">{props.models.length ? t('account.block37.noMatchingModels') : t('providerSettings.fetchModelsFirst')}</li>}
            {models.map(model => <li key={model.id} className="hover:bg-muted/40 relative flex items-center gap-3 px-3 py-2.5">
              <RadioGroupItem value={model.id} id={'provider-model-' + model.id} aria-label={model.id} />
              <div className="min-w-0 flex-1"><Label htmlFor={'provider-model-' + model.id} className="block h-5 cursor-pointer truncate text-sm font-medium after:absolute after:inset-0">{model.id}</Label><p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs"><span className="bg-primary size-2 rounded-full" />{model.modeLabel ?? t('providerSettings.compatibleMode')}</p></div>
              {props.form.defaultModel === model.id && <Badge variant="outline" className="gap-1 font-normal">{t('providerSettings.defaultModel')}</Badge>}
            </li>)}
          </ul>
          </RadioGroup>
        </Card>
      </fieldset>
      <Separator />
      <fieldset className="space-y-2.5" disabled={props.busy}>
        <legend className="text-sm font-semibold">{t('account.block37.connection')}</legend>
        <Card className="gap-0 py-0 shadow-none"><ul className="divide-y">
          {(['baseUrl','apiKey'] as const).map(key => <li key={key} className="flex flex-col gap-2.5 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:py-2.5">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center"><span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">{key === 'baseUrl' ? <GlobeIcon className="size-4" /> : <KeyRoundIcon className="size-4" />}</span><Label htmlFor={key === 'baseUrl' ? 'provider-create-base-url' : 'provider-create-api-key'} className="text-sm font-medium">{key === 'baseUrl' ? 'Base URL' : 'API Key'}</Label></div>
            <Input id={key === 'baseUrl' ? 'provider-create-base-url' : 'provider-create-api-key'} value={props.form[key]} onChange={event => props.onField(key,event.target.value)} type={key === 'apiKey' ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={key === 'baseUrl' ? 'https://api.example.com' : undefined} className="w-full sm:w-56" />
          </li>)}
        </ul></Card>
      </fieldset>
      <Separator />
      <fieldset disabled={props.busy}><div className="flex items-center justify-between gap-4"><div className="flex flex-col items-start gap-0.5"><span className="text-sm font-medium">{t('providerSettings.testConfig')}</span><span className="text-muted-foreground text-xs font-normal">{t('account.block37.testHint').replace(/[。.]+$/u, '')}</span></div><Button variant="outline" onClick={props.onTest} disabled={props.busy || !props.canTest}>{props.testing ? <Loader2Icon className="size-4 animate-spin" /> : <PlugZapIcon className="size-4" />}{t('providerSettings.testConfig')}</Button></div></fieldset>
      <Card className="bg-muted/40 py-3 shadow-none"><CardContent className="flex flex-row items-center gap-2.5 px-3">
        {props.testPassed ? <CircleCheckIcon className="size-4 shrink-0 text-green-600 dark:text-green-400" /> : <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1 text-xs leading-tight text-muted-foreground" aria-live="polite">
          {(props.discovering || props.progressText) && <div className="mb-2 space-y-1"><Progress value={props.progress} aria-label={t('providerSettings.discoveryProgress')} /><p>{props.progressText}</p></div>}
          <p>{props.feedback || (props.testPassed ? t('providerSettings.testPassed') : prerequisite)}</p>
        </div>
      </CardContent></Card>
    </div>
    <DialogFooter className="bg-muted/30 m-0 flex-col items-stretch justify-between gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:px-6">
      <p className="text-muted-foreground text-xs">{t('providerSettings.modelCount',{count:catalog.length})}</p>
      <div className="flex items-center gap-2 max-sm:*:flex-1"><Button variant="outline" disabled={props.busy} onClick={props.onCancel}>{t('providerSettings.cancel')}</Button><Button disabled={props.busy} onClick={props.onSave}>{props.saving && <Loader2Icon className="size-4 animate-spin" />}{t('providerSettings.saveProvider')}</Button></div>
    </DialogFooter>
  </DialogContent>;
}
