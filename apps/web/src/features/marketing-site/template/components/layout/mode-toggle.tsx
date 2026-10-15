// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import { MoonStarIcon, SunIcon } from 'lucide-react'

import { SecondaryFlowButton } from '@/features/marketing-site/template/components/ui/flow-button'
import { useTheme } from '@/shared/ui/theme-provider'

const ModeToggle = () => {
  const { toggle } = useTheme()

  return (
    <SecondaryFlowButton
      className='relative **:data-[slot=button]:size-10 **:data-[slot=button]:px-0'
      onClick={toggle}
    >
      <MoonStarIcon className='scale-100 dark:scale-0' />
      <SunIcon className='absolute scale-0 dark:scale-100' />
      <span className='sr-only'><FlowCopy text="Toggle theme" /></span>
    </SecondaryFlowButton>
  )
}

export { ModeToggle }
