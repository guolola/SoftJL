<!-- 说明 API 服务的职责、边界、运行配置与验证入口。 -->

# API 服务

## 职责

提供社区版账号、项目、需求、模型、设计、测试、文档和生成任务等 HTTP/SSE 接口，并编排生成流水线与持久化。平台支付、计费及运营管理接口不在社区版范围内。

## 边界

- `src/routes/<domain>/` 负责注册端点、解析契约并调用流水线或适配器。
- `src/runs/pipelines/` 负责业务阶段、事件与状态迁移。
- `src/runs/records/` 负责运行记录和生命周期状态。
- `src/adapters/` 负责模型、PlantUML、渲染与文件转换等外部系统。
- `src/documents/` 负责文档上下文、章节和 DOCX 组装。

入口文件 `src/index.ts` 负责服务组装、启动及导出服务器工厂，不承载业务职责。

模块测试与源码相邻，跨业务域流程位于 `tests/integration/`，专用夹具位于 `tests/fixtures/`；共享夹具通过 `@uml-platform/contracts/testing` 使用，冻结演示数据通过 `@uml-platform/demo-fixtures` 使用。API 构建会复制快速建模运行时规则、技能和参考资料，部署时保留完整 dist。

## 使用或常用命令

```bash
npm run dev --workspace @uml-platform/api
npm run build --workspace @uml-platform/api
npm run test --workspace @uml-platform/api
npm run test:integration --workspace @uml-platform/api
```

根目录的 `npm run dev` 会以本地安全配置启动 API，并将端口设为 `4101`；工作区单独启动时默认端口为 `4001`。

## 配置

生产配置从部署目录外的 `production.env` 加载，至少需要数据库、跨域、模型供应商加密、渲染和文档存储相关变量。不要在仓库内保存真实凭据。

## 验证

```bash
npm run build:packages
npm run test:api
```

运行服务后检查 `/api/health` 和 `/api/version`。

## 相关文档

- [平台架构](../../docs/architecture/platform-overview.md)
- [生产环境配置](../../docs/deployment/production-environment.md)
- [模型供应商集成](../../docs/integrations/openai-compatible-provider.md)
