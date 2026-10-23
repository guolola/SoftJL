// Uses Shadcn Studio combobox-09 directly, replacing countries and flags with model IDs and local brand logos.
'use client'

import { useId, type ReactNode, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox as ComboboxPrimitive } from '@base-ui/react'
import type { ProviderDiscoveredModel } from '@uml-platform/contracts'

import {
  Combobox,
  ComboboxContent,
  ComboboxTrigger,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor
} from '@/shared/ui/combobox'
import { Label } from '@/shared/ui/label'
import { cn } from '@/shared/ui/utils'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/shared/ui/input-group'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { ModelOutputModeBadge } from '@/shared/ui/model-output-mode-badge'
import { normalizeProviderModelCapability, inferProviderModelGroup } from '@/shared/lib/provider-model-display'

const ComboboxInput = ({
  className,
  children,
  disabled = false,
  showTrigger = true,
  icon,
  modeBadge,
  anchorRef,
  triggerLabel,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean
  icon?: ReactNode
  modeBadge?: ReactNode
  anchorRef: Ref<HTMLDivElement>
  triggerLabel: string
}) => {
  return (
    <InputGroup ref={anchorRef} className={cn('w-auto', className)}>
      {icon && <InputGroupAddon>{icon}</InputGroupAddon>}
      <ComboboxPrimitive.Input render={<InputGroupInput disabled={disabled} />} {...props} />
      <InputGroupAddon align='inline-end'>
        {modeBadge}
        {showTrigger && (
          <InputGroupButton
            size='icon-xs'
            variant='ghost'
            render={<ComboboxTrigger />}
            data-slot='input-group-button'
            className='data-pressed:bg-transparent'
            aria-label={triggerLabel}
            disabled={disabled}
          />
        )}
      </InputGroupAddon>
      {children}
    </InputGroup>
  )
}

type Props = {
  models: ProviderDiscoveredModel[]
  value: string
  onValueChange: (value: string) => void
  disabled: boolean
}

export function ProviderModelCombobox09({ models, value, onValueChange, disabled }: Props) {
  const id = useId()
  const anchorRef = useComboboxAnchor()
  const { t } = useTranslation()
  // Keep the selection in the provider form; search text must never become a model ID.
  const items = Array.from(new Set(models.map(model => model.id.trim()).filter(Boolean)))
  const selectedModel = items.find(model => model === value)
  const capabilities = new Map(models.map(model => [model.id.trim(), normalizeProviderModelCapability(model.id, model)]))

  return (
    <div data-component='combobox-09' className='w-full space-y-2'>
      <Label htmlFor={id}>{t('providerSettings.providerDefaultModel')}</Label>
      <Combobox id={id} items={items} value={selectedModel ?? null} onValueChange={model => onValueChange(model ?? '')} disabled={disabled || items.length === 0}>
        <ComboboxInput
          id={id}
          anchorRef={anchorRef}
          placeholder={t(items.length ? 'providerSettings.selectAllowedModel' : 'providerSettings.fetchModelsFirst')}
          icon={selectedModel && <ProviderIcon providerId={inferProviderModelGroup(selectedModel, '').id} />}
          modeBadge={selectedModel && capabilities.get(selectedModel) && <ModelOutputModeBadge mode={capabilities.get(selectedModel)!.structuredOutputMode} />}
          triggerLabel={t('providerSettings.toggleModels')}
          disabled={disabled || items.length === 0}
        />
        {/* Keep both edges aligned to the whole field, including while the popup opens. */}
        <ComboboxContent
          anchor={anchorRef}
          align='start'
          alignOffset={0}
          className='min-w-(--anchor-width) max-w-(--anchor-width) data-open:zoom-in-100! data-closed:zoom-out-100!'
        >
          <ComboboxEmpty>{t('account.block37.noMatchingModels')}</ComboboxEmpty>
          <ComboboxList>
            {model => (
              <ComboboxItem key={model} value={model} aria-label={model} title={model} className='flex items-center gap-2'>
                <ProviderIcon providerId={inferProviderModelGroup(model, '').id} />
                <span className='flex min-w-0 flex-1 flex-col'>
                  <span className='truncate font-medium'>{model}</span>
                </span>
              {capabilities.get(model) && <ModelOutputModeBadge mode={capabilities.get(model)!.structuredOutputMode} />}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
