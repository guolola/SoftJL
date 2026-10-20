// Stores the user-provided MCP announcement used by the local PostgreSQL demo.
import type { SystemNoticeCreateRequest } from "@uml-platform/contracts";

export const demoMcpNotice: SystemNoticeCreateRequest = {
  title: "MCP 功能上线啦！连接你的 AI 编程助手",
  type: "feature_update",
  status: "published",
  icon: "🎉",
  publishedAt: null,
  contentBlocks: [
    "🎉 SoftJL 已开通 MCP 功能！现在，可以把平台保存的设计成果交给支持 MCP 的 AI 编程助手，继续开展代码实现、代码核对和测试。",
    "🔗 接入入口：在项目列表左侧打开「编程助手」，选择客户端并点击「查看接入指南」，按页面提示完成配置与授权。",
    "📚 实现依据：编程助手可按需读取已保存的设计模型、PlantUML、验收条件、工程约束和测试资料，按平台设计完成实现。",
    "🔄 持续协作：平台资料更新后，可以助手检查新增、修改、删除和过期变化，重新读取相关依据，再继续调整代码与测试。",
    "🔐 授权可控：支持浏览器授权和个人令牌，按账号当前项目权限读取资料；不用使用的连接可在「连接记录」中随时撤销。",
    "🧩 体验建议：先完成并保存设计，再告诉助手项目名称和实现目标，从一个具体功能开始，把建模成果用到你的代码仓库中。",
    "💡 当前 MCP 提供只读访问；代码编写和测试由外部编程助手执行。欢迎体验从建模到实现的新协作方式！",
  ].map(text => ({ kind: "paragraph", text })),
};
