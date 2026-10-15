// Provides bilingual copy for the first-use workspace and project tours.
export const onboardingZh = {
  onboarding: {
    replay: "查看引导",
    dialogLabel: "工作台引导",
    progress: "第 {{current}} / {{total}} 步",
    previous: "上一步",
    next: "下一步",
    skip: "跳过引导",
    finish: "完成引导",
    saveFailed: "引导状态未能保存，下次登录时可能再次出现。",
    startFailed: "暂时无法打开引导，请刷新页面后重试。",
    empty: {
      overview: { title: "从项目开始", content: "每个项目都有自己的需求、模型、代码和说明书。创建项目后，工作台会汇集整个开发过程。" },
      create: { title: "创建第一个项目", content: "从这里打开创建表单，填写项目名称和背景，再设置可见范围。完成创建后会直接进入项目工作台。" },
    },
    desktop: {
      system: { title: "输入系统需求", content: "先写下业务背景和目标，再选择模型生成需求规则。引导不会替你输入或启动生成。" },
      feasibility: { title: "可行性分析", content: "这里整理系统环境、业务流程和实现方案；分析入口会说明缺少哪些前置内容。" },
      requirements: { title: "需求模型", content: "在这里检查需求规则、选择目标模型，并在生成后查看对应的 UML 图。" },
      diagrams: { title: "UML 图与追踪", content: "具体图会在需求分析生成后出现在左侧模型树，届时还可以查看图中元素和追踪关系。" },
      design: { title: "设计模型", content: "需求模型准备好后，可继续生成设计类图、组件关系和交互设计。" },
      
      tests: { title: "测试", content: "在这里查看测试模型与覆盖关系，按已完成的上游产物逐步推进。" },
      documents: { title: "说明书与交付", content: "生成的说明书和文档版本会集中在这里，方便检查和交付。" },
      tasks: { title: "生成任务", content: "顶部入口可查看正在运行或已完成的生成任务及进度。" },
      history: { title: "运行历史", content: "从这里追溯每次运行、失败原因和可恢复的工作台记录。" },
      management: { title: "项目管理", content: "项目设置、成员和文档入口都在顶部。项目权限会决定可执行的管理操作。" },
    },
    mobile: {
      system: { title: "从系统需求开始", content: "输入项目目标和业务背景，生成需求规则后再继续后续阶段。" },
      analysis: { title: "分析与 UML", content: "可行性分析、需求模型和具体 UML 图构成分析阶段。图会在生成后出现。" },
      build: { title: "设计与测试", content: "设计模型为代码开发提供实现依据，测试模块帮助检查需求覆盖。" },
      delivery: { title: "文档交付", content: "说明书汇总前面的产物，并保留可查看的文档版本。" },
      manage: { title: "跟踪项目", content: "顶部可查看生成任务、运行历史、项目设置和成员。左上角菜单可随时切换阶段。" },
    },
  },
} as const;

export const onboardingEn = {
  onboarding: {
    replay: "View guide",
    dialogLabel: "Workspace guide",
    progress: "Step {{current}} of {{total}}",
    previous: "Previous",
    next: "Next",
    skip: "Skip guide",
    finish: "Finish guide",
    saveFailed: "Your guide progress could not be saved and may appear again next time.",
    startFailed: "The guide could not be opened. Refresh the page and try again.",
    empty: {
      overview: { title: "Start with a project", content: "Each project keeps its requirements, models, tests, and documents together across the development process." },
      create: { title: "Create your first project", content: "Open the form here, name and describe your project, then choose who can see it. You will enter its workspace after creating it." },
    },
    desktop: {
      system: { title: "Enter system requirements", content: "Describe the business context and goals, then choose a model to generate requirement rules. This guide will not enter text or start a run." },
      feasibility: { title: "Feasibility analysis", content: "Map the system context, business flow, and implementation options. Missing prerequisites are explained here." },
      requirements: { title: "Requirement models", content: "Review requirement rules, choose target models, and inspect their UML diagrams after generation." },
      diagrams: { title: "UML diagrams and traceability", content: "Generated diagrams appear in the model tree, where you can inspect elements and trace relationships." },
      design: { title: "Design models", content: "Once requirements are ready, continue with class, component, and interaction design." },
      
      tests: { title: "Testing", content: "Review test models and coverage, then advance as the required upstream artifacts become available." },
      documents: { title: "Documents and delivery", content: "Find generated specifications and document versions here for review and delivery." },
      tasks: { title: "Generation tasks", content: "Use this top action to inspect active and completed generation tasks and their progress." },
      history: { title: "Run history", content: "Trace previous runs, failures, and restorable workspace records here." },
      management: { title: "Project management", content: "Settings, members, and documents are available at the top. Your project role determines which actions you can take." },
    },
    mobile: {
      system: { title: "Start with requirements", content: "Describe the project goals and context, then generate requirement rules before moving on." },
      analysis: { title: "Analysis and UML", content: "Feasibility, requirement models, and UML diagrams make up the analysis stage. Diagrams appear after generation." },
      build: { title: "Design and tests", content: "Design models provide sources for external agents and test coverage." },
      delivery: { title: "Deliver documents", content: "Specifications collect the earlier artifacts and preserve reviewable document versions." },
      manage: { title: "Track the project", content: "The top bar has tasks, history, settings, and members. Use the upper-left menu to switch stages." },
    },
  },
} as const;
