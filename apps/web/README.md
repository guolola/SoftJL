# Web 应用

## 职责

提供社区版账号与项目工作台，以及模型、任务、文档和操作指引界面。

## 边界

`app` 负责页面编排，`features` 负责业务交互，`entities` 负责领域表示，`services` 负责服务访问，`shared` 提供共享基础能力。保留工作台模板的独立组件、视觉和来源记录；不提供官网宣传页、考试或平台计费。

## 使用或常用命令

在仓库根目录运行 `npm run build:packages` 后，使用 `npm run dev:web`、`npm run test:web` 和 `npm run typecheck:web`。

## 配置

编译配置继承根配置并保留浏览器与 Next.js 选项。测试初始化、通用夹具和辅助组件位于 `tests/`，通过 `@test/*` 引用；模块测试与源码相邻。

## 验证

检查用户可见状态、前置条件、键盘操作和异常反馈。浏览器验收由独立端到端测试工作区承担。

## 相关文档

- [项目首页](../../README.md)
- [共享 UI](src/shared/ui/README.md)
- [仓库治理规范](../../docs/development/repository-hygiene.md)
