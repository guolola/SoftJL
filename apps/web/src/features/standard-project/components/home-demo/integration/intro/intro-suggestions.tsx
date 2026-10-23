// Starts a modeling conversation from concrete project examples using the existing send behavior.
import { ThreadPrimitive, useAuiState } from '@assistant-ui/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/ui/utils'

const projects = ['library', 'courses', 'seats', 'shopping', 'foodDelivery', 'appointments'] as const

export function IntroSuggestions() {
  const { t } = useTranslation()
  const isComposerEmpty = useAuiState(state => state.composer.isEmpty)

  // Keep the row's height while typing so the composer does not move under the cursor.
  return <div role='group' aria-label={t('standardProject.intro.suggestions.label')} inert={!isComposerEmpty}
    className={cn(
      'animate-in fade-in mx-auto flex max-w-[34rem] flex-wrap items-center justify-center gap-2 transition-opacity duration-200 motion-reduce:animate-none',
      !isComposerEmpty && 'opacity-0',
    )}>
    {projects.map(project => <ThreadPrimitive.Suggestion key={project} send
      prompt={t(`standardProject.intro.suggestions.${project}.prompt`)}
      className='border-foreground/10 bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground rounded-control h-8 border px-3 text-[13px] transition-colors'>
      {t(`standardProject.intro.suggestions.${project}.label`)}
    </ThreadPrimitive.Suggestion>)}
  </div>
}
