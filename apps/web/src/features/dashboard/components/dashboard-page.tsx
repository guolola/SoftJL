// Uses the supplied dashboard-shell-06 content inside the existing authenticated navigation shell.
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { PageContainer } from '@/shared/template/layout/page'
import { DashboardShellContent, DashboardShellSkeleton } from '@/shared/template/blocks/dashboard-shell-06/dashboard-shell-content'
import { useDashboardLabels } from '@/shared/template/blocks/dashboard-shell-06/dashboard-shell-labels'
import { useDashboardSummary } from '../hooks/use-dashboard-summary'
import { buildDashboardViewModel } from '../lib/dashboard-view-model'
import { useDashboardDuration } from '../hooks/use-dashboard-duration'
import { useAuthenticatedRouteSession } from '@/features/user-platform/components/authenticated-route-session'
import { DashboardWelcome } from './dashboard-welcome'
import { buildDashboardWelcomeExample } from '../lib/dashboard-welcome-example'

export function DashboardPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t, locale } = useDashboardLabels()
  const { data, loading, error, reload } = useDashboardSummary()
  const duration = useDashboardDuration(data, t)
  const example = useMemo(() => data ? buildDashboardWelcomeExample(data) : null, [data])
  const exampleDuration = useDashboardDuration(example, t)
  const session = useAuthenticatedRouteSession()
  // Match the other platform pages' centered content rail and the header's inner width.
  return <main data-testid='dashboard-shell' className='relative min-h-0 min-w-0 w-full overflow-x-clip bg-background' aria-busy={loading}>
    {loading ? <PageContainer><DashboardShellSkeleton /></PageContainer> : error ? <PageContainer><Alert variant='destructive'>
      <AlertTitle>{t('error')}</AlertTitle><AlertDescription>{error}</AlertDescription>
      <AlertAction><Button variant='outline' onClick={reload}>{t('retry')}</Button></AlertAction>
    </Alert></PageContainer> : data ? <DashboardWelcome key={session?.user.id ?? 'dashboard'} userId={session?.user.id}>{(renderCard, welcomeActive) => <>
      {data.totals.projects === 0 && <Alert className='mb-6' data-dashboard-empty>
        <AlertDescription>{t('empty')}</AlertDescription>
        <AlertAction><Button onClick={() => onNavigate('/projects/new')}><Plus className='size-4' />{t('create')}</Button></AlertAction>
      </Alert>}
      {/* Examples fill the same real widgets only while welcome is active; completion exposes the actual account. */}
      <DashboardShellContent data={buildDashboardViewModel(welcomeActive && example ? example : data, t, locale)}
        duration={welcomeActive && example ? exampleDuration : duration} onRefresh={() => { if (!welcomeActive) reload() }}
        onProject={id => { if (!welcomeActive) onNavigate(id ? `/projects/${encodeURIComponent(id)}` : '/projects') }}
        onHistory={id => { if (!welcomeActive) onNavigate(`/projects/${encodeURIComponent(id)}/history`) }} labels={{ recent: t('recent') }} renderCard={renderCard} />
    </>}</DashboardWelcome> : null}
  </main>
}
