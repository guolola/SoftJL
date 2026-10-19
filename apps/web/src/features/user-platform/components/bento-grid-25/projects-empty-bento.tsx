// Feeds the bento-grid-25 layout with the empty-workspace product overview.
import { useTranslation } from 'react-i18next'

import BentoGrid from './bento-grid-25'
import type { StatBadge, ArtifactPreview, JourneyStep } from './bento-grid-25'

const statKeys = ['modes', 'traceability', 'documents', 'codingAgent'] as const

const previewItems = [
  { key: 'feasibility', image: '/marketing/empty-projects/preview-feasibility.svg' },
  { key: 'design', image: '/marketing/empty-projects/preview-design.svg' },
  { key: 'traceability', image: '/marketing/empty-projects/preview-traceability.svg' },
  { key: 'testing', image: '/marketing/empty-projects/preview-testing.svg' },
  { key: 'documents', image: '/marketing/empty-projects/preview-documents.svg' },
  { key: 'codingAgent', image: '/marketing/empty-projects/preview-coding-agent.svg' }
] as const

const journeyKeys = ['create', 'describe', 'deliver'] as const

const ProjectsEmptyBento = () => {
  const { t } = useTranslation()

  const stats: StatBadge[] = statKeys.map((key, index) => ({
    id: index + 1,
    label: t(`projects.emptyBento.stats.${key}`)
  }))

  const previews: ArtifactPreview[] = previewItems.map(({ key, image }, index) => ({
    id: index + 1,
    title: t(`projects.emptyBento.previews.items.${key}`),
    image
  }))

  const journeySteps: JourneyStep[] = journeyKeys.map((key, index) => ({
    id: index + 1,
    title: t(`projects.emptyBento.journey.steps.${key}.title`),
    description: t(`projects.emptyBento.journey.steps.${key}.description`)
  }))

  return <BentoGrid stats={stats} previews={previews} journeySteps={journeySteps} />
}

export default ProjectsEmptyBento
