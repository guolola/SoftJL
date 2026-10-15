// Supplies the real platform workflow to Craft's Experience accordion.
import { BracesIcon, FileTextIcon, GitBranchIcon, NetworkIcon } from 'lucide-react'

import type { ExperienceProps } from '@/components/blocks/experience/experience'

const stageIcon = (Icon: typeof FileTextIcon) => (
  <div className='bg-primary/10 grid size-8 place-items-center rounded-md'>
    <Icon className='text-primary size-4' />
  </div>
)

export const experienceData: ExperienceProps[] = [
  {
    companyName: '需求与规则',
    icon: stageIcon(FileTextIcon),
    items: [{
      role: '结构化需求', value: 'requirements', duration: '第一阶段', type: '需求分析', badges: ['需求规格', '业务规则', '可追溯性'],
      responsibilities: ['录入或整理需求文本。', '生成并审阅结构化需求与业务规则。', '为后续模型和设计保留来源关联。']
    }]
  },
  {
    companyName: '建模与设计',
    icon: stageIcon(NetworkIcon),
    items: [{
      role: 'UML 与架构', value: 'modelling', duration: '第二阶段', type: '模型设计', badges: ['UML', '架构', '详细设计'],
      responsibilities: ['选择适用模型并生成图与 PlantUML。', '继续生成架构和详细设计产物。', '在工作区中编辑、重新渲染和保留版本。']
    }]
  },
  {
    companyName: '生成与交付',
    icon: stageIcon(BracesIcon),
    items: [{
      role: '代码与说明书', value: 'delivery', duration: '第三阶段', type: '工程交付', badges: ['代码生成', '文档', '下载'],
      responsibilities: ['根据项目上下文生成代码与相关资产。', '生成需求、设计或可行性说明书。', '保留 SSE 进度、失败恢复和历史记录。']
    }]
  },
  {
    companyName: '团队协作',
    icon: stageIcon(GitBranchIcon),
    showInMore: true,
    items: [{
      role: '权限与历史', value: 'collaboration', duration: '贯穿全程', type: '项目管理', badges: ['成员', '权限', '历史'],
      responsibilities: ['在项目范围内管理成员和权限。', '从抽屉中访问历史、文档和设置。', '在真实项目路由下继续协作。']
    }]
  }
]
