// Adapts dashboard-dialog-34's original regions to provider creation; networking remains in GlobalSettingsPanel.
import { useTranslation } from 'react-i18next';
import { Building2Icon, GlobeIcon, KeyRoundIcon, Loader2Icon, PlugZapIcon, RocketIcon } from 'lucide-react';
import type { ProviderDiscoveredModel } from '@uml-platform/contracts';
import { Button } from '@/shared/ui/button';
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Progress } from '@/shared/ui/progress';
import { Separator } from '@/shared/ui/separator';
import { cn } from '@/shared/ui/utils';
import { ProviderModelCombobox09 } from './provider-model-combobox-09';

export type ProviderCreationForm = { name: string; baseUrl: string; apiKey: string; defaultModel: string };
type Props = {
  mode: "create" | "edit"; canSave: boolean;
  form: ProviderCreationForm; models: ProviderDiscoveredModel[]; busy: boolean; discovering: boolean; saving: boolean;
  progressText: string; progress: number;
  onField: <K extends keyof ProviderCreationForm>(key: K, value: ProviderCreationForm[K]) => void;
  onDiscover: () => void; onSave: () => void; onCancel: () => void;
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
  const connectionFields = [
    { key: 'name', id: 'provider-create-name', label: t('providerSettings.name'), icon: Building2Icon, placeholder: t('providerSettings.namePlaceholder') },
    { key: 'baseUrl', id: 'provider-create-base-url', label: 'Base URL', icon: GlobeIcon, placeholder: 'https://api.example.com' },
    { key: 'apiKey', id: 'provider-create-api-key', label: 'API Key', icon: KeyRoundIcon, placeholder: props.mode === 'edit' ? t('providerSettings.reenterKey') : undefined },
  ] as const;
  // Match the existing saved catalog: normalized model IDs remain unique, independent of search.
  const catalog = Array.from(new Map(props.models.map(model => [model.id.trim(), { ...model, id: model.id.trim() }])).values());
  return <DialogContent data-block="dashboard-dialog-34" className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
    <DialogHeader className="items-center gap-3 px-6 pt-8 pb-5 text-center">
      <div className="flex items-center gap-3">
        <span className="bg-foreground text-background flex size-11 items-center justify-center rounded-xl shadow-xs"><PlugZapIcon className="size-6" /></span>
        <ConnectorDots active={props.busy} />
        <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl shadow-xs"><RocketIcon className="size-5" /></span>
      </div>
      <div className="space-y-1"><DialogTitle className="text-lg font-semibold">{t(props.mode === 'edit' ? 'providerSettings.editProvider' : 'providerSettings.createProvider')}</DialogTitle><DialogDescription>{t(props.mode === 'edit' ? 'providerSettings.editDescription' : 'providerSettings.createDescription').replace(/[。.]+$/u, '')}</DialogDescription></div>
    </DialogHeader>
    <div className={cn('flex-1 space-y-5 overflow-x-hidden overflow-y-auto border-t px-4 py-5 sm:px-6', props.busy && 'opacity-60')}>
      <fieldset className="space-y-3" disabled={props.busy}>
        <legend className="text-sm font-semibold">{t('account.block37.connection')}</legend>
        {connectionFields.map(({ key, id, label, icon: Icon, placeholder }) => (
          <div key={key} className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md"><Icon className="size-4" /></span>
              <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
            </div>
            <Input id={id} value={props.form[key]} onChange={event => props.onField(key, event.target.value)} type={key === 'apiKey' ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={placeholder} className="h-9 w-full sm:w-56" />
          </div>
        ))}
      </fieldset>
      <Separator />
      <ProviderModelCombobox09 models={catalog} value={props.form.defaultModel} onValueChange={value => props.onField('defaultModel', value)} disabled={props.busy} />
      <div className="flex justify-end">
        <Button variant="outline" disabled={props.busy} onClick={props.onDiscover}>
          {props.discovering ? <Loader2Icon className="size-4 animate-spin" /> : <PlugZapIcon className="size-4" />}
          {t('providerSettings.fetchModels')}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t('providerSettings.incrementalDiscoveryHint')}</p>
      {props.discovering && <div className="space-y-1 text-xs text-muted-foreground" aria-live="polite"><Progress value={props.progress} aria-label={t('providerSettings.discoveryProgress')} /><p>{props.progressText}</p></div>}
    </div>
    <DialogFooter className="bg-muted/30 m-0 flex-col items-stretch justify-between gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:px-6">
      <p className="text-muted-foreground text-xs">{t('providerSettings.modelCount',{count:catalog.length})}</p>
      <div className="flex items-center gap-2 max-sm:*:flex-1"><Button variant="outline" disabled={props.busy} onClick={props.onCancel}>{t('providerSettings.cancel')}</Button><Button disabled={props.busy || !props.canSave} onClick={props.onSave}>{props.saving && <Loader2Icon className="size-4 animate-spin" />}{t('providerSettings.saveProvider')}</Button></div>
    </DialogFooter>
  </DialogContent>;
}
