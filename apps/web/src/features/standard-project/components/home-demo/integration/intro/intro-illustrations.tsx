// Theme-aware vector examples replace unrelated template screenshots without external image requests.
import { useTranslation } from 'react-i18next'
import { standardDiagramKinds, type StandardDiagramKind } from '@uml-platform/contracts'

function ModelGlyph({ kind }: { kind: StandardDiagramKind }) {
  const box = (x: number, y: number, width = 24, height = 12) => <rect x={x} y={y} width={width} height={height} rx='2' />
  switch (kind) {
    case 'function': return <>{box(40, 0)}<path d='M52 12v10H12v6m40-6v6m0-6h40v6' />{box(0, 28)}{box(40, 28)}{box(80, 28)}</>
    case 'usecase': return <><circle cx='10' cy='9' r='5' /><path d='M10 14v15m-8-9h16M10 29l-7 9m7-9 7 9m1-18 34-11m-34 11 34 11' /><ellipse cx='76' cy='9' rx='24' ry='8' /><ellipse cx='76' cy='31' rx='24' ry='8' /></>
    case 'activity': return <>{box(0, 14)}<path d='M24 20h15m0 0 12-12 12 12-12 12-12-12m24 0h17' />{box(80, 14)}</>
    case 'architecture': return <>{box(38, 0, 30)}<path d='M53 12v12H17v4m36-4h34v4' />{box(0, 28, 34)}{box(70, 28, 34)}</>
    case 'er': return <>{box(0, 12, 28, 18)}<path d='M28 21h12l12-10 12 10-12 10-12-10m24 0h12' />{box(76, 12, 28, 18)}</>
    case 'class': return <>{box(20, 0, 64, 40)}<path d='M20 12h64M20 26h64M29 19h29m-29 14h42' /></>
    case 'sequence': return <>{box(0, 0)}{box(40, 0)}{box(80, 0)}<path d='M12 14v26m40-26v26m40-26v26' strokeDasharray='3 3' /><path d='M12 20h40l-5-3m5 3-5 3m5 9h40l-5-3m5 3-5 3' /></>
    case 'table': return <>{box(0, 0, 36, 40)}{box(68, 0, 36, 40)}<path d='M0 11h36M0 21h36M0 31h36m32-20h36m-36 10h36m-36 10h36M36 20h32' /></>
  }
}

export function ModelCatalogIllustration() {
  const { t } = useTranslation()
  return <svg viewBox='0 0 280 336' role='img' aria-label={t('standardProject.intro.models.catalog')}
    className='h-auto max-h-84 w-full' style={{ background: 'var(--background)', fontFamily: 'inherit' }}>
    {standardDiagramKinds.map((kind, index) => <g key={kind} transform={`translate(${8 + index % 2 * 136}, ${8 + Math.floor(index / 2) * 82})`}>
      <rect width='128' height='74' rx='8' fill='var(--card)' stroke='var(--border)' />
      <g transform='translate(12 7)' fill='var(--card)' stroke='var(--muted-foreground)' strokeWidth='1.2' strokeLinejoin='round'>
        <ModelGlyph kind={kind} />
      </g>
      <text x='64' y='63' textAnchor='middle' fill='var(--foreground)' fontSize='10'
        textLength={t(`standardProject.diagramKinds.${kind}`).length > 22 ? 116 : undefined} lengthAdjust='spacingAndGlyphs'>
        {t(`standardProject.diagramKinds.${kind}`)}
      </text>
    </g>)}
  </svg>
}

export function UseCaseIllustration() {
  const { t } = useTranslation()
  return <svg viewBox='0 0 280 190' role='img' aria-label={t('standardProject.intro.models.usecase')}
    className='h-auto max-h-84 w-full' style={{ background: 'var(--background)', fontFamily: 'inherit' }}>
    <rect x='84' y='12' width='184' height='166' rx='8' fill='var(--card)' stroke='var(--border)' />
    <text x='176' y='37' textAnchor='middle' fill='var(--foreground)' fontSize='12'>{t('standardProject.intro.models.system')}</text>
    <g fill='none' stroke='var(--muted-foreground)' strokeWidth='1.4'>
      <circle cx='36' cy='72' r='9' /><path d='M36 81v36m-17-23h34m-17 23-16 24m16-24 16 24M53 94l59-19m-59 19 59 37' />
      <ellipse cx='180' cy='75' rx='67' ry='22' fill='var(--background)' />
      <ellipse cx='180' cy='131' rx='67' ry='22' fill='var(--background)' />
    </g>
    <g textAnchor='middle' fill='var(--foreground)' fontSize='12'>
      <text x='36' y='163'>{t('standardProject.intro.models.student')}</text>
      <text x='180' y='79'>{t('standardProject.intro.models.borrow')}</text>
      <text x='180' y='135'>{t('standardProject.intro.models.renew')}</text>
    </g>
  </svg>
}

export function RevisionIllustration({ after = false }: { after?: boolean }) {
  const { t } = useTranslation()
  return <svg viewBox='0 0 160 220' role='img' aria-label={t(`standardProject.intro.revision.${after ? 'after' : 'before'}`)}
    className='h-auto w-full' style={{ background: 'var(--background)', fontFamily: 'inherit' }}>
    <g fill='none' stroke='var(--muted-foreground)' strokeWidth='1.2'>
      <circle cx='80' cy='20' r='5' fill='var(--foreground)' />
      <path d='M80 25v20m-4-5 4 5 4-5' />
      <rect x='18' y='45' width='124' height='30' rx='7' fill='var(--card)' />
      {after ? <><path d='M80 75v22m-4-5 4 5 4-5' /><rect x='18' y='97' width='124' height='30' rx='7' fill='var(--muted)' /><path d='M80 127v22m-4-5 4 5 4-5' /></>
        : <path d='M80 75v74m-4-5 4 5 4-5' />}
      <rect x='18' y='149' width='124' height='30' rx='7' fill='var(--card)' />
      <path d='M80 179v17' /><circle cx='80' cy='203' r='7' /><circle cx='80' cy='203' r='3.5' fill='var(--foreground)' />
    </g>
    <g textAnchor='middle' fill='var(--foreground)' fontSize='11'>
      <text x='80' y='64'>{t('standardProject.intro.revision.request')}</text>
      {after && <text x='80' y='116'>{t('standardProject.intro.revision.approval')}</text>}
      <text x='80' y='168'>{t('standardProject.intro.revision.done')}</text>
    </g>
  </svg>
}
