// Static demo dataset for the marketing hero; mirrors the WorkbenchData contract so the homepage
// can render the real WorkbenchDashboard without any API access. Labels are zh to match the
// default site locale, since the hero exhibits these as screenshots.
import type { WorkbenchData } from '@/shared/template/blocks/dashboard/workbench-data'

export const demoWorkbenchData: WorkbenchData = {
  kpis: [
    {
      kind: 'projects',
      title: '项目',
      value: '48',
      trend: 'up',
      changePercentage: '+12%',
      badgeContent: '本周新增'
    },
    {
      kind: 'members',
      title: '协作者',
      value: '126',
      trend: 'up',
      changePercentage: '+8%',
      badgeContent: '全部项目'
    },
    {
      kind: 'runs',
      title: '生成运行',
      value: '312',
      trend: 'up',
      changePercentage: '+24%',
      badgeContent: '近 30 天'
    },
    {
      kind: 'models',
      title: 'UML 模型',
      value: '17',
      trend: 'up',
      changePercentage: '+5%',
      badgeContent: '不同模型'
    }
  ],
  timeline: {
    title: '项目时间线',
    description: '6 个活跃项目',
    entries: [
      {
        name: 'AL',
        project: '图书馆系统',
        startDate: '2026-01-08',
        endDate: '2026-04-22',
        fill: 'var(--chart-1)'
      },
      {
        name: 'SK',
        project: '校园钱包',
        startDate: '2026-02-15',
        endDate: '2026-06-03',
        fill: 'var(--chart-2)'
      },
      {
        name: 'JW',
        project: '诊所预约',
        startDate: '2026-03-01',
        endDate: '2026-07-11',
        fill: 'var(--chart-3)'
      },
      {
        name: 'RC',
        project: '物流中枢',
        startDate: '2026-04-10',
        endDate: '2026-08-26',
        fill: 'var(--chart-5)'
      },
      {
        name: 'MG',
        project: '在线教学平台',
        startDate: '2026-05-05',
        endDate: '2026-09-14',
        fill: 'var(--primary)'
      }
    ],
    listTitle: '项目列表',
    listDescription: '4 个进行中',
    projects: [
      { iconKind: 'web', title: '图书馆系统', tasks: '6 名成员', colorClassName: 'bg-chart-2/10 text-chart-2' },
      { iconKind: 'mobile', title: '校园钱包', tasks: '4 名成员', colorClassName: 'bg-chart-5/10 text-chart-5' },
      { iconKind: 'card', title: '诊所预约', tasks: '8 名成员', colorClassName: 'bg-chart-3/10 text-chart-3' },
      { iconKind: 'design', title: '物流中枢', tasks: '3 名成员', colorClassName: 'bg-chart-1/10 text-chart-1' }
    ]
  },
  weekly: {
    title: 'Token 使用量',
    data: [
      { name: 'Mon', uv: 18200, pv: 6100 },
      { name: 'Tue', uv: 26400, pv: 9200 },
      { name: 'Wed', uv: 22100, pv: 7800 },
      { name: 'Thu', uv: 34800, pv: 12400 },
      { name: 'Fri', uv: 30200, pv: 10600 },
      { name: 'Sat', uv: 12400, pv: 4300 },
      { name: 'Sun', uv: 8600, pv: 3000 }
    ],
    barLabel: '输入 tokens',
    lineLabel: '输出 tokens',
    summaryValue: '186K',
    summaryLabel: '本周 token 消耗（输入+输出）'
  },
  conversion: {
    title: 'AI 模型使用',
    subTitle: '各模型调用次数',
    totalConversion: 41,
    conversionTrend: 'up',
    percentageChange: 6,
    conversionData: [
      { title: 'gpt-4o', stat: '128 次', trend: 'up', percentageChange: 41 },
      { title: 'claude-3-5-sonnet', stat: '96 次', trend: 'up', percentageChange: 31 },
      { title: 'qwen-max', stat: '64 次', trend: 'up', percentageChange: 21 },
      { title: 'deepseek-v3', stat: '24 次', trend: 'down', percentageChange: 7 }
    ],
    chartData: [
      { month: 'Mar', conversion: 24 },
      { month: 'Apr', conversion: 31 },
      { month: 'May', conversion: 28 },
      { month: 'Jun', conversion: 42 },
      { month: 'Jul', conversion: 38 },
      { month: 'Aug', conversion: 51 },
      { month: 'Sep', conversion: 47 }
    ]
  },
  performance: {
    title: '项目活动',
    members: {
      tabLabel: '团队',
      person: { name: 'Amanda Lee', role: '项目负责人', initials: 'AL' },
      badgeLabel: '活跃项目',
      badgeValue: '48 个',
      highlightLabel: '已完成运行',
      highlightValue: '287',
      highlightTrend: 'up',
      highlightPct: '14.8%',
      members: [
        { name: 'Olivia Sparks', initials: 'OS' },
        { name: 'Howard Lloyd', initials: 'HL' },
        { name: 'Hallie Richards', initials: 'HR' },
        { name: 'Jenny Wilson', initials: 'JW' }
      ],
      viewAllLabel: '查看全部',
      footerStrong: '协作活跃',
      footerText: '团队成员正在推进各项目里程碑。'
    },
    area: {
      tabLabel: '按月',
      leftStat: { label: '设计运行', value: '142', trend: 'up' },
      rightStat: { label: '代码运行', value: '118', trend: 'up' },
      headlineLabel: '运行总数',
      headlineValue: '312',
      headlineTrend: 'up',
      headlinePct: '5.6%',
      chartLabel: '运行',
      chartData: [
        { label: 'Mar', value: 280 },
        { label: 'Apr', value: 400 },
        { label: 'May', value: 280 },
        { label: 'Jun', value: 590 },
        { label: 'Jul', value: 360 },
        { label: 'Aug', value: 460 },
        { label: 'Sep', value: 400 }
      ],
      footerStrong: '持续增长',
      footerText: '本月生成量接近目标。'
    },
    bar: {
      tabLabel: '按日',
      leftStat: { label: '成功', value: '287', trend: 'up' },
      rightStat: { label: '失败', value: '25', trend: 'down' },
      headlineLabel: '日均运行',
      headlineValue: '44',
      headlineTrend: 'up',
      headlinePct: '3.4%',
      chartLabel: '运行',
      chartData: [
        { label: 'Mon', value: 120 },
        { label: 'Tue', value: 240 },
        { label: 'Wed', value: 190 },
        { label: 'Thu', value: 270 },
        { label: 'Fri', value: 210 },
        { label: 'Sat', value: 160 },
        { label: 'Sun', value: 130 }
      ],
      footerStrong: '稳定运行',
      footerText: '每日生成任务保持活跃。'
    }
  },
  tableRows: [
    {
      id: '1',
      avatar: '',
      fallback: 'AL',
      user: '图书馆系统',
      email: 'Amanda Lee',
      role: 'admin',
      plan: 'enterprise',
      billing: 'auto-debit',
      status: 'active'
    },
    {
      id: '2',
      avatar: '',
      fallback: 'SK',
      user: '校园钱包',
      email: 'Sam Kim',
      role: 'editor',
      plan: 'team',
      billing: 'manual-paypal',
      status: 'active'
    },
    {
      id: '3',
      avatar: '',
      fallback: 'JW',
      user: '诊所预约',
      email: 'Jenny Wilson',
      role: 'maintainer',
      plan: 'company',
      billing: 'auto-debit',
      status: 'pending'
    },
    {
      id: '4',
      avatar: '',
      fallback: 'RC',
      user: '物流中枢',
      email: 'Robert Chen',
      role: 'author',
      plan: 'basic',
      billing: 'manual-cash',
      status: 'inactive'
    },
    {
      id: '5',
      avatar: '',
      fallback: 'MG',
      user: '在线教学平台',
      email: 'Maya Gonzalez',
      role: 'subscriber',
      plan: 'team',
      billing: 'manual-paypal',
      status: 'active'
    },
    {
      id: '6',
      avatar: '',
      fallback: 'OS',
      user: '研究档案',
      email: 'Olivia Sparks',
      role: 'editor',
      plan: 'enterprise',
      billing: 'auto-debit',
      status: 'pending'
    },
    {
      id: '7',
      avatar: '',
      fallback: 'HL',
      user: '智慧食堂',
      email: 'Howard Lloyd',
      role: 'admin',
      plan: 'company',
      billing: 'manual-cash',
      status: 'active'
    }
  ],
  runsLoaded: true
}
