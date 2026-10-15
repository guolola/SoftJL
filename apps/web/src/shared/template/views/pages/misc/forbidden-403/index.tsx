// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
import { useTranslation } from 'react-i18next';
// Next Import
import Link from '@/shared/lib/template-link'

// Component Imports
import { DotGrid } from '@/shared/ui/bg-dot-grid'
import { Button } from '@/shared/ui/button'
import { MorphingText } from '@/shared/ui/morphing-text'

const Forbidden403 = () => {
  const { i18n } = useTranslation();
  const en = i18n.resolvedLanguage === 'en';
  return (
    <div className='grid min-h-screen grid-cols-1 lg:grid-cols-2'>
      <div className='flex flex-col items-center justify-center px-4 py-8 text-center'>
        <h2 className='mb-6 text-5xl font-semibold'>{en ? '403 — Access denied' : '403 — 无权访问'}</h2>
        <h3 className='mb-1.5 text-3xl font-semibold'>{en ? 'You do not have access to this project' : '当前账户没有此项目的访问权限'}</h3>
        <p className='text-muted-foreground mb-6 max-w-sm'>{en ? 'Contact the project owner to check your membership.' : '请联系项目所有者确认成员权限。'}</p>
        <Button render={<Link href='/' />} nativeButton={false} size='lg'>
          {en ? 'Back to home' : '返回官网'}
        </Button>
      </div>

      {/* Right Section: Illustration */}
      <div className='relative max-h-screen w-full p-2 max-lg:hidden'>
        <div className='relative h-full w-full overflow-hidden rounded-2xl bg-black'>
          <DotGrid
            dotSize={1.9}
            gap={22}
            baseColor='var(--muted-foreground)'
            activeColor='#10B981'
            radius={160}
            displacement={14}
            maxScale={4}
          />

          <div className='absolute inset-0 z-10 flex items-center justify-center'>
            <MorphingText
              className='text-7xl font-bold text-white xl:text-9xl'
              texts={['403', 'Forbidden', 'Private Page']}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Forbidden403
