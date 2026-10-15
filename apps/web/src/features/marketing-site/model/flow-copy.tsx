// Product copy for the original Flow slots; translations add no layout wrappers.
import { useTranslation } from 'react-i18next';
import { i18n } from '../../../shared/i18n';
const copy: Record<string, Record<string, string>> = {
  "Benefits": {
    "zh-CN": "检查与修改",
    "en": "Review and revise"
  },
  "How Flow Helps You": {
    "zh-CN": "需求改得动，设计查得到，答辩讲得清",
    "en": "Revise requirements, review designs, explain your work"
  },
  "It&apos;s built to simplify your sales process and keep everything easy to manage.": {
    "zh-CN": "围绕同一份需求，查看设计来源、检查覆盖缺口和更新影响，为修改材料与讲解项目提供依据。",
    "en": "Follow design sources, coverage gaps and update dependencies from the same requirements to guide revisions and explain your project."
  },
  "Start building now": {
    "zh-CN": "开始我的项目",
    "en": "Start my project"
  },
  "Start your project": {
    "zh-CN": "开始项目",
    "en": "Start your project"
  },
  "Learn more": {
    "zh-CN": "查看使用指南",
    "en": "Read the guide"
  },
  "Take Control of Your Sales Pipeline": {
    "zh-CN": "从一条需求开始，检查你的项目",
    "en": "Start reviewing your project with one requirement"
  },
  "Join Flow and get a complete overview of your users, sales, and performance - all from one powerful dashboard.": {
    "zh-CN": "写清业务规则，生成并检查模型，核对测试覆盖与说明书；需求变化后，沿来源关系找到需要更新的材料。",
    "en": "Define business rules, generate and review models, and check test coverage and specifications. Follow source links to find materials that need updating after a change."
  },
  "Get started": {
    "zh-CN": "开始我的项目",
    "en": "Start my project"
  },
  "FAQ": {
    "zh-CN": "常见问题",
    "en": "FAQ"
  },
  "Frequently asked questions": {
    "zh-CN": "关于项目检查与交付，你可能想了解",
    "en": "About project review and delivery"
  },
  "Here are some quick answers to help you understand how Flow powers your product success.": {
    "zh-CN": "了解需求修改后怎样更新材料、如何检查生成结果，以及怎样衔接代码实现。",
    "en": "Learn how to update materials after requirement changes, review generated work and continue with implementation."
  },
  "Features": {
    "zh-CN": "核心功能",
    "en": "Features"
  },
  "Powerful Features, Simple to Use": {
    "zh-CN": "把需求、设计、测试和说明书关联起来",
    "en": "Connect requirements, designs, tests and specifications"
  },
  "Everything you need to manage sales, track growth, and stay focused-without the clutter.": {
    "zh-CN": "在同一个项目中查看产物与来源关系，检查哪些需求已有设计和测试依据，哪些材料还需要补齐或更新。",
    "en": "Review artifacts and their sources in one project to see which requirements have design and test evidence, and which materials need completion or updates."
  },
  "User are improved by": {
    "zh-CN": "任务完成进度",
    "en": "Task progress"
  },
  "than last month and product reached to 2,432 new users": {
    "zh-CN": "实际进度以项目任务为准",
    "en": "Actual progress appears in project tasks"
  },
  "Product reach": {
    "zh-CN": "提交之前，核对项目材料",
    "en": "Review materials before submission"
  },
  "See how many people discover and engage with your product visitors, views and conversion signals at a glance.": {
    "zh-CN": "对照需求查看 UML 与测试覆盖，再检查说明书中的图表和正文，为课程提交和阶段评审整理材料。",
    "en": "Review UML and test coverage against requirements, then inspect diagrams and text in your specifications for submission and progress reviews."
  },
  "Athlete": {
    "zh-CN": "需求",
    "en": "Requirements"
  },
  "Artists": {
    "zh-CN": "设计",
    "en": "Design"
  },
  "Professionals": {
    "zh-CN": "开发",
    "en": "Development"
  },
  "Student": {
    "zh-CN": "测试",
    "en": "Testing"
  },
  "Targeted Visibility": {
    "zh-CN": "课程小组，共同推进",
    "en": "Work together on coursework"
  },
  "Show your product only to selected customers, segments or regions tiers for precise marketing.": {
    "zh-CN": "为课程设计小组配置项目成员与权限，在同一个项目中查看材料与进度。",
    "en": "Set up members and permissions for your course team to review materials and progress in a shared project."
  },
  "Riley Smith": {
    "zh-CN": "需求分析",
    "en": "Requirements analysis"
  },
  "$2,000": {
    "zh-CN": "需求阶段",
    "en": "Requirements"
  },
  "Taylor Morgan": {
    "zh-CN": "模型生成",
    "en": "Model generation"
  },
  "$2,200": {
    "zh-CN": "模型阶段",
    "en": "Models"
  },
  "Alex Thomas": {
    "zh-CN": "设计推导",
    "en": "Design derivation"
  },
  "$1,500": {
    "zh-CN": "设计模型",
    "en": "Design model"
  },
  "Jamie Parker": {
    "zh-CN": "设计导出",
    "en": "Design export"
  },
  "$800": {
    "zh-CN": "实现与验证",
    "en": "Implementation and verification"
  },
  "Casey Reynolds": {
    "zh-CN": "文档生成",
    "en": "Document generation"
  },
  "$750": {
    "zh-CN": "说明书",
    "en": "Specification"
  },
  "Jordan Lee": {
    "zh-CN": "测试追踪",
    "en": "Test tracing"
  },
  "$3,250": {
    "zh-CN": "跟踪矩阵",
    "en": "Traceability matrix"
  },
  "Customer Payments": {
    "zh-CN": "设计为什么这样做，回看依据",
    "en": "Revisit the sources behind your design"
  },
  "Track who paid, how much, and the payment status — one clear ledger for sales, refunds and reconciliations.": {
    "zh-CN": "结合生成任务与历史产物，回看设计使用了哪些资料，整理阶段汇报和答辩时的讲解依据。",
    "en": "Use generation tasks and earlier artifacts to revisit the inputs behind your design and prepare explanations for reviews and your defense."
  },
  "Set monthly sales goal": {
    "zh-CN": "项目阶段目标",
    "en": "Project milestone"
  },
  "Goals & Targets": {
    "zh-CN": "下一步做什么，更清楚",
    "en": "Know what to do next"
  },
  "Set user or revenue targets for any timeframe and watch progress update in real time-with clear insights at every step.": {
    "zh-CN": "按需求、建模、设计与测试逐步推进，查看前置条件，知道当前还需要补充什么。",
    "en": "Move through requirements, modeling, design and testing with visible prerequisites showing what still needs attention."
  },
  "Product Reach": {
    "zh-CN": "项目产物",
    "en": "Project artifacts"
  },
  "New users": {
    "zh-CN": "需求规则",
    "en": "Requirements"
  },
  "User queries": {
    "zh-CN": "模型关系",
    "en": "Model relations"
  },
  "Regular Updates": {
    "zh-CN": "生成到哪了，随时查看",
    "en": "Follow generation progress"
  },
  "Get regular real-time alerts and notifications for orders, payments, and customer activity—so nothing slips through the cracks": {
    "zh-CN": "查看任务排队、运行、完成与失败状态，及时了解产物更新。",
    "en": "Follow queued, running, completed and failed tasks as artifacts change."
  },
  "Online store": {
    "zh-CN": "需求阶段",
    "en": "Requirements"
  },
  "$120k": {
    "zh-CN": "需求模型",
    "en": "Requirements model"
  },
  "+12.6%": {
    "zh-CN": "进行中",
    "en": "In progress"
  },
  "Offline store": {
    "zh-CN": "设计阶段",
    "en": "Design"
  },
  "$20k": {
    "zh-CN": "设计模型",
    "en": "Design model"
  },
  "-4.2%": {
    "zh-CN": "待更新",
    "en": "Needs update"
  },
  "Sales & Growth": {
    "zh-CN": "需求改了，检查关联设计",
    "en": "Review designs when requirements change"
  },
  "Monitor product performance across stores orders, revenue and average order value in one place.": {
    "zh-CN": "沿着需求与设计的关联检查修改影响，帮助你找到需要回头核对的内容。",
    "en": "Follow links between requirements and designs to identify what needs another review after a change."
  },
  "Details": {
    "zh-CN": "详细说明",
    "en": "Details"
  },
  "Trusted by 5,000+ growing businesses": {
    "zh-CN": "面向软件工程教学与实践",
    "en": "For software engineering education and practice"
  },
  "AI-Powered": {
    "zh-CN": "AI 驱动",
    "en": "AI-Powered"
  },
  "For software engineering education and practice": {
    "zh-CN": "面向毕设与课程设计的工程实践工作台",
    "en": "An engineering workspace for capstone and course projects"
  },
  "Connect": {
    "zh-CN": "用 AI 辅助",
    "en": "Build"
  },
  "with AI": {
    "zh-CN": "",
    "en": "with AI"
  },
  "Make engineering practice": {
    "zh-CN": "设计有依据",
    "en": "Trace your designs,"
  },
  "clearer": {
    "zh-CN": "修改有方向",
    "en": "guide your revisions"
  },
  "Capstone projects": {
    "zh-CN": "毕业设计",
    "en": "capstone projects"
  },
  "Course projects": {
    "zh-CN": "课程设计",
    "en": "course projects"
  },
  "UML assignments": {
    "zh-CN": "UML 作业",
    "en": "UML assignments"
  },
  "Rating: 4.5 out of 5": {
    "zh-CN": "评分：满分 5 分中的 4.5 分",
    "en": "Rating: 4.5 out of 5"
  },
  "Requirements, models and delivery": {
    "zh-CN": "检查覆盖 · 查看更新影响 · 梳理答辩依据",
    "en": "Review coverage · Follow changes · Explain your work"
  },
  "Requirements analysis": {
    "zh-CN": "需求分析",
    "en": "Requirements analysis"
  },
  "Engineering delivery": {
    "zh-CN": "工程交付",
    "en": "Engineering delivery"
  },
  "Requirements → UML": {
    "zh-CN": "需求 → UML 模型",
    "en": "Requirements → UML"
  },
  "Models → Code & Docs": {
    "zh-CN": "设计 → 文档与编码依据",
    "en": "Design → Docs & Coding Inputs"
  },
  "Read the guide": {
    "zh-CN": "阅读指南",
    "en": "Read the guide"
  },
  "Supercharge Your Product&rsquo;s": {
    "zh-CN": "用 AI 辅助项目检查与修改",
    "en": "Review and revise your project with AI"
  },
  "Track every key metric in one clean dashboard - no code, no setup, just real-time insights that help you grow smarter.": {
    "zh-CN": "从需求规则关联 UML、设计、测试与说明书，检查覆盖缺口，查看修改影响，梳理答辩依据。导出设计与测试依据，在自己的仓库中运行和验证。",
    "en": "Connect requirement rules to UML, designs, tests and specifications. Review coverage gaps, follow change impacts and prepare explanations for your defense. Export your saved models and documents for implementation and verification."
  },
  "Welcome to dashboard": {
    "zh-CN": "项目工作区",
    "en": "Project workspace"
  },
  "Your product orders": {
    "zh-CN": "需求与任务",
    "en": "Requirements and tasks"
  },
  "Product&rsquo;s insight": {
    "zh-CN": "模型与追踪",
    "en": "Models and traceability"
  },
  "User payments": {
    "zh-CN": "项目设置",
    "en": "Project settings"
  },
  "Pricing": {
    "zh-CN": "账户权益",
    "en": "Credits"
  },
  "Pricing Details": {
    "zh-CN": "按项目需要，选择生成权益",
    "en": "Choose credits for your project"
  },
  "A comprehensive breakdown of our pricing plans to help you make the best choice.": {
    "zh-CN": "价格与积分读取当前可用套餐，完整信息以账户计费页面为准。",
    "en": "Prices and credits come from the current catalog. See account billing for full details."
  },
  "Flat": {
    "zh-CN": "按需",
    "en": "Flexible"
  },
  "20%": {
    "zh-CN": "购买",
    "en": "Purchase"
  },
  "off for first 250 user": {
    "zh-CN": "查看当前可用套餐",
    "en": "View current packages"
  },
  "Monthly": {
    "zh-CN": "价格",
    "en": "Price"
  },
  "Yearly": {
    "zh-CN": "积分",
    "en": "Credits"
  },
  "Trending": {
    "zh-CN": "推荐",
    "en": "Featured"
  },
  "Testimonials": {
    "zh-CN": "项目成果",
    "en": "Project outcomes"
  },
  "Trusted by People Who Sell Smarter": {
    "zh-CN": "回看项目来源，准备汇报与答辩",
    "en": "Review project sources for reviews and your defense"
  },
  "Real stories from users who simplified their sales process and grew their revenue with Flow.": {
    "zh-CN": "结合需求、模型与测试的关联，核对生成材料，整理设计来源与工作记录，为阶段汇报和答辩准备讲解依据。",
    "en": "Use requirement, model and test links to review generated materials and organize design sources and work records for progress reviews and your defense."
  },
  "4.5": {
    "zh-CN": "5",
    "en": "5"
  },
  "Stars out of 5": {
    "zh-CN": "工程实践阶段",
    "en": "Engineering stages"
  },
  "View all testimonials": {
    "zh-CN": "开始积累项目成果",
    "en": "Start building your project"
  },
  "Software engineering tools and platforms": {
    "zh-CN": "软件工程领域的工具与平台",
    "en": "Software engineering tools and platforms"
  },
  "Workbench dashboard preview": {
    "zh-CN": "SoftJL 工作台看板预览",
    "en": "Engineering platform workbench dashboard preview"
  },
  "Company": {
    "zh-CN": "平台",
    "en": "Platform"
  },
  "Blog": {
    "zh-CN": "使用指南",
    "en": "Guide"
  },
  "Help": {
    "zh-CN": "帮助",
    "en": "Help"
  },
  "Subscribe to newsletter": {
    "zh-CN": "注册并开始实践",
    "en": "Register to get started"
  },
  "Flow": {
    "zh-CN": "SoftJL",
    "en": "SoftJL"
  },
  "Menu": {
    "zh-CN": "菜单",
    "en": "Menu"
  },
  "Login": {
    "zh-CN": "登录",
    "en": "Login"
  },
  "Try demo": {
    "zh-CN": "开始实践",
    "en": "Get started"
  },
  "Try Demo": {
    "zh-CN": "开始实践",
    "en": "Get started"
  },
  "Toggle theme": {
    "zh-CN": "切换明暗主题",
    "en": "Toggle theme"
  },
  "Close": {
    "zh-CN": "关闭",
    "en": "Close"
  },
  "Unified Sales Overview": {
    "zh-CN": "需求改了，哪些设计要更新？",
    "en": "Requirements changed. Which designs need updates?"
  },
  "Monitor leads, purchases, and orders in real-time to stay updated on every key business metric. This ensures you have the latest insights to make informed decisions.": {
    "zh-CN": "确认修改后的需求规则，沿链路图查看关联产物和需更新状态，找到需要重新检查与生成的设计。",
    "en": "Confirm revised requirement rules, then follow artifact links and update statuses in the lineage graph to find designs that need review and regeneration."
  },
  "Automated Follow-Ups": {
    "zh-CN": "提交前，还有哪些需求没覆盖？",
    "en": "Before submission, which requirements lack coverage?"
  },
  "Let smart reminders handle repetitive tasks, allowing you to concentrate on closing more deals rather than managing them. This way, you can maximise your productivity and achieve better results.": {
    "zh-CN": "从跟踪矩阵定位缺失或待复核的设计关系，再检查测试是否包含正常、异常和边界场景。打开具体内容，核对规则是否得到表达。",
    "en": "Locate missing or uncertain design links in traceability matrices, then review normal, exceptional and boundary test scenarios. Inspect the actual content to check how each rule is represented."
  },
  "Clean & Simple Workflow": {
    "zh-CN": "图表和说明书，怎样一起核对？",
    "en": "How do you review diagrams and specifications together?"
  },
  "Move deals effortlessly through stages with our intuitive pipeline system designed for clarity and control. This system ensures that you always have a clear view of your progress.": {
    "zh-CN": "依据项目中保存的模型与设计生成工程说明书，在线编辑正文，对照图表检查内容，再按学校要求整理并导出 DOCX。",
    "en": "Generate specifications from saved models and designs, edit the text online and check it against the diagrams. Adapt the documents to your university requirements and export DOCX."
  },
  "Instant Performance Insights": {
    "zh-CN": "答辩时，怎么讲清设计依据？",
    "en": "How will you explain your design?"
  },
  "Get accurate reports and analytics that help you understand growth patterns and make confident decisions. These insights empower you to strategies effectively for future success.": {
    "zh-CN": "沿着需求、设计与测试的关联回看项目，结合任务记录梳理设计理由，为阶段汇报和答辩准备讲解依据。",
    "en": "Follow links between requirements, designs and tests, and revisit task records to prepare the reasoning behind your work for reviews and your defense."
  },
  "What is Flow?": {
    "zh-CN": "毕业设计和课程设计，可以用它做什么？",
    "en": "How can this help my capstone or course project?"
  },
  "Flow is a SaaS platform that helps you monitor and manage your product performance - including users, purchases, and engagement - from a single dashboard.": {
    "zh-CN": "围绕同一份需求，生成并检查 UML、系统设计、测试与工程说明书。你可以查看来源关系、定位覆盖缺口和需更新材料，梳理汇报与答辩依据，支持独立部署与自带模型。",
    "en": "Generate and review UML, system designs, tests and specifications from the same requirements. Follow source links, locate coverage gaps and materials needing updates, prepare explanations for reviews and your defense, and export the results for implementation."
  },
  "How does Flow help my business?": {
    "zh-CN": "需求改了，后续材料怎么更新？",
    "en": "How do I update materials after requirements change?"
  },
  "Flow helps your business by providing clear insights into user behavior, sales performance, and engagement metrics, enabling you to make data-driven decisions and optimize growth.": {
    "zh-CN": "先保存并确认修改后的需求，再在阶段页面或链路图查看关联产物的需更新状态，按依赖顺序核对并重新生成。继续编码前，检查来源更新，并在本地修改代码、执行测试。",
    "en": "Save and confirm revised requirements, then review linked artifacts and update statuses in stage pages or the lineage graph. Review and regenerate them in dependency order. Before continuing with code, check source updates, revise the local implementation and run tests."
  },
  "Can I track multiple products at once?": {
    "zh-CN": "可以导出哪些毕设材料？",
    "en": "Which project materials can I export?"
  },
  "Yes, Flow allows you to track multiple products simultaneously, giving you a unified view of performance across all your products.": {
    "zh-CN": "可以获取 UML 的 PlantUML 源码与 SVG 图，并生成、编辑和下载可行性研究报告、需求规格说明书、软件设计说明书等 DOCX 工程文档。提交前需按学校模板整理，并检查图表与正文。",
    "en": "You can obtain PlantUML source and SVG diagrams, and generate, edit and download DOCX feasibility reports, requirements specifications and software design descriptions. Review diagrams and text, and adapt the documents to your university template before submission."
  },
  "Do I need technical knowledge to use it?": {
    "zh-CN": "怎样确认图表、文档和代码符合需求？",
    "en": "How do I check diagrams, documents and code against requirements?"
  },
  "No, Flow is designed to be user-friendly and intuitive, so you can easily use it without any technical expertise.": {
    "zh-CN": "沿需求与设计的关联逐项检查约束和行为，对照说明书中的图表与正文，再在实际程序中执行测试。连线存在或覆盖数高，仍需核对内容；平台提供检查依据，代码的业务正确性需要实际运行验证。",
    "en": "Follow requirement and design links to inspect constraints and behavior, compare diagrams with specification text, and run tests against the actual program. Links and coverage counts still require content review. The platform provides review inputs; business correctness requires runtime verification."
  },
  "Is my data safe with Flow?": {
    "zh-CN": "系统设计完成后，怎么衔接代码实现？",
    "en": "How do I move from system design to code?"
  },
  "Yes, your data is secure with Flow. We use industry-standard security practices to ensure your information is protected and handled safely.": {
    "zh-CN": "导出 UML 图表和工程说明书，结合项目中已保存的设计、验收条件与测试用例，在自己的代码仓库中完成实现。部署者启用 MCP 后，也可从“编程助手”连接外部工具，授权读取项目资料并在本地运行测试。",
    "en": "Export UML diagrams and engineering specifications. Use the saved designs, acceptance criteria and test cases to implement the system in your own repository, then run tests to verify that it meets the requirements. If MCP is enabled for this deployment, connect your coding assistant and authorize it to read selected project materials."
  },
  "Does Flow offer a free trial?": {
    "zh-CN": "如何配置自己的模型？",
    "en": "How do I configure my own model?"
  },
  "Yes, Flow offers a free trial so you can explore all core features and see how it fits your business before committing to a paid plan.": {
    "zh-CN": "登录后在账号设置添加个人供应商，完成连接测试并选择默认模型；调用费用由供应商结算。",
    "en": "Add your provider in account settings, test the connection and select a model. Your provider bills model usage."
  },
  "Essential Plan": {
    "zh-CN": "当前套餐",
    "en": "Current package"
  },
  "Perfect for solo founders and small teams": {
    "zh-CN": "按实际任务选择权益",
    "en": "Choose credits for your tasks"
  },
  "/month": {
    "zh-CN": "元 / 次购买",
    "en": "CNY / purchase"
  },
  "Basic Access": {
    "zh-CN": "查看账户权益",
    "en": "View credits"
  },
  "1 user seat": {
    "zh-CN": "需求分析",
    "en": "Requirements analysis"
  },
  "Real-time product analytics": {
    "zh-CN": "UML 建模",
    "en": "UML modeling"
  },
  "Up to 1K tracked users": {
    "zh-CN": "设计导出",
    "en": "Design export"
  },
  "Basic revenue insights": {
    "zh-CN": "任务记录",
    "en": "Task history"
  },
  "Email support": {
    "zh-CN": "说明书生成",
    "en": "Specifications"
  },
  "Advanced Plan": {
    "zh-CN": "当前套餐",
    "en": "Current package"
  },
  "Build for small businesses.": {
    "zh-CN": "支持项目实践流程",
    "en": "Supports project workflows"
  },
  "Premium Access": {
    "zh-CN": "查看账户权益",
    "en": "View credits"
  },
  "Up to 10 user seats": {
    "zh-CN": "项目成员管理",
    "en": "Project membership"
  },
  "Advanced sales & engagement reports": {
    "zh-CN": "模型关联追踪",
    "en": "Model traceability"
  },
  "Up to 10K tracked users": {
    "zh-CN": "设计产物",
    "en": "Design artifacts"
  },
  "Smart growth insights": {
    "zh-CN": "历史记录",
    "en": "History"
  },
  "API & integrations": {
    "zh-CN": "产物导出",
    "en": "Artifact export"
  },
  "Team collaboration tools": {
    "zh-CN": "项目协作",
    "en": "Project collaboration"
  },
  "Secure data infrastructure": {
    "zh-CN": "账户设置",
    "en": "Account settings"
  },
  "Pro Plan": {
    "zh-CN": "当前套餐",
    "en": "Current package"
  },
  "Designed for growing teams and business.": {
    "zh-CN": "按需补充生成权益",
    "en": "Add credits when needed"
  },
  "Elite Access": {
    "zh-CN": "查看账户权益",
    "en": "View credits"
  },
  "Up to 25 user seats": {
    "zh-CN": "生成任务记录",
    "en": "Generation task history"
  },
  "Advanced automation workflows": {
    "zh-CN": "阶段状态追踪",
    "en": "Stage status"
  },
  "Up to 50K tracked users": {
    "zh-CN": "编码实现依据",
    "en": "Implementation inputs"
  },
  "Predictive growth insights": {
    "zh-CN": "跟踪矩阵",
    "en": "Traceability matrix"
  },
  "Priority email & chat support": {
    "zh-CN": "文档编辑与导出",
    "en": "Document editing and export"
  },
  "Emily Watson": {
    "zh-CN": "需求分析",
    "en": "Requirements"
  },
  "Finally, a dashboard that shows": {
    "zh-CN": "从系统需求开始，整理",
    "en": "Start with system requirements and organize"
  },
  "everything that matters-users, orders, and revenue": {
    "zh-CN": "规则、参与者与核心业务",
    "en": "rules, actors and core business behavior"
  },
  "all in one clean view. It helps us make informed decisions much faster.": {
    "zh-CN": "，为模型与设计提供共同依据。",
    "en": " as a shared basis for modeling and design."
  },
  "Alex Rivera": {
    "zh-CN": "UML 建模",
    "en": "UML modeling"
  },
  "The interface is incredibly intuitive and the tools are very practical. We&apos;ve": {
    "zh-CN": "按业务语义查看",
    "en": "Inspect business semantics through"
  },
  "cut our deal cycle time almost in half": {
    "zh-CN": "用例、类图与活动模型",
    "en": "use cases, classes and activities"
  },
  "since making the switch. Adoption across the team was effortless.": {
    "zh-CN": "，并在工作区检查元素与关系。",
    "en": " and review elements and relationships in the workspace."
  },
  "Marcus Johnson": {
    "zh-CN": "设计推导",
    "en": "Design"
  },
  "The seamless integrations streamlined my daily workflow significantly. I can manage emails, track clients, and schedule follow-ups": {
    "zh-CN": "沿着需求与用例查看设计产物，",
    "en": "Follow requirements and use cases into design artifacts,"
  },
  "without ever leaving the platform": {
    "zh-CN": "保留上下游关联",
    "en": " retaining upstream and downstream links"
  },
  "Sarah Chen": {
    "zh-CN": "设计导出",
    "en": "Design export"
  },
  "From onboarding to daily usage, everything feels well thought out. The components are": {
    "zh-CN": "设计准备好后，导出图表与文档，按已保存的设计",
    "en": "When your designs are ready, use the exported artifacts to"
  },
  "polished, consistent, and production-ready": {
    "zh-CN": "实现与验证",
    "en": "implement and verify"
  },
  ". Shipping new features is noticeably faster.": {
    "zh-CN": "，在自己的代码仓库中检查运行结果。",
    "en": " your saved designs and check the running results in your repository."
  },
  "Ncdai": {
    "zh-CN": "测试追踪",
    "en": "Test tracing"
  },
  "Clean design and sensible defaults make a huge difference. The": {
    "zh-CN": "通过测试模型与",
    "en": "Use test models and"
  },
  "documentation is clear and easy to follow": {
    "zh-CN": "跟踪矩阵检查关联",
    "en": "traceability matrices"
  },
  ", which saved me hours during setup.": {
    "zh-CN": "，核对需求与设计是否有对应的测试场景。",
    "en": " to check whether requirements and designs have corresponding test scenarios."
  },
  "Lisa Thompson": {
    "zh-CN": "说明书交付",
    "en": "Specifications"
  },
  "I&apos;ve used many UI kits, but this one strikes the perfect balance. The": {
    "zh-CN": "组织项目产物并生成",
    "en": "Organize project artifacts and generate"
  },
  "customization options are incredibly flexible": {
    "zh-CN": "可编辑的工程说明书",
    "en": "editable engineering specifications"
  },
  "without sacrificing design quality.": {
    "zh-CN": "，检查后导出，再按学校要求完善。",
    "en": " to review, export and adapt to your university requirements."
  },
  "Amazon": {
    "zh-CN": "需求分析",
    "en": "Requirements"
  },
  "Deloitte": {
    "zh-CN": "UML 建模",
    "en": "UML"
  },
  "Evernote": {
    "zh-CN": "系统设计",
    "en": "Design"
  },
  "Fedex": {
    "zh-CN": "设计导出",
    "en": "Code"
  },
  "Hubspot": {
    "zh-CN": "软件测试",
    "en": "Testing"
  },
  "Microsoft": {
    "zh-CN": "文档交付",
    "en": "Documents"
  },
  "Walmart": {
    "zh-CN": "项目协作",
    "en": "Projects"
  },
  "Analytics & Insights": {
    "zh-CN": "分析与建模",
    "en": "Analysis and modeling"
  },
  "Unified Dashboard": {
    "zh-CN": "项目工作区",
    "en": "Project workspace"
  },
  "Get every key business metric in one place.": {
    "zh-CN": "集中组织项目中的工程产物。",
    "en": "Organize engineering artifacts in one workspace."
  },
  "Competitor Tracking": {
    "zh-CN": "需求分析",
    "en": "Requirements"
  },
  "Benchmark performance and market trends.": {
    "zh-CN": "梳理规则与业务边界。",
    "en": "Review rules and business boundaries."
  },
  "Sales Analytics": {
    "zh-CN": "模型追踪",
    "en": "Model tracing"
  },
  "Track revenue growth, conversions & profitability.": {
    "zh-CN": "查看需求、设计与测试关联。",
    "en": "Inspect requirement, design and test relationships."
  },
  "Productivity & Optimization": {
    "zh-CN": "实践与交付",
    "en": "Practice and delivery"
  },
  "Report & Export": {
    "zh-CN": "说明书与导出",
    "en": "Specifications and export"
  },
  "Share insights quickly with automated reporting.": {
    "zh-CN": "组织项目产物并导出文档。",
    "en": "Organize artifacts and export documents."
  },
  "Workflow Scheduling": {
    "zh-CN": "生成任务",
    "en": "Generation tasks"
  },
  "Plan content & operational tasks seamlessly.": {
    "zh-CN": "查看阶段进度与历史记录。",
    "en": "Inspect stage progress and history."
  },
  "User Management": {
    "zh-CN": "成员管理",
    "en": "Membership"
  },
  "Manage roles and access with complete control.": {
    "zh-CN": "管理项目成员和访问权限。",
    "en": "Manage members and project access."
  },
  "Guide": {
    "zh-CN": "使用指南",
    "en": "Guide"
  },
  "Growth": {
    "zh-CN": "需求",
    "en": "Requirements"
  },
  "Revenue": {
    "zh-CN": "模型",
    "en": "Models"
  },
  "Sales": {
    "zh-CN": "交付",
    "en": "Delivery"
  },
  "Your email address": {
    "zh-CN": "你的邮箱地址",
    "en": "Your email address"
  },
  "Total visitors": {
    "zh-CN": "项目概览",
    "en": "Project overview"
  },
  "Total sales": {
    "zh-CN": "产物跟踪",
    "en": "Artifact tracking"
  },
  "23.02K": {
    "zh-CN": "需求 → 模型",
    "en": "Requirements → UML"
  },
  "$2,150.00": {
    "zh-CN": "设计 → 测试",
    "en": "Design → Tests"
  },
  "Desktop": {
    "zh-CN": "需求",
    "en": "Requirements"
  },
  "Tablet": {
    "zh-CN": "设计",
    "en": "Design"
  },
  "Mobile": {
    "zh-CN": "测试",
    "en": "Testing"
  },
  "Headset 22R": {
    "zh-CN": "文档任务",
    "en": "Document task"
  },
  "Dell Vision 7": {
    "zh-CN": "可行性任务",
    "en": "Feasibility task"
  },
  "Playstation 5": {
    "zh-CN": "测试任务",
    "en": "Test task"
  },
  "Online Store": {
    "zh-CN": "需求阶段",
    "en": "Requirements stage"
  },
  "Offline Store": {
    "zh-CN": "设计阶段",
    "en": "Design stage"
  },
  "Credits": {
    "zh-CN": " 次权益",
    "en": " credits"
  },
  "功能说明 / Workflow": {
    "zh-CN": "功能说明 · 非客户评价",
    "en": "Workflow · not a review"
  },
  "$2,350": {
    "zh-CN": "代码阶段",
    "en": "Code"
  }
};
export function flowText(text: string) {
  const key = text.replace(/\s+/g, ' ').trim();
  const sourceKey = Object.keys(copy).find(value => value.replace(/&apos;/g, "'").replace(/&rsquo;/g, '’').replace(/&amp;/g, '&') === key) ?? key;
  return copy[sourceKey]?.[i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN'] ?? text;
}
export function FlowCopy({ text }: { text: string }) {
  useTranslation();
  return <>{flowText(text)}</>;
}
