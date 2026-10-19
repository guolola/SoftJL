// Adapts the supplied bento-grid-23 content to supported Agent outputs; grid and animation geometry stay intact.
import { useTranslation } from 'react-i18next'
import { standardDiagramKinds } from '@uml-platform/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileTextIcon, NotebookPenIcon, FileDownIcon, ImagesIcon, LayoutListIcon, PlusIcon, ShapesIcon } from 'lucide-react'
import { Orbiting } from './ui/orbiting'
import RequirementMap from './mcp-server'
import ModelRevision from './figma-to-code'
import ChatAnimation from './chat-animation'
import TestFlow from './copy-prompt'

const documentItems = [
  { key: 'requirements', Icon: FileTextIcon }, { key: 'design', Icon: NotebookPenIcon },
  { key: 'export', Icon: FileDownIcon }, { key: 'diagrams', Icon: ImagesIcon }, { key: 'edit', Icon: LayoutListIcon },
]

const BentoGrid = () => {
  const { t, i18n } = useTranslation()
  const models = standardDiagramKinds.map(kind => t(`standardProject.diagramKinds.${kind}`))
    .join(i18n.resolvedLanguage?.startsWith('zh') ? '、' : ', ')

  return (
    <section>
      <div className='mx-auto max-w-7xl'>
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3'>
          <div className='flex flex-col gap-6 md:max-md:flex-row'>
            <Card className='shadow-none ring-0' data-intro-feature='requirements'>
              <CardHeader className='gap-2'>
                <CardTitle className='text-xl font-semibold'>{t('standardProject.intro.cards.requirements.title')}</CardTitle>
                <CardDescription className='text-base'>{t('standardProject.intro.cards.requirements.description')}</CardDescription>
              </CardHeader>
              <CardContent><RequirementMap /></CardContent>
            </Card>

            <Card className='flex-1 shadow-none ring-0' data-intro-feature='conversation'>
              <CardHeader className='gap-2'>
                <CardTitle className='text-xl font-semibold'>{t('standardProject.intro.cards.conversation.title')}</CardTitle>
                <CardDescription className='text-base'>{t('standardProject.intro.cards.conversation.description')}</CardDescription>
              </CardHeader>
              <div className='flex flex-1 items-center justify-center'><ModelRevision /></div>
            </Card>
          </div>

          <Card className='shadow-none ring-0' data-intro-feature='models'>
            <CardHeader className='gap-2'>
              <CardTitle className='text-xl font-semibold'>{t('standardProject.intro.cards.models.title')}</CardTitle>
              <CardDescription className='text-base'>{t('standardProject.intro.cards.models.description', { models })}</CardDescription>
            </CardHeader>
            <CardContent className='px-3'>
              <div className='divide-y overflow-hidden rounded-xl border'>
                <div className='px-4 py-3 text-center text-base font-semibold'>{t('standardProject.intro.demo.title')}</div>
                <div className='flex items-center justify-between gap-6 px-4 py-3 text-base'>
                  <div className='font-semibold'>{t('standardProject.intro.demo.label')}</div>
                  <div className='text-muted-foreground flex items-center gap-1.5'>{t('standardProject.intro.demo.scope')}</div>
                </div>
                <div className='h-122 px-2 py-3'><ChatAnimation /></div>
                <div className='text-muted-foreground px-4 py-3 text-sm'>{t('standardProject.intro.demo.placeholder')}</div>
                <div className='text-muted-foreground flex items-center justify-between p-2 text-sm' aria-hidden='true'>
                  <Button variant='ghost' size='xs' className='cursor-pointer' tabIndex={-1}>
                    <PlusIcon className='size-3' />{t('standardProject.intro.demo.requirement')}
                  </Button>
                  <Button variant='ghost' size='xs' className='cursor-pointer' tabIndex={-1}>
                    <span>{t('standardProject.intro.demo.model')}</span>
                  </Button>
                  <span className='text-xs'>{t('standardProject.intro.demo.count')}</span>
                  <Button variant='destructive' size='xs' className='cursor-pointer' tabIndex={-1}>
                    <ShapesIcon /><span className='max-xl:hidden'>{t('standardProject.intro.demo.example')}</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className='grid grid-cols-1 gap-6 md:max-xl:col-span-2 md:max-xl:grid-cols-2'>
            <Card className='shadow-none ring-0' data-intro-feature='tests'>
              <CardHeader className='gap-2'>
                <CardTitle className='text-xl font-semibold'>{t('standardProject.intro.cards.tests.title')}</CardTitle>
                <CardDescription className='text-base'>{t('standardProject.intro.cards.tests.description')}</CardDescription>
              </CardHeader>
              <CardContent><TestFlow /></CardContent>
            </Card>

            <Card className='relative overflow-hidden shadow-none ring-0' data-intro-feature='documents'>
              <CardHeader className='flex flex-1 flex-col gap-2'>
                <CardTitle className='text-xl font-semibold'>{t('standardProject.intro.cards.documents.title')}</CardTitle>
                <CardDescription className='text-base'>{t('standardProject.intro.cards.documents.description')}</CardDescription>
              </CardHeader>
              <CardContent className='overflow-hidden pt-5'>
                <div className='flex h-34 items-start justify-center'>
                  <div className='relative flex size-80 shrink-0 flex-col items-center justify-center'>
                    <Orbiting radius={156} duration={30} dashed={true} dashedGap={10}>
                      {[...documentItems, ...documentItems].map(({ key, Icon }, index) => (
                        <div key={`${key}:${index}`} role='img' aria-label={t(`standardProject.intro.documents.${key}`)}
                          className='flex size-10.5 items-center justify-center rounded-full border bg-white dark:bg-neutral-700'>
                          <span className='flex flex-col items-center'>
                            <Icon className='size-5' aria-hidden='true' />
                            <span className='text-[9px]' aria-hidden='true'>{t(`standardProject.intro.documents.${key}Short`)}</span>
                          </span>
                        </div>
                      ))}
                    </Orbiting>
                  </div>
                </div>
              </CardContent>
              <div className='from-background absolute bottom-0 z-1 h-15 w-full bg-linear-to-t to-transparent' />
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}

export default BentoGrid
