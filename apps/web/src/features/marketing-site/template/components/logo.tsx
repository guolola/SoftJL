// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';
import FlowLogo from '@/features/marketing-site/template/assets/svg/flow-logo'

import { cn } from '@/shared/ui/utils'

const Logo = ({ className }: { className?: string }) => {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <FlowLogo className='size-9 shrink-0 object-contain' />
      <span className='text-xl font-semibold'><FlowCopy text="Flow" /></span>
    </div>
  )
}

export default Logo
