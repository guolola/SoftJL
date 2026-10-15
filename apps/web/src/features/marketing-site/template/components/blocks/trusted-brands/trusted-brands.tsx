// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';
import type { BrandLogo } from '@/features/marketing-site/template/content/trusted-brands'
import { Card, CardContent } from '@/features/marketing-site/template/components/ui/card'

import { Marquee } from '@/features/marketing-site/template/components/ui/marquee'

const TrustedBrands = ({ brandLogos }: { brandLogos: BrandLogo[] }) => {
  return (
    <section id='trusted-brands' className='py-4 sm:py-6 lg:py-8'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        {/* Header */}
        <div className='mb-4 space-y-4 text-center sm:mb-6 lg:mb-8'>
          <p className='text-muted-foreground text-xl'><FlowCopy text="Software engineering tools and platforms" /></p>
        </div>

        <div className='relative'>
          <div className='from-background pointer-events-none absolute inset-y-0 left-0 z-1 w-35 bg-linear-to-r to-transparent' />
          <div className='from-background pointer-events-none absolute inset-y-0 right-0 z-1 w-35 bg-linear-to-l to-transparent' />
          <div className='w-full overflow-hidden'>
            <Marquee pauseOnHover duration={20} gap={1.5}>
              {brandLogos.map((logo, index) => (
                <Card key={index} className='bg-transparent py-9 shadow-none ring-0'>
                  <CardContent className='flex flex-col items-center px-9'>
                    <img
                      src={logo.image}
                      alt={flowText(logo.name)}
                      className='h-8 w-28 object-contain opacity-70 grayscale transition-opacity duration-300 hover:opacity-100 dark:invert motion-reduce:transition-none'
                    />
                  </CardContent>
                </Card>
              ))}
            </Marquee>
          </div>
        </div>
      </div>
    </section>
  )
}

export default TrustedBrands
