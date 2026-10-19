// Supplies project-specific starter prompts while preserving the imported suggestion layout and send behavior.
import { ThreadPrimitive, useAuiState } from '@assistant-ui/react'
import { standardDiagramKinds } from '@uml-platform/contracts'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/ui/utils'

const tasks = ['requirements', 'scope', 'usecase', 'activity', 'sequence', 'classes', 'tests', 'requirementsSpec', 'softwareDesignSpec'] as const

export function IntroSuggestions() {
  const { t, i18n } = useTranslation()
  const isComposerEmpty = useAuiState(state => state.composer.isEmpty)
  const models = standardDiagramKinds.map(kind => t(`standardProject.diagramKinds.${kind}`))
    .join(i18n.resolvedLanguage?.startsWith('zh') ? '、' : ', ')

  // Keep the row's height while typing so the composer does not move under the cursor.
  return <div role='group' aria-label={t('standardProject.intro.suggestions.label')} inert={!isComposerEmpty}
    className={cn(
      'animate-in fade-in mx-auto flex max-w-[34rem] flex-wrap items-center justify-center gap-2 transition-opacity duration-200 motion-reduce:animate-none',
      !isComposerEmpty && 'opacity-0',
    )}>
    {tasks.map(task => <ThreadPrimitive.Suggestion key={task} send
      prompt={t(`standardProject.intro.suggestions.${task}.prompt`, { models })}
      className='border-foreground/10 bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground rounded-control h-8 border px-3 text-[13px] transition-colors'>
      {t(`standardProject.intro.suggestions.${task}.label`)}
    </ThreadPrimitive.Suggestion>)}
  </div>
}
