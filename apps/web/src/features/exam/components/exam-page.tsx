// Composes the supplied waitlist-05 block for the authenticated examination route.
import Waitlist from '@/shared/template/blocks/waitlist-05/waitlist-05'
import { useTranslation } from 'react-i18next'

export function ExamPage() {
  const { t } = useTranslation()
  // Translate content at the feature boundary without remounting the block's countdown.
  const labels = {
    titleFirst: t('examPage.titleFirst'), titleSecond: t('examPage.titleSecond'),
    description: t('examPage.description'), days: t('examPage.days'), hours: t('examPage.hours'),
    minutes: t('examPage.minutes'), seconds: t('examPage.seconds'),
  }
  return <main className='min-w-0 w-full bg-background' aria-label={t('nav.exam')}>
    <Waitlist labels={labels} />
  </main>
}
