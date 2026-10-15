// Imports the supplied demo AppIntegration block; content and guide actions are supplied by the MCP catalog.
'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'

import { MotionPreset } from './motion-preset'
import { ChevronRightIcon } from 'lucide-react'

type Integration = {
  id: string
  name: string
  description: ReactNode
  icon: ReactNode
  action: ReactNode
}[]

type AppIntegrationProps = {
  integrations: Integration
  title: string
  description: string
  titleId: string
  header?: ReactNode
  more?: { title: string; description: string; href: string }
}

const AppIntegration = ({ integrations, title, description, titleId, header, more }: AppIntegrationProps) => {
  const sectionRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    // Keep the demo's moving blobs inside this catalog, without affecting other project cards.
    if (reduceMotion) return
    const all = sectionRef.current?.querySelectorAll('.card')
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')

    const handleMouseMove = (ev: MouseEvent) => {
      if (!finePointer.matches) return
      all?.forEach(e => {
        const blob = e.querySelector('.blob') as HTMLElement
        const fblob = e.querySelector('.fake-blob') as HTMLElement

        if (!blob || !fblob) return

        const rec = fblob.getBoundingClientRect()

        blob.style.opacity = '0.8'

        blob.animate(
          [
            {
              transform: `translate(${
                ev.clientX - rec.left - 24 - rec.width / 2
              }px, ${ev.clientY - rec.top - 24 - rec.height / 2}px)`
            }
          ],
          {
            duration: 300,
            fill: 'forwards'
          }
        )
      })
    }

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [reduceMotion, integrations])

  return (
    <section ref={sectionRef} aria-labelledby={titleId} className='@container/mcp-catalog min-w-0 py-8 sm:py-16 lg:py-24'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        {/* Header Section */}
        <div className='mb-12 space-y-4 text-center sm:mb-16 lg:mb-24'>
          {header ?? <>
            <h2 id={titleId} className='text-2xl font-semibold md:text-3xl lg:text-4xl'>{title}</h2>
            <p className='text-muted-foreground text-xl'>{description}</p>
          </>}
        </div>

        {/* Render every integration immediately; scrolling must not gate its visibility. */}
        <div className='grid min-w-0 grid-cols-1 gap-6 @[36rem]/mcp-catalog:grid-cols-2 @[56rem]/mcp-catalog:grid-cols-3'>
          {integrations.map((integration) => (
            <MotionPreset
              key={integration.id}
              component='article'
              inView={false}
              motionProps={{ initial: false, 'aria-labelledby': 'integration-' + integration.id }}
              className='card group bg-foreground/10 relative isolate h-full min-w-0 overflow-hidden rounded-xl p-px transition-all duration-300 ease-in-out motion-reduce:transition-none'
            >
              <Card className='group-hover:bg-card/90 h-full ring-0 shadow-none'>
                <CardHeader>
                  <div className='flex size-14.5 shrink-0 items-center justify-center rounded-full border'>
                    {integration.icon}
                  </div>
                </CardHeader>
                <CardContent className='text-2xl font-medium'><h3 id={'integration-' + integration.id} className='min-h-14 break-words'>{integration.name}</h3></CardContent>
                <CardContent className='text-muted-foreground flex-1 text-base xl:text-lg'>
                  {integration.description}
                </CardContent>
                <CardContent>{integration.action}</CardContent>
              </Card>
              <div aria-hidden='true' className='blob pointer-events-none bg-primary absolute top-0 left-0 -z-1 size-62.5 rounded-full opacity-0 blur-2xl transition-all duration-300 ease-in-out' />
              <div aria-hidden='true' className='fake-blob pointer-events-none invisible absolute top-0 left-0 -z-1 size-40 rounded-full' />
            </MotionPreset>
          ))}

          {/* More Card */}
          {more && <MotionPreset inView={false} motionProps={{ initial: false }}>
            <Card className='group hover:bg-primary hover:text-primary-foreground h-full shadow-none ring-0 transition-all duration-300'>
              <CardContent className='flex h-full flex-col justify-between gap-6'>
                <CardTitle className='text-2xl font-medium'>{more.title}</CardTitle>
                <div className='flex items-center justify-between gap-4'>
                  <p className='text-base xl:text-lg'>{more.description}</p>
                  <Button
                    className='bg-primary/10 text-primary group-hover:bg-primary-foreground group-hover:text-primary hover:bg-primary-foreground! hover:text-primary! transition-all duration-300'
                    size='icon'
                    aria-label={more.title}
                    render={<a href={more.href} />}
                    nativeButton={false}
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </MotionPreset>}
        </div>
      </div>
    </section>
  )
}

export default AppIntegration
