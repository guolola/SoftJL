// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';
import { ProductLogo } from '@/shared/ui/product-logo'
import type { TestimonialItem } from '@/features/marketing-site/template/components/blocks/testimonials/testimonial-card'

const productLogo = <ProductLogo className='size-full' />

export const testimonials: TestimonialItem[] = [
  {
    name: 'Emily Watson',
    username: '功能说明 / Workflow',
    avatar: productLogo,
    rating: 4.5,
    content: (
      <>
        <FlowCopy text="Finally, a dashboard that shows" />{' '}
        <span className='bg-primary/5 text-primary'><FlowCopy text="everything that matters-users, orders, and revenue" /></span> <FlowCopy text="all in one clean view. It helps us make informed decisions much faster." /></>
    )
  },
  {
    name: 'Alex Rivera',
    username: '功能说明 / Workflow',
    avatar: productLogo,
    rating: 5,
    content: (
      <>
        <FlowCopy text="The interface is incredibly intuitive and the tools are very practical. We&apos;ve" />{' '}
        <span className='bg-primary/5 text-primary'><FlowCopy text="cut our deal cycle time almost in half" /></span> <FlowCopy text="since making the switch. Adoption across the team was effortless." /></>
    )
  },
  {
    name: 'Marcus Johnson',
    username: '功能说明 / Workflow',
    avatar: productLogo,
    rating: 4.5,
    content: (
      <>
        <FlowCopy text="The seamless integrations streamlined my daily workflow significantly. I can manage emails, track clients, and schedule follow-ups" /><span className='bg-primary/5 text-primary'><FlowCopy text="without ever leaving the platform" /></span>.
      </>
    )
  },
  {
    name: 'Sarah Chen',
    username: '功能说明 / Workflow',
    avatar: productLogo,
    rating: 5,
    content: (
      <>
        <FlowCopy text="From onboarding to daily usage, everything feels well thought out. The components are" />{' '}
        <span className='bg-primary/5 text-primary'><FlowCopy text="polished, consistent, and production-ready" /></span><FlowCopy text=". Shipping new features is noticeably faster." /></>
    )
  },
  {
    name: 'Ncdai',
    username: '功能说明 / Workflow',
    avatar: productLogo,
    rating: 4,
    content: (
      <>
        <FlowCopy text="Clean design and sensible defaults make a huge difference. The" />{' '}
        <span className='bg-primary/5 text-primary'><FlowCopy text="documentation is clear and easy to follow" /></span><FlowCopy text=", which saved me hours during setup." /></>
    )
  },
  {
    name: 'Lisa Thompson',
    username: '功能说明 / Workflow',
    avatar: productLogo,
    rating: 5,
    content: (
      <>
        <FlowCopy text="I&apos;ve used many UI kits, but this one strikes the perfect balance. The" />{' '}
        <span className='bg-primary/5 text-primary'><FlowCopy text="customization options are incredibly flexible" /></span> <FlowCopy text="without sacrificing design quality." /></>
    )
  }
]
