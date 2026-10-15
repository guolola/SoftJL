// Original Flow homepage frame and navigation; links point to product routes.
import type { ReactNode } from 'react'
import { PRODUCT_TUTORIAL_URL } from '@/shared/lib/product-links'
import { TooltipProvider } from './components/ui/tooltip';

import {
  LayoutDashboardIcon,
  TelescopeIcon,
  ChartScatterIcon,
  ChartPieIcon,
  GitPullRequestIcon,
  UsersIcon
} from 'lucide-react'

import Header from '@/features/marketing-site/template/components/layout/header'
import Footer from '@/features/marketing-site/template/components/layout/footer'
import type { Navigation } from '@/features/marketing-site/template/components/layout/header-navigation'

const navigationData: Navigation[] = [
  {
    title: 'Features',
    contentClassName: '!w-141 grid-cols-2',
    splitItems: true,
    items: [
      {
        type: 'section',
        title: 'Analytics & Insights',
        items: [
          {
            title: 'Unified Dashboard',
            href: '/#features',
            description: 'Get every key business metric in one place.',
            icon: <LayoutDashboardIcon className='size-4' />
          },
          {
            title: 'Competitor Tracking',
            href: '/#features',
            description: 'Benchmark performance and market trends.',
            icon: <TelescopeIcon className='size-4' />
          },
          {
            title: 'Sales Analytics',
            href: '/#features',
            description: 'Track revenue growth, conversions & profitability.',
            icon: <ChartScatterIcon className='size-4' />
          }
        ]
      },
      {
        type: 'section',
        title: 'Productivity & Optimization',
        items: [
          {
            title: 'Report & Export',
            href: '/#features',
            description: 'Share insights quickly with automated reporting.',
            icon: <ChartPieIcon className='size-4' />
          },
          {
            title: 'Workflow Scheduling',
            href: '/#features',
            description: 'Plan content & operational tasks seamlessly.',
            icon: <GitPullRequestIcon className='size-4' />
          },
          {
            title: 'User Management',
            href: '/#features',
            description: 'Manage roles and access with complete control.',
            icon: <UsersIcon className='size-4' />
          }
        ]
      }
    ]
  },
  {
    title: 'Benefits',
    href: '/#benefits'
  },
  {
    title: 'Testimonials',
    href: '/#testimonials'
  },
  {
    title: 'Guide',
    href: PRODUCT_TUTORIAL_URL
  }
]

export const FlowLayout = ({ children }: Readonly<{ children: ReactNode }>) => {
  return (
    <TooltipProvider><div data-template="flow" data-testid="flow-homepage" className='flex flex-col bg-[repeating-linear-gradient(45deg,color-mix(in_oklab,var(--border)40%,transparent)0,color-mix(in_oklab,var(--border)40%,transparent)1px,transparent_0,transparent_50%)] bg-size-[12px_12px] bg-fixed'>
      <div className='mx-auto h-full w-full max-w-336 px-4 sm:px-6 lg:px-8'>
        <div className='bg-background h-full w-full max-w-7xl border-x'>
          {/* Header Section */}
          <Header navigationData={navigationData} />

          {/* Main Content */}
          <main className='flex flex-1 flex-col *:scroll-mt-16'>{children}</main>

          {/* Footer Section */}
          <Footer />
        </div>
      </div>
    </div></TooltipProvider>
  )
}

export default FlowLayout
