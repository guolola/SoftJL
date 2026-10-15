<!-- 说明社区贡献的范围、复现信息和提交前检查。 -->
# 贡献指南

欢迎提交可复现的问题与范围明确的改进。首次运行参见 [README](README.md)，社区能力范围见 [社区版维护](docs/development/community-edition.md)。

## 报告问题

通过仓库 Issue 模板提供版本或提交号、运行环境、最短复现步骤、预期与实际结果。附上经过脱敏的错误编号或日志；不要上传 `.env`、数据库、会话 Cookie、模型密钥或完整私人需求。

安全漏洞请按 [安全披露指引](security.md) 私密报告。

## 修改边界

- 遵循 [项目约定](AGENTS.md)，保持 `apps/` 与 `packages/` 工作区以及前后端现有分层。
- 行为修改附上能复现问题的回归测试，优先运行相关模块；不要以删除有效断言或关闭类型检查解决失败。
- 按职责提取纯规则与共享流程，避免继续扩充入口和页面状态文件。大型重构与功能修改分开提交，说明兼容性影响。
- 保留第三方来源和许可声明，不提交生成产物、缓存、运行数据、密钥或临时审查记录。

## 本地验证

```bash
npm ci
npm run build:packages
npm run lint:web
npm run typecheck:web
npm run typecheck:harness-eval
npm run audit:docs
npm audit --audit-level=high
```

按改动运行 `test:contracts`、`test:prompts`、`test:api`、`test:render`、`test:web`、`test:harness-eval`、`test:deploy` 或 `test:scripts`。前端流程或布局修改运行 `npm run test:harness-e2e`；首次需安装 Playwright Chromium。CI 还使用隔离 PostgreSQL 验证跨进程迁移，真实模型与 OnlyOffice 需在自己的配置下验收。

提交 PR 时说明触发条件、修改后的行为、实际执行的检查和未验证部分。涉及文档时同步中英文入口以及配置名称。
