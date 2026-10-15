// Resolves dashboard labels consistently with or without a surrounding translation provider.
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '@/shared/i18n'

export function useDashboardLabels() {
  const { i18n } = useTranslation()
  const active = i18n.exists?.('dashboardShell.completed') ? i18n : appI18n
  const locale = (active.resolvedLanguage || active.language || 'zh-CN').startsWith('en') ? 'en' : 'zh-CN'
  return { locale, t: (key: string, options?: Record<string, unknown>) => String(active.t(`dashboardShell.${key}`, options)) }
}
