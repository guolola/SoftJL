// Summarizes the professional workflow and its independent feasibility/testing branches.
'use client'

import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FileInput, ListChecks, ScanSearch, Shapes, Blocks, ClipboardCheck, FileText } from 'lucide-react'
import { BeamConnection, ConnectionBeam } from './beam-connection'

const STAGES = [
  { id: 'input', Icon: FileInput, left: 112, top: 0, color: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  { id: 'rules', Icon: ListChecks, left: 112, top: 60, color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { id: 'feasibility', Icon: ScanSearch, left: 0, top: 120, color: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
  { id: 'requirements', Icon: Shapes, left: 112, top: 120, color: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  { id: 'design', Icon: Blocks, left: 112, top: 180, color: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  { id: 'tests', Icon: ClipboardCheck, left: 224, top: 180, color: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  { id: 'documents', Icon: FileText, left: 112, top: 240, color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
] as const

type StageId = typeof STAGES[number]['id']
// Tests use rules and use cases without requiring design; each document uses its own source artifacts.
const CONNECTIONS: [StageId, StageId][] = [
  ['input', 'rules'], ['rules', 'feasibility'], ['rules', 'requirements'],
  ['requirements', 'design'], ['requirements', 'tests'],
  ['feasibility', 'documents'], ['requirements', 'documents'], ['design', 'documents'],
]

// Route the requirements-to-document edge beside design so it remains visibly independent.
const documentPath = (start: { x: number; y: number }, end: { x: number; y: number }) =>
  `M ${start.x} ${start.y} H 216 V ${end.y} H ${end.x}`
const feasibilityDocumentPath = (start: { x: number; y: number }, end: { x: number; y: number }) =>
  `M ${start.x} ${start.y} V ${end.y} H ${end.x}`

const BeamIllustrations31 = () => {
  const { t } = useTranslation()
  const refs = {
    input: useRef<HTMLDivElement>(null), rules: useRef<HTMLDivElement>(null),
    feasibility: useRef<HTMLDivElement>(null), requirements: useRef<HTMLDivElement>(null),
    design: useRef<HTMLDivElement>(null), tests: useRef<HTMLDivElement>(null),
    documents: useRef<HTMLDivElement>(null),
  }

  return (
    <BeamConnection className='h-84 w-80'>
      {({ containerRef, active }) => (
        <>
          {STAGES.map(({ id, Icon, left, top, color }) => (
            <div key={id} ref={refs[id]} data-workflow-stage={id} style={{ left, top }} className='bg-background absolute flex h-12 w-24 flex-col justify-center gap-1 rounded-xl border p-2 shadow-xs'>
              <div className='flex items-center gap-1'>
                <span className={`flex size-4 shrink-0 items-center justify-center rounded ${color}`}><Icon className='size-2.5' /></span>
                <span className='whitespace-nowrap text-[10px] font-semibold'>{t(`projects.createForm.illustration.beam.${id}`)}</span>
              </div>
              <span className='text-muted-foreground whitespace-nowrap text-[8px] leading-tight'>{t(`projects.createForm.illustration.beam.${id}Detail`)}</span>
            </div>
          ))}
          {CONNECTIONS.map(([from, to]) => (
            <div key={`${from}:${to}`} className='contents' data-workflow-connection={`${from}:${to}`}>
              <ConnectionBeam
                containerRef={containerRef} fromRef={refs[from]} toRef={refs[to]}
                className='text-primary -z-1' beamType='dash' beamColor={to === 'documents' ? '#c084fc' : '#89d2b7'}
                beamSize={8} active={active} speed={100}
                pathBuilder={to === 'documents' ? from === 'requirements' ? documentPath : from === 'feasibility' ? feasibilityDocumentPath : undefined : undefined}
              />
            </div>
          ))}
          <div className='text-muted-foreground absolute inset-x-0 top-76 space-y-1 text-center text-[9px] leading-3'>
            <p>{t('projects.createForm.illustration.beam.documentSources')}</p>
            <p>{t('projects.createForm.illustration.beam.changeImpact')}</p>
          </div>
        </>
      )}
    </BeamConnection>
  )
}

export default BeamIllustrations31
