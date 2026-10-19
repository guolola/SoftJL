<!-- 说明平台当前组件边界、核心数据流与运行依赖。 -->

# 平台架构

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 持续维护 |
| 目标读者 | 开发者、架构维护者、部署人员 |
| 事实来源 | `apps/`、`packages/`、工作区脚本与测试 |

## 概述

SoftJL 是 TypeScript monorepo。Web 负责交互与页面编排，API 负责业务合同和生成流水线，渲染服务负责 PlantUML，共享包负责跨应用契约与提示约束。

## 当前设计或配置

### 组件边界

| 组件 | 主要职责 |
| --- | --- |
| `apps/web` | Next.js 页面路由与 AdminCN default-layout 框架、业务功能、领域展示、服务调用与共享 UI |
| `apps/api` | HTTP/SSE 路由、认证授权、生成流水线、记录与文档组装 |
| `apps/render-service` | PlantUML 到 SVG 的隔离渲染 |
| `packages/contracts` | 前后端共享的请求、响应与领域类型 |
| `packages/prompts` | 生成提示、结构化输出规则与版本约束 |
| `packages/harness-e2e` | 跨服务端到端验收 |
| `packages/harness-eval` | 生成质量评估 |

### 后端调用链

API 路由只解析输入并调用领域能力。生成任务按“路由 → 流水线 → 运行记录”的合同推进；外部模型、渲染和文件转换由适配器隔离；文档模块只负责上下文、章节和 DOCX 组装。

### 前端分层

`app` 负责入口与页面组合，`features` 负责业务交互，`entities` 负责领域模型展示，`services` 负责远端调用，`shared` 负责通用 UI 与工具。页面状态不得绕过业务守卫直接触发缺少前置条件的生成。

登录后的平台页和项目工作台共用 `shared/template/layout/default-pages-layout.tsx`。它移植自 AdminCN `default-layout` 的 `src/app/(pages)/layout.tsx`，并组合模板的 Sidebar、SidebarInset、Header 和 Footer；平台业务菜单作为 Sidebar 的内容接入。模板的 `src/components/ui/sidebar.tsx` 已移植到 `shared/ui/sidebar.tsx`，保留可折叠侧栏、移动端抽屉和菜单组件，仅扩展了项目工作台所需的宽度调整。Next.js 的 `app` 路由承载这些页面，登录、项目与业务状态仍由现有功能模块管理。

### 运行依赖

生产环境使用 PostgreSQL 持久化、Redis/BullMQ 承载队列、PM2 运行 Next.js Web、API 和渲染服务、Nginx 负责反向代理。文档使用浏览器内 DOCX 预览与下载，无需额外编辑服务器。

## 操作与维护

- 新增端点时保持共享契约、路由、流水线和测试同步。
- 修改生命周期时检查排队、运行、完成、失败、重试与 SSE 终止事件。
- 修改领域数据时同步追踪矩阵、覆盖检查和文档生成上下文。
- 外部系统调用继续放在适配器中，不把供应商细节散落到路由或页面。

## 验证

```bash
npm run audit:architecture
npm run test:contracts
npm run test:api
npm run test:web
npm run build
```

架构变化还应通过相应端到端场景验证跨阶段产物是否保持可追踪。

## 相关文档

- [可信生成链路](trusted-generation.md)
- [生成任务 Worker](../deployment/generation-workers.md)
- [生产环境配置](../deployment/production-environment.md)
- [仓库治理规范](../development/repository-hygiene.md)
