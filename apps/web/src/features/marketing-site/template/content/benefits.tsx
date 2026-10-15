// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
import { ChartPieIcon, BotMessageSquareIcon, LayersIcon, ChartSplineIcon } from 'lucide-react'

import { type Features } from '@/features/marketing-site/template/components/blocks/benefits/benefits'
import { BenefitStudioPreview } from '@/features/marketing-site/template/components/blocks/benefits/benefit-studio-preview'

export const benefits: Features = [
  {
    icon: <ChartPieIcon />,
    title: 'Unified Sales Overview',
    description:
      'Monitor leads, purchases, and orders in real-time to stay updated on every key business metric. This ensures you have the latest insights to make informed decisions.',
    visual: <BenefitStudioPreview kind='overview' label='需求共同上下文组件预览' />
  },
  {
    icon: <BotMessageSquareIcon />,
    title: 'Automated Follow-Ups',
    description:
      'Let smart reminders handle repetitive tasks, allowing you to concentrate on closing more deals rather than managing them. This way, you can maximise your productivity and achieve better results.',
    visual: <BenefitStudioPreview kind='models' label='模型到设计关联组件预览' />
  },
  {
    icon: <LayersIcon />,
    title: 'Clean & Simple Workflow',
    description:
      'Move deals effortlessly through stages with our intuitive pipeline system designed for clarity and control. This system ensures that you always have a clear view of your progress.',
    visual: <BenefitStudioPreview kind='workflow' label='全链路阶段流程组件预览' />
  },
  {
    icon: <ChartSplineIcon />,
    title: 'Instant Performance Insights',
    description:
      'Get accurate reports and analytics that help you understand growth patterns and make confident decisions. These insights empower you to strategies effectively for future success.',
    visual: <BenefitStudioPreview kind='history' label='任务状态与历史组件预览' />
  }
]
