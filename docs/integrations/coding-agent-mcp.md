<!-- 说明社区版编程助手接入、授权边界与部署验证。 -->
# 编程助手 MCP 接入

- 维护状态：维护中
- 目标读者：社区部署者、开发者与项目使用者
- 事实来源：`apps/api/src/mcp/`、`apps/api/src/routes/mcp/`、`apps/web/src/features/mcp-connections/` 及对应测试

## 概述

社区版向外部编程助手提供已保存的设计、验收条件、工程约束与测试资料。连接页复用完整版的客户端目录、配置示例、使用示例及连接记录。平台提供只读资料，代码实现、仓库修改和测试运行由用户自己的编程助手完成。

## 当前设计或配置

### 工具与资料边界

| 工具 | 用途 |
| --- | --- |
| `list_projects` | 列出获授权且用户仍有查看权限的项目 |
| `get_implementation_context` | 获取设计上下文、资料目录、任务与来源版本 |
| `get_artifact` | 按需读取资料分块、实施任务包、报告契约与验证器下载信息 |
| `check_context_updates` | 比较已应用版本，识别新增、修改与删除的资料 |

接口不输出供应商密钥、完整工作区快照、原始需求正文、需求模型、质量评审或说明书。不调用平台模型，不执行仓库命令。缺失设计、来源过期或模型与图源不同步会在上下文中提示。

实施任务包与本地报告通过任务 ID、来源版本、文件引用和测试记录关联。通用本地验证器核对引用与文件哈希；只有用户在自己的环境显式启用 `--run-checks` 时才运行登记命令。验证器不证明实现语义一定正确。

### 授权与连接

浏览器授权采用 OAuth 授权码与 PKCE；其他客户端可使用个人令牌。两者默认要求选择项目；只有明确选择“账号可访问的全部项目”才包含以后创建或加入的项目。空选择不等于全部授权。

每次调用重新检查账号状态、授权有效期和项目成员权限。撤销后个人令牌、OAuth 访问令牌与刷新凭证停止访问。访客账号不能建立连接。个人令牌只展示一次，服务端仅保存哈希，前端不写入本地存储。

界面创建的授权有效期为 30 天，个人令牌 API 支持 1 至 90 天。“连接成功”表示发生过成功工具调用，不代表持续在线。客户端目录提供配置说明，具体客户端与版本仍需实机验收。

### 服务配置

| 变量 | 说明 |
| --- | --- |
| `MCP_ENABLED` | 仅为 `true` 时启用，默认关闭 |
| `MCP_PUBLIC_ORIGIN` | 服务源地址，不带 `/api/mcp` 路径；生产必须为 HTTPS |
| `MCP_WEB_ORIGIN` | 平台登录与授权页面源地址，生产建议与公开服务源地址一致 |
| `MCP_SHARED_SECRET` | 至少 32 字符的随机密钥，所有实例保持一致 |
| `MCP_JWKS` | 含私钥的签名 JWK 集合 JSON，生产必须固定保存并在实例间共享 |
| `MCP_OAUTH_CLIENTS` | 可选的预注册 OAuth 客户端元数据数组 |
| `MCP_CIMD_ORIGINS` | 可选的客户端元数据可信来源，逗号分隔；默认不允许外部 CIMD 来源 |
| `DATABASE_URL` | 生产必须使用 PostgreSQL 持久化授权、撤销、OAuth 实体和限流状态 |

开发环境允许临时密钥和内存存储，重启后旧连接可能失效。生产缺少公开地址、固定密钥或数据库时拒绝启用。私钥和令牌不能提交到仓库。

## 操作与维护

### 本地启动与使用

先完成[仓库 README](../../README.md)的首次安装与构建，然后运行：

```bash
npm run dev:mcp
```

此命令启动现有开发服务，并为前端本地地址启用 MCP。使用自己的注册账号登录，进入侧栏“编程助手”；也可以从项目设置点击“连接此项目”，预选当前项目。服务地址直接从连接页复制。

选择客户端并按其配置说明连接。浏览器授权在回跳平台时选择项目；个人令牌在配置弹窗中选择项目并填写名称。令牌保存在客户端凭据或环境变量中。首次让助手列出授权项目并读取已保存设计，检查连接记录出现成功调用时间。

普通 `npm run dev` 保持默认关闭；连接页会说明服务尚未启用。关闭开关后，核心建模流程继续可用，MCP 协议入口不再注册。

### 生产部署

使用独立社区数据库，配置上述变量并完成应用构建；API 启动时应用数据库迁移。PM2 配置会传递 MCP 变量，更新后使用 `--update-env` 重启对应应用。密钥由部署者的秘密存储管理，轮换时安排重新授权。

反向代理需要把 `/api/mcp`、`/api/mcp/*` 和以下发现路径转发到 API：

- `/.well-known/oauth-protected-resource` 及其 `/api/mcp` 子路径
- `/.well-known/oauth-authorization-server/api/mcp/oauth`
- `/.well-known/openid-configuration/api/mcp/oauth`

Next.js 已提供发现路径与 API 转发。若前置 Nginx 对 `/.well-known/` 有证书验证专用规则，应为上述路径设置更精确的转发规则并保留证书验证路径。传递正确的 Host 与协议，关闭 MCP 流式响应的代理缓存和缓冲；不要把任意公网请求伪装成本地可信代理。

数据表为 `mcp_connections`、`mcp_oauth_entities` 和 `mcp_rate_limits`。迁移明确记录 `project_scope`；缺少显式范围的旧记录按所选项目处理，不把空列表提升为账号权限。社区版不注册运营后台 MCP 接口。

## 验证

```bash
npm run build:contracts
npm run build:api
npm run test:web -- src/features/mcp-connections src/app/app-routes.test.ts
node --import tsx --test apps/api/src/routes/mcp/register-mcp-routes.test.ts apps/api/src/mcp/records/postgres-mcp-store.test.ts
npm run audit:docs
```

API 测试覆盖官方 SDK HTTP 调用、OAuth 两种范围的 PKCE/刷新/撤销、跨用户和项目访问、分页版本、白名单与权限变化。数据库测试执行真实 PostgreSQL SQL。浏览器测试覆盖连接页在桌面和手机宽度下的选择与一次性令牌展示。

部署后仍需用目标客户端验收真实登录回跳、服务发现、凭据存储、项目读取、来源更新和撤销。构建通过或复制配置成功不代表外部客户端已经验收。

## 相关文档

- [社区版边界](../development/community-edition.md)
- [API MCP 模块](../../apps/api/src/mcp/README.md)
- [宝塔与 PM2 部署](../deployment/baota-pm2.md)
- [线上使用指南](https://jianglisoftware.com/tutorial)
