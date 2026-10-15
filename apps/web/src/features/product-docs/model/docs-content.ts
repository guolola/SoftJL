// Defines the product documentation manifest and binds each Markdown file to typed article metadata.
import { TUTORIAL_QUICK_START_VIDEO_URL } from "../../../shared/lib/video-assets";
import { markdownModules } from './docs-content.generated';
export type ProductDocCategoryId = "overview" | "model-provider" | "requirements" | "models" | "delivery" | "support";
export type ProductDocCategory = {
    id: ProductDocCategoryId;
    label: string;
    description: string;
};
export type ProductDocArticle = {
    id: string;
    title: string;
    category: ProductDocCategoryId;
    categoryLabel: string;
    summary: string;
    estimatedMinutes: number;
    content: string;
    recommendedPath: boolean;
    tags: readonly string[];
    relatedArtifacts: readonly string[];
    screenshot?: {
        src: string;
        alt: string;
        caption: string;
    };
    video?: {
        src: string;
        title: string;
        description: string;
        caption: string;
    };
};
type ProductDocArticleManifestItem = Omit<ProductDocArticle, "categoryLabel" | "content"> & {
    sourcePath: keyof typeof markdownModules;
};
export const PRODUCT_DOC_CATEGORIES: readonly ProductDocCategory[] = [
    {
        "id": "overview",
        "label": "开始使用",
        "description": "创建项目、熟悉界面，完成第一次生成。"
    },
    {
        "id": "model-provider",
        "label": "账号与模型",
        "description": "连接模型服务，设置默认模型，管理生成次数。"
    },
    {
        "id": "requirements",
        "label": "需求与可行性",
        "description": "确认业务规则，评估边界、流程和实现路线。"
    },
    {
        "id": "models",
        "label": "建模与设计",
        "description": "生成模型，检查元素、关系和需求覆盖。"
    },
    {
        "id": "delivery",
        "label": "实现与交付",
        "description": "准备测试、检查覆盖并导出说明书。"
    },
    {
        "id": "support",
        "label": "任务与排障",
        "description": "查看进度与历史，解决权限和生成问题。"
    }
];
const ARTICLE_MANIFEST = [
    {
        "id": "quick-start",
        "title": "快速开始",
        "category": "overview",
        "summary": "创建第一个项目，整理需求、检查模型并导出说明书。",
        "estimatedMinutes": 5,
        "recommendedPath": true,
        "sourcePath": "../content/quick-start.md",
        "tags": [
            "新手",
            "快速开始",
            "图书馆预约系统",
            "完整流程"
        ],
        "relatedArtifacts": [
            "项目",
            "需求规则",
            "需求模型",
            "说明书"
        ],
        "video": {
            "src": TUTORIAL_QUICK_START_VIDEO_URL,
            "title": "快速开始项目操作视频",
            "description": "通过演示了解整体流程；实际入口与操作名称以本页文字步骤为准。",
            "caption": "辅助演示 · 以当前文字步骤为准"
        }
    },
    {
        "id": "project-basics",
        "title": "创建与进入项目",
        "category": "overview",
        "summary": "按三个步骤创建项目，选择可见范围并进入工作台。",
        "estimatedMinutes": 3,
        "recommendedPath": true,
        "sourcePath": "../content/project-basics.md",
        "tags": [
            "项目首页",
            "创建项目",
            "项目卡片",
            "新建项目"
        ],
        "relatedArtifacts": [
            "项目",
            "成员权限"
        ]
    },
    {
        "id": "workspace-shell",
        "title": "认识项目工作台",
        "category": "overview",
        "summary": "找到阶段入口、模型子菜单、标签页和顶部项目操作。",
        "estimatedMinutes": 4,
        "recommendedPath": true,
        "sourcePath": "../content/workspace-shell.md",
        "tags": [
            "工作台",
            "顶部栏",
            "侧边栏",
            "标签页",
            "链路图"
        ],
        "relatedArtifacts": [
            "项目导航",
            "模型树",
            "标签页"
        ]
    },
    {
        "id": "feature-map",
        "title": "页面入口与工作流程",
        "category": "overview",
        "summary": "从你想完成的任务出发，找到页面入口和下一步。",
        "estimatedMinutes": 3,
        "recommendedPath": false,
        "sourcePath": "../content/feature-map.md",
        "tags": [
            "页面入口",
            "全链路映射",
            "产物关系",
            "导航"
        ],
        "relatedArtifacts": [
            "页面入口",
            "阶段结果",
            "来源关系"
        ]
    },
    {
        "id": "project-drawers",
        "title": "项目设置与成员管理",
        "category": "overview",
        "summary": "修改项目资料、邀请成员，并查找项目任务和文档。",
        "estimatedMinutes": 4,
        "recommendedPath": false,
        "sourcePath": "../content/project-drawers.md",
        "tags": [
            "项目设置",
            "成员管理",
            "邀请",
            "文档中心"
        ],
        "relatedArtifacts": [
            "项目设置",
            "成员",
            "邀请",
            "说明书文件"
        ]
    },
    {
        "id": "account-global-settings",
        "title": "账号设置与默认模型",
        "category": "model-provider",
        "summary": "在全局设置选择供应商和默认模型，并管理账号偏好。",
        "estimatedMinutes": 3,
        "recommendedPath": true,
        "sourcePath": "../content/account-global-settings.md",
        "tags": [
            "账号",
            "全局设置",
            "模型配置",
            "托管 Provider",
            "默认模型"
        ],
        "relatedArtifacts": [
            "账号资料",
            "默认模型",
            "工作台偏好"
        ]
    },
    {
        "id": "provider-configuration",
        "title": "配置模型供应商",
        "category": "model-provider",
        "summary": "添加个人模型供应商，获取模型列表，测试后保存默认配置。",
        "estimatedMinutes": 4,
        "recommendedPath": true,
        "sourcePath": "../content/provider-configuration.md",
        "tags": [
            "Provider",
            "API Key",
            "获取模型列表",
            "测试托管配置",
            "供应商"
        ],
        "relatedArtifacts": [
            "供应商配置",
            "模型列表",
            "连接测试"
        ]
    },
    {
        "id": "recommended-models",
        "title": "模型选择指南",
        "category": "model-provider",
        "summary": "用小样例比较模型的结果、稳定性、速度和成本。",
        "estimatedMinutes": 3,
        "recommendedPath": true,
        "sourcePath": "../content/recommended-models.md",
        "tags": [
            "模型选择",
            "结构化输出",
            "稳定性",
            "成本",
            "Provider"
        ],
        "relatedArtifacts": [
            "验证样例",
            "运行结果",
            "供应商账单"
        ]
    },
    {
        "id": "requirements",
        "title": "整理需求与确认规则",
        "category": "requirements",
        "summary": "把业务描述整理为需求规则，检查补齐内容并确认修复。",
        "estimatedMinutes": 5,
        "recommendedPath": true,
        "sourcePath": "../content/requirements.md",
        "tags": [
            "需求输入",
            "需求规则",
            "AI 修复",
            "智能修复",
            "规则确认",
            "质量提示"
        ],
        "relatedArtifacts": [
            "需求文本",
            "需求规则",
            "质量提示",
            "修复候选"
        ]
    },
    {
        "id": "requirement-baseline",
        "title": "处理需求待确认项",
        "category": "requirements",
        "summary": "处理需求已修改、修复待确认和下游生成被阻塞的提示。",
        "estimatedMinutes": 3,
        "recommendedPath": false,
        "sourcePath": "../content/requirement-baseline.md",
        "tags": [
            "需求质量",
            "需求基线",
            "待确认",
            "阻塞原因",
            "质量提示"
        ],
        "relatedArtifacts": [
            "已确认需求",
            "待确认项",
            "需更新状态"
        ]
    },
    {
        "id": "feasibility-analysis",
        "title": "完成可行性分析",
        "category": "requirements",
        "summary": "生成边界与业务流程图，比较方案，并保持研究报告依据有效。",
        "estimatedMinutes": 6,
        "recommendedPath": true,
        "sourcePath": "../content/feasibility-analysis.md",
        "tags": [
            "可行性分析",
            "系统环境图",
            "业务与系统流程图",
            "实现方案",
            "成本收益",
            "风险",
            "五类结论"
        ],
        "relatedArtifacts": [
            "系统环境图",
            "业务与系统流程图",
            "实现方案",
            "研究报告"
        ]
    },
    {
        "id": "uml-models",
        "title": "生成与查看需求模型",
        "category": "models",
        "summary": "按业务问题选择需求模型，生成图表并核对需求来源。",
        "estimatedMinutes": 5,
        "recommendedPath": true,
        "sourcePath": "../content/uml-models.md",
        "tags": [
            "UML",
            "PlantUML",
            "SVG",
            "功能结构图",
            "用例模型",
            "模型树"
        ],
        "relatedArtifacts": [
            "需求模型",
            "图源码",
            "SVG 图片",
            "跟踪矩阵"
        ]
    },
    {
        "id": "uml-model-detail",
        "title": "查看与编辑模型详情",
        "category": "models",
        "summary": "定位元素与关系，检查来源，修改后保存重绘。",
        "estimatedMinutes": 5,
        "recommendedPath": true,
        "sourcePath": "../content/uml-model-detail.md",
        "tags": [
            "模型详情页",
            "元素列表",
            "追踪矩阵",
            "跟踪矩阵",
            "手动重绘"
        ],
        "relatedArtifacts": [
            "模型元素",
            "关系",
            "图源码",
            "来源映射"
        ]
    },
    {
        "id": "design-models",
        "title": "生成与检查设计模型",
        "category": "models",
        "summary": "细化架构、对象交互、页面和数据库，并核对设计依赖。",
        "estimatedMinutes": 5,
        "recommendedPath": true,
        "sourcePath": "../content/design-models.md",
        "tags": [
            "设计模型",
            "用例实现设计",
            "设计类图",
            "页面导航图",
            "数据库设计"
        ],
        "relatedArtifacts": [
            "设计模型",
            "设计图",
            "需求来源"
        ]
    },
    {
        "id": "design-traceability",
        "title": "检查需求到设计的覆盖",
        "category": "models",
        "summary": "从需求找到设计元素，检查缺失覆盖和待复核关系。",
        "estimatedMinutes": 4,
        "recommendedPath": true,
        "sourcePath": "../content/design-traceability.md",
        "tags": [
            "设计追踪矩阵",
            "需求到设计映射",
            "链路图",
            "低置信关系",
            "跟踪矩阵"
        ],
        "relatedArtifacts": [
            "需求到设计映射",
            "待复核关系",
            "链路图"
        ]
    },
    {
        "id": "testing-coverage",
        "title": "测试用例与覆盖关系",
        "category": "delivery",
        "summary": "生成业务测试用例，检查正常、异常和边界场景的覆盖。",
        "estimatedMinutes": 4,
        "recommendedPath": true,
        "sourcePath": "../content/testing-coverage.md",
        "tags": [
            "测试用例",
            "覆盖关系",
            "测试场景",
            "黑盒测试"
        ],
        "relatedArtifacts": [
            "测试用例",
            "预期结果",
            "覆盖关系"
        ]
    },
    {
        "id": "documents-delivery",
        "title": "说明书生成与下载",
        "category": "delivery",
        "summary": "准备文档所需产物，调整样式，检查版本并下载 DOCX。",
        "estimatedMinutes": 4,
        "recommendedPath": true,
        "sourcePath": "../content/documents-delivery.md",
        "tags": [
            "说明书",
            "说明书版本",
            "可行性研究报告",
            "DOCX",
            "样式",
            "版本",
            "下载",
            "OnlyOffice"
        ],
        "relatedArtifacts": [
            "需求规格说明书",
            "软件设计说明书",
            "可行性研究报告",
            "文档版本"
        ]
    },
    {
        "id": "generation-tasks-history",
        "title": "查看生成任务与运行历史",
        "category": "support",
        "summary": "查看当前进度和失败子项，核对历史结果与可用恢复操作。",
        "estimatedMinutes": 4,
        "recommendedPath": false,
        "sourcePath": "../content/generation-tasks-history.md",
        "tags": [
            "生成任务",
            "运行历史",
            "重试",
            "恢复快照",
            "证据"
        ],
        "relatedArtifacts": [
            "任务进度",
            "失败信息",
            "历史结果"
        ]
    },
    {
        "id": "account-models-faq",
        "title": "账号、模型与权限问题",
        "category": "support",
        "summary": "按现象定位登录、项目权限、模型服务和账单问题。",
        "estimatedMinutes": 4,
        "recommendedPath": false,
        "sourcePath": "../content/account-models-faq.md",
        "tags": [
            "账号",
            "权限",
            "模型配置",
            "全局设置",
            "MFA"
        ],
        "relatedArtifacts": [
            "登录会话",
            "成员角色",
            "模型配置",
            "订单状态"
        ]
    },
    {
        "id": "troubleshooting",
        "title": "生成问题排查",
        "category": "support",
        "summary": "从页面提示定位阻塞、生成失败、图表缺失或过期结果。",
        "estimatedMinutes": 4,
        "recommendedPath": false,
        "sourcePath": "../content/troubleshooting.md",
        "tags": [
            "排障",
            "生成失败",
            "渲染失败",
            "AI 修复失败",
            "说明书缺图",
            "模型不可用"
        ],
        "relatedArtifacts": [
            "错误提示",
            "任务记录",
            "上游状态"
        ]
    }
] satisfies readonly ProductDocArticleManifestItem[];
type ProductDocsLocale = "zh-CN" | "en";
const EN_CATEGORY_TEXT: Record<ProductDocCategoryId, Pick<ProductDocCategory, "label" | "description">> = {
    "overview": {
        "label": "Get started",
        "description": "Create a project, learn the workspace and complete your first workflow."
    },
    "model-provider": {
        "label": "Account and models",
        "description": "Connect model providers, choose defaults and test connections."
    },
    "requirements": {
        "label": "Requirements and feasibility",
        "description": "Confirm business rules, system boundaries, workflows and implementation choices."
    },
    "models": {
        "label": "Modeling and design",
        "description": "Generate models and review elements, relationships and requirement coverage."
    },
    "delivery": {
        "label": "Implementation and delivery",
        "description": "Prepare tests, review coverage and export specifications."
    },
    "support": {
        "label": "Tasks and troubleshooting",
        "description": "Inspect progress and history, and resolve access or generation problems."
    }
};
const EN_ARTICLE_TEXT: Record<string, {
    title: string;
    summary: string;
    tags: readonly string[];
    relatedArtifacts: readonly string[];
}> = {
    "quick-start": {
        "title": "Quick start",
        "tags": [
            "Beginner",
            "Full path",
            "Library booking",
            "Entry points"
        ],
        "relatedArtifacts": [
            "Project",
            "Requirement rules",
            "Requirement models",
            "Specifications"
        ],
        "summary": "Create your first project, review requirements and models, and export a specification."
    },
    "project-basics": {
        "title": "Create and open a project",
        "tags": [
            "Project home",
            "Create project",
            "Project cards",
            "Project entry"
        ],
        "relatedArtifacts": [
            "Project",
            "Member access"
        ],
        "summary": "Create a project in three steps, choose its visibility and open the workspace."
    },
    "workspace-shell": {
        "title": "Find your way around the workspace",
        "tags": [
            "Workspace",
            "Top bar",
            "Sidebar",
            "Tabs",
            "Lineage graph"
        ],
        "relatedArtifacts": [
            "Project navigation",
            "Model tree",
            "Tabs"
        ],
        "summary": "Locate stages, model details, tabs and project actions."
    },
    "feature-map": {
        "title": "Find a feature and its workflow",
        "tags": [
            "Entry points",
            "Workflow map",
            "Artifacts",
            "Navigation"
        ],
        "relatedArtifacts": [
            "Entry points",
            "Stage results",
            "Source relationships"
        ],
        "summary": "Find the right page and next step for the task you want to complete."
    },
    "project-drawers": {
        "title": "Manage project settings and members",
        "tags": [
            "Project settings",
            "Members",
            "Generation tasks",
            "Run history",
            "Documents"
        ],
        "relatedArtifacts": [
            "Project settings",
            "Members",
            "Invitations",
            "Documents"
        ],
        "summary": "Update project details, invite collaborators and find project documents."
    },
    "account-global-settings": {
        "title": "Account settings and default model",
        "tags": [
            "Account",
            "Global settings",
            "Model configuration",
            "Hosted provider",
            "Default model"
        ],
        "relatedArtifacts": [
            "Account profile",
            "Default model",
            "Workspace preferences"
        ],
        "summary": "Select a provider and default model in global settings, and manage account preferences."
    },
    "provider-configuration": {
        "title": "Configure a model provider",
        "tags": [
            "Provider",
            "API key",
            "Model discovery",
            "Hosted configuration test",
            "Credits"
        ],
        "relatedArtifacts": [
            "Provider configuration",
            "Model catalog",
            "Connection test"
        ],
        "summary": "Add a personal provider, fetch its models, test the connection and save your defaults."
    },
    "recommended-models": {
        "title": "Model selection guide",
        "tags": [
            "Model selection",
            "Structured output",
            "Reliability",
            "Cost",
            "Provider"
        ],
        "relatedArtifacts": [
            "Validation sample",
            "Run results",
            "Provider billing"
        ],
        "summary": "Compare available models using a small sample, reliability, latency and actual cost."
    },
    "requirements": {
        "title": "Write and confirm requirement rules",
        "tags": [
            "Requirements",
            "Requirement rules",
            "AI repair",
            "Rule confirmation",
            "Quality prompts"
        ],
        "relatedArtifacts": [
            "Requirement text",
            "Rules",
            "Quality notices",
            "Repair suggestions"
        ],
        "summary": "Turn business descriptions into rules, review suggested additions and confirm repairs."
    },
    "requirement-baseline": {
        "title": "Resolve pending requirement reviews",
        "tags": [
            "Requirement quality",
            "Requirement baseline",
            "Pending confirmation",
            "Blocking reason",
            "Quality prompts"
        ],
        "relatedArtifacts": [
            "Confirmed requirements",
            "Pending reviews",
            "Outdated results"
        ],
        "summary": "Resolve changed-text, pending-repair and prerequisite notices before continuing."
    },
    "feasibility-analysis": {
        "title": "Complete a feasibility analysis",
        "tags": [
            "Feasibility analysis",
            "System Environment Diagram",
            "Implementation plan",
            "Cost-benefit",
            "Risks",
            "Five conclusions",
            "Feasibility report"
        ],
        "relatedArtifacts": [
            "System Environment Diagram",
            "Business and System Flow Diagram",
            "Implementation options",
            "Feasibility report"
        ],
        "summary": "Review system boundaries and business flows, compare implementation options and prepare a current report."
    },
    "uml-models": {
        "title": "Generate and review requirement models",
        "tags": [
            "UML",
            "PlantUML",
            "SVG",
            "Work breakdown",
            "Use case model",
            "Model tree"
        ],
        "relatedArtifacts": [
            "Requirement models",
            "Diagram source",
            "SVG images",
            "Traceability"
        ],
        "summary": "Choose model types for your questions, generate diagrams and check their requirement sources."
    },
    "uml-model-detail": {
        "title": "Inspect and edit model details",
        "tags": [
            "Model detail",
            "Element list",
            "Traceability matrix",
            "Manual redraw",
            "Model details"
        ],
        "relatedArtifacts": [
            "Model elements",
            "Relationships",
            "Diagram source",
            "Source links"
        ],
        "summary": "Find elements and relationships, check their sources, then save and redraw valid changes."
    },
    "design-models": {
        "title": "Generate and review design models",
        "tags": [
            "Design models",
            "Use case realization",
            "Design class diagram",
            "UI relationship diagram",
            "Database design"
        ],
        "relatedArtifacts": [
            "Design models",
            "Design diagrams",
            "Requirement sources"
        ],
        "summary": "Develop architecture, interactions, navigation and database designs from their required sources."
    },
    "design-traceability": {
        "title": "Check requirement-to-design coverage",
        "tags": [
            "Design traceability",
            "Requirement mapping",
            "Lineage graph",
            "Low-confidence links"
        ],
        "relatedArtifacts": [
            "Requirement-to-design links",
            "Pending reviews",
            "Lineage graph"
        ],
        "summary": "Follow requirement sources into design elements and review missing or uncertain coverage."
    },
    "testing-coverage": {
        "title": "Test cases and coverage",
        "tags": [
            "Test cases",
            "Coverage",
            "Test scenarios",
            "Black-box testing"
        ],
        "relatedArtifacts": [
            "Test cases",
            "Expected results",
            "Coverage links"
        ],
        "summary": "Generate business test cases and review normal, exception and boundary coverage."
    },
    "documents-delivery": {
        "title": "Generate and download specifications",
        "tags": [
            "Specification",
            "Document versions",
            "Feasibility report",
            "DOCX",
            "Style",
            "Download",
            "OnlyOffice"
        ],
        "relatedArtifacts": [
            "Requirements specification",
            "Design specification",
            "Feasibility report",
            "Document versions"
        ],
        "summary": "Prepare the required sources, adjust styling, review versions and download DOCX files."
    },
    "generation-tasks-history": {
        "title": "Inspect generation tasks and history",
        "tags": [
            "Generation tasks",
            "Run history",
            "Retry",
            "Restore snapshot",
            "Evidence"
        ],
        "relatedArtifacts": [
            "Task progress",
            "Failure details",
            "Saved results"
        ],
        "summary": "Inspect active progress, failed subtasks and saved results before retrying or restoring."
    },
    "account-models-faq": {
        "title": "Account, model and permission issues",
        "tags": [
            "Account",
            "Permissions",
            "Model configuration",
            "Global settings",
            "MFA"
        ],
        "relatedArtifacts": [
            "Sessions",
            "Member roles",
            "Model configuration",
            "Order status"
        ],
        "summary": "Find the right checks for sign-in, project permissions and model services."
    },
    "troubleshooting": {
        "title": "Troubleshoot generation problems",
        "tags": [
            "Troubleshooting",
            "Generation failure",
            "Render failure",
            "AI repair failure",
            "Missing diagrams",
            "Unavailable model"
        ],
        "relatedArtifacts": [
            "Error messages",
            "Task records",
            "Upstream status"
        ],
        "summary": "Locate blocked actions, failed jobs, missing diagrams and outdated results."
    }
};
// Keep English reading paths task-specific instead of repeating a generic placeholder.
const EN_ARTICLE_GUIDANCE: Record<string, [
    string,
    string,
    string[],
    string,
    string
]> = {
    "quick-start": [
        "Open [Projects](/projects).",
        "Sign in and choose an available model.",
        [
            "Create a project and describe the business in **System requirements**.",
            "Choose **Extract requirement rules**, review the rules and resolve repair candidates.",
            "Generate and review models, then prepare and download a specification."
        ],
        "Rules connect business text to models, tests and specifications.",
        "Read the inline prerequisite notice when an action is unavailable."
    ],
    "project-basics": [
        "Open [Projects](/projects) and choose **New project**.",
        "Sign in; course binding can remain unassigned.",
        [
            "Fill in the project name, description and background.",
            "Select visibility and any course or team binding.",
            "Confirm, create and open the project."
        ],
        "Each project keeps its own sources, results and history.",
        "For an invited project, use the account associated with the invitation."
    ],
    "workspace-shell": [
        "Open any project.",
        "Your account needs project access.",
        [
            "Choose a stage from the sidebar.",
            "Expand a model to view elements, relationships or traceability.",
            "Switch open views using tabs; inspect tasks and history from top actions."
        ],
        "Stage home pages generate results; model submenus show details.",
        "On small screens, use **Open project navigation**."
    ],
    "feature-map": [
        "Use the project sidebar and top actions.",
        "Reading docs does not require sign-in; project actions require access.",
        [
            "Start with **System requirements**, then choose feasibility, modeling or design.",
            "Use **Tests** to review coverage and **Documents** to export deliverables.",
            "Export saved diagrams and documents for implementation."
        ],
        "Follow requirement sources into models, designs, tests and documents.",
        "Use Generation tasks for progress and Run history for past results."
    ],
    "project-drawers": [
        "Use project top actions or **Open project actions**.",
        "Management operations depend on your member role.",
        [
            "Edit project details in **Project settings**.",
            "Invite collaborators and review roles in **Members**.",
            "Find progress, saved results and files in Tasks, History and Documents."
        ],
        "Project management applies to the current project; model defaults are account settings.",
        "Read confirmations before archiving, transferring or deleting a project."
    ],
    "account-global-settings": [
        "Account menu → **Settings → Global settings**.",
        "Sign in and have access to a provider.",
        [
            "Select a provider and a default model from its catalog.",
            "Test the configuration, then save.",
            "Confirm the actual choice on the generation page."
        ],
        "Defaults initialize generation choices; run records show actual usage.",
        "Add a personal provider or ask an administrator if no configuration is available."
    ],
    "provider-configuration": [
        "Account menu → **Settings → Global settings → Hosted model configuration**.",
        "Prepare a compatible Base URL and API key.",
        [
            "Add a provider and enter its name, URL and key.",
            "Fetch models, select a default and pass the connection test.",
            "Save the provider, then save global settings."
        ],
        "Model usage is billed by your configured provider.",
        "Saving requires model discovery and a successful test."
    ],
    "recommended-models": [
        "Select a model in Global settings or on the generation page.",
        "Connect a provider and prepare a repeatable small sample.",
        [
            "Test access using a model from the current catalog.",
            "Compare requirement quality, valid diagrams and source coverage on the same input.",
            "Compare reliability, latency and actual cost before choosing."
        ],
        "Real task results complement basic connection tests.",
        "Evaluate long specifications separately from short tasks."
    ],
    "requirements": [
        "Project sidebar → **System requirements**.",
        "Use an editable project and an available model.",
        [
            "Describe roles, workflows, constraints and failure behavior.",
            "Select **Extract requirement rules**, or **Update requirement rules** for changed existing text.",
            "Confirm quality notices or request repairs, then accept or reject candidates."
        ],
        "Confirmed rules feed analysis, models, tests and documents.",
        "Review rules again when their source text changes."
    ],
    "requirement-baseline": [
        "Open rule reviews and quality notices in **System requirements**.",
        "Generated rules or pending review candidates exist.",
        [
            "Compare rules with the current text.",
            "Accept or reject candidates, and confirm applicable quality notices.",
            "Recheck the prerequisite notice before continuing."
        ],
        "The baseline is the confirmed source version used downstream.",
        "An outdated result may remain visible, but still needs review against current sources."
    ],
    "feasibility-analysis": [
        "Project sidebar → **Feasibility analysis**.",
        "Confirm rules and choose an available model.",
        [
            "Generate the System Environment Diagram and Business and System Flow Diagram.",
            "Generate options, completing missing or outdated dependencies when requested.",
            "Review costs, risks and conclusions, save changes and prepare the report."
        ],
        "Options depend on rules, both diagrams and supplemental facts.",
        "Old plans missing flow dependencies must be regenerated after the diagrams are ready."
    ],
    "uml-models": [
        "Project sidebar → **Requirement models**.",
        "Confirm rules and resolve prerequisite notices.",
        [
            "Select the types of model needed for your business questions.",
            "Generate, then inspect progress in **Generation tasks**.",
            "Review the diagrams, elements, relationships and requirement sources."
        ],
        "Structured models produce diagram source and SVG images for downstream use.",
        "Successful rendering still requires a business review."
    ],
    "uml-model-detail": [
        "Expand a model and open elements, relationships or traceability.",
        "The model has been generated.",
        [
            "Find the target element using search or filters.",
            "Check relationship endpoints and requirement sources.",
            "Edit, resolve field errors, save and redraw, then review affected results."
        ],
        "Business elements carry source links; database lines follow table constraints.",
        "Repair references to deleted elements before saving."
    ],
    "design-models": [
        "Project sidebar → **Design models**.",
        "Prepare the sources required by each selected design type.",
        [
            "Select architecture, interactions, classes, navigation, database or deployment designs.",
            "Check dependencies and generate.",
            "Inspect details and source links before using the designs."
        ],
        "Use cases support realization design; domain concepts support classes and tables.",
        "Check use cases and event flows if realization designs are missing."
    ],
    "design-traceability": [
        "Open design traceability or the top **Lineage graph** action.",
        "Save requirement and design models with element-level source links.",
        [
            "Find a rule and its requirement model element.",
            "Follow the link to a design element.",
            "Open the design and verify the behavior, resolving missing or pending coverage."
        ],
        "A link locates evidence; the design content must satisfy the requirement.",
        "If the matrix is empty, check that saved models include element-level mappings."
    ],
    "testing-coverage": [
        "Project sidebar → **Tests**.",
        "Confirmed rules and a use-case model are required; design models add context.",
        [
            "Generate test cases and filter by scenario type.",
            "Review preconditions, inputs, steps and expected outcomes.",
            "Check requirement coverage and update vague source material."
        ],
        "Generated test cases need execution against the implemented program.",
        "Coverage counts alone do not prove correctness or passing tests."
    ],
    "documents-delivery": [
        "Project sidebar → **Documents**, or the document library.",
        "Prepare current sources required by the chosen document type.",
        [
            "Select a type and resolve missing or outdated source notices.",
            "Adjust style, generate and review content and images.",
            "Check the version and download the DOCX; use online editing when available."
        ],
        "Documents preserve source content from their generation time.",
        "Regenerate deliverables after changing upstream requirements or models."
    ],
    "generation-tasks-history": [
        "Use **Generation tasks** and **Run history** in project top actions.",
        "A generation task has been started in the project.",
        [
            "Expand the current task to inspect stages or failures.",
            "Find completed records by time and type.",
            "Review inputs and results before retrying or restoring."
        ],
        "Tasks explain current progress; history keeps earlier results.",
        "A restored snapshot may still be outdated compared with current requirements."
    ],
    "account-models-faq": [
        "Use account Settings or project Members.",
        "Confirm the current account.",
        [
            "Check invitations and roles for project access.",
            "Test the selected provider in Global settings for model issues.",
            "Inspect provider configuration for model access, and Security or Sessions for account access."
        ],
        "Identity, member permissions and model access are separate checks.",
        "For provider access failures, test the connection in model settings."
    ],
    "troubleshooting": [
        "Start with the current notice, then inspect tasks and history.",
        "Identify the affected stage and keep the visible task reference.",
        [
            "Read the exact prerequisite or failure message.",
            "Correct the failed item's input or upstream dependency.",
            "Retry only the affected work and inspect the resulting artifact."
        ],
        "Trace errors from the page to the task and its source.",
        "A failed task and an outdated result have different causes."
    ]
};
function buildEnglishContent(article: ProductDocArticleManifestItem, title: string, summary: string) {
    const guidance = EN_ARTICLE_GUIDANCE[article.id];
    const artifacts = EN_ARTICLE_TEXT[article.id]?.relatedArtifacts ?? article.relatedArtifacts;
    // Reuse the current, task-specific screenshots so translated guides cannot retain old UI assets.
    const screenshots = [...new Set([...(markdownModules[article.sourcePath] ?? "").matchAll(/!\[[^\]]*\]\((\/help\/images\/[^)]+)\)/gu)]
            .map((match) => match[1]))];
    return [
        `# ${title}`, "",
        "## When to use this page", summary, "",
        "## Where to find it", guidance[0], "",
        "## Before you begin", guidance[1], "",
        "## Steps", ...guidance[2].map((step, index) => `${index + 1}. ${step}`),
        ...(screenshots.length ? ["", "Current interface shown with Chinese labels and demonstration project data. Select an image to enlarge it.", "", ...screenshots.flatMap((src, index) => [`![${title}: screenshot ${index + 1} (Chinese interface)](${src})`, ""])] : []), "",
        "## Results", artifacts.map((item) => `- ${item}`).join("\n"), "",
        "## How the results connect", guidance[3], "",
        "## Common questions", guidance[4],
    ].join("\n");
}
function localizeArticle(article: ProductDocArticleManifestItem, categories: readonly ProductDocCategory[], locale: ProductDocsLocale): ProductDocArticle {
    const category = categories.find((item) => item.id === article.category);
    if (locale !== "en") {
        return {
            ...article,
            categoryLabel: category?.label ?? "使用文档",
            content: markdownModules[article.sourcePath] ?? "",
        };
    }
    const english = EN_ARTICLE_TEXT[article.id];
    const title = english?.title ?? article.title;
    const summary = english?.summary ?? article.summary;
    return {
        ...article,
        title,
        summary,
        categoryLabel: category?.label ?? "Docs",
        content: buildEnglishContent(article, title, summary),
        tags: english?.tags ?? article.tags,
        relatedArtifacts: english?.relatedArtifacts ?? article.relatedArtifacts,
        screenshot: article.screenshot
            ? {
                ...article.screenshot,
                alt: `${title} screenshot`,
                caption: `Screenshot for ${title}.`,
            }
            : undefined,
        video: article.video
            ? {
                ...article.video,
                title: `${title} video`,
                description: `A guided walkthrough for ${title}.`,
                caption: "Demo video",
            }
            : undefined,
    };
}
export function getProductDocCategories(locale: ProductDocsLocale): readonly ProductDocCategory[] {
    if (locale !== "en")
        return PRODUCT_DOC_CATEGORIES;
    return PRODUCT_DOC_CATEGORIES.map((category) => ({
        ...category,
        ...EN_CATEGORY_TEXT[category.id],
    }));
}
export function getProductDocArticles(locale: ProductDocsLocale): readonly ProductDocArticle[] {
    const categories = getProductDocCategories(locale);
    return ARTICLE_MANIFEST.map((article) => localizeArticle(article, categories, locale));
}
export const PRODUCT_DOC_ARTICLES: readonly ProductDocArticle[] = ARTICLE_MANIFEST.map((article) => {
    const category = PRODUCT_DOC_CATEGORIES.find((item) => item.id === article.category);
    return {
        ...article,
        categoryLabel: category?.label ?? "使用文档",
        content: markdownModules[article.sourcePath] ?? "",
    };
});
