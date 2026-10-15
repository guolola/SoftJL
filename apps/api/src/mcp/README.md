# MCP 模块

## 职责

向外部编程助手提供经用户授权的已保存设计、验收条件、工程约束与测试资料，维护四个只读工具、来源版本与实施报告契约。

## 边界

`auth/` 管理 OAuth、个人令牌与显式项目授权；`records/` 管理连接、撤销和共享持久化；`context/` 按白名单提取资料；`tools/` 负责只读工具和分页；`verification/` 分发通用本地验证器；`server/` 组装模块。HTTP 适配位于 [`routes/mcp/`](../routes/mcp/register-mcp-routes.ts)。

空项目列表不隐含账号权限。每次读取检查当前账号、授权与成员权限；访客不能授权。不读取供应商密钥或输出完整工作区，不启动 LLM、代码执行或运营后台接口。原始需求、需求模型、质量评审和说明书不进入编码上下文。

## 使用或常用命令

仓库根目录运行 `npm run dev:mcp`。修改共享契约后先执行 `npm run build:contracts`，再执行 `npm run build:api`。

## 配置

默认关闭。`MCP_ENABLED=true` 启用 `/api/mcp`、授权和发现入口。生产必须配置公开 HTTPS 源地址、共享密钥、签名私钥与 PostgreSQL。详见[接入文档](../../../../docs/integrations/coding-agent-mcp.md)。

## 验证

路由测试覆盖实际 SDK、OAuth PKCE、授权范围和撤销；数据库测试覆盖迁移、跨实例访问、原子消费及重启。上下文测试覆盖白名单、来源版本与本地验证器。配置示例不等于实机兼容性验收。

## 相关文档

- [接入与部署](../../../../docs/integrations/coding-agent-mcp.md)
- [共享契约](../../../../packages/contracts/src/mcp/index.ts)
- [社区版边界](../../../../docs/development/community-edition.md)
