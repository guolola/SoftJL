<!-- 汇总生产环境变量分组、保管边界与验证方法。 -->

# 生产环境配置

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 生产使用 |
| 目标读者 | 后端开发、部署与安全运维人员 |
| 事实来源 | 源码中的环境变量读取、部署脚本与工作流 |

## 概述

生产配置保存在部署目录外的 `shared/production.env`，由部署脚本在启动 PM2 前加载。仓库只记录变量名称和用途，不保存真实值。

## 当前设计或配置

### 基础服务

| 变量 | 用途 |
| --- | --- |
| `NODE_ENV` | 生产环境应为 `production` |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `DATABASE_POOL_MAX` | 数据库连接池上限 |
| `REDIS_URL` | BullMQ 与生成 Worker 使用的 Redis |
| `API_HOST`、`API_PORT` | API 监听地址与端口 |
| `RENDER_SERVICE_URL` | API 调用渲染服务的地址 |
| `PLANTUML_SERVER_URL` | 可选的外部 PlantUML 服务地址 |

### 公网与跨域

| 变量 | 用途 |
| --- | --- |
| `PUBLIC_WEB_BASE_URL` | 对外 Web 根地址 |
| `PUBLIC_API_BASE_URL` | 对外 API 根地址 |
| `API_CORS_ORIGINS` | API 允许的 Web 来源 |
| `RENDER_SERVICE_CORS_ORIGINS` | 渲染服务允许的来源 |

### 邮件、文档与支付

| 变量 | 用途 |
| --- | --- |
| `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE` | SMTP 服务器连接 |
| `SMTP_USER`、`SMTP_PASS`、`SMTP_FROM` | 发信账号、凭据与发件人 |
| `ONLYOFFICE_DOCUMENT_SERVER_URL` | OnlyOffice 对外地址 |
| `ONLYOFFICE_JWT_SECRET` | 与 Document Server 一致的 JWT 密钥 |
| `ONLYOFFICE_ACCESS_TOKEN_SECRET` | 文档访问令牌签名密钥 |
| `ONLYOFFICE_CALLBACK_MAX_BYTES` | 回调体积上限 |
| `UML_DOCUMENT_STORAGE_DIR` | 文档存储目录 |
| `UML_AVATAR_STORAGE_DIR` | 头像存储目录 |
| `EPAY_*` | 支付网关、商户、签名与回调配置 |

### 模型与生成

`UML_PROVIDER_SECRET_KEY` 用于保护供应商凭据；`UML_LLM_*` 控制模型请求并发、超时和重试；`UML_*_STORAGE_DIR` 指定持久化目录。具体可选项以源码读取和部署环境模板为准。

| 变量 | 用途 |
| --- | --- |
| `UML_PROVIDER_BREAKER_COOLDOWN_SECONDS` | Provider 连续失败触发保护后的自动探测冷却时间，默认 `300` 秒 |

## 操作与维护

- 将文件放在 release 目录之外，并设置为仅部署用户可读写的 `600` 权限。
- 变量变更后通过部署脚本或 PM2 重新加载环境，不在终端历史中直接暴露密钥。
- SMTP 使用专用发信服务与授权凭据，不使用个人邮箱密码。
- 定期轮换供应商、邮件、支付与 OnlyOffice 密钥；变更后完成专项验证。
- 禁用生产环境中的开发回退、演示账号和宽松供应商策略。

### Provider 熔断恢复

Provider 连接测试或模型发现连续失败三次后会进入保护状态。先根据请求时间和请求编号检查安全化日志中的失败类型与上游状态码；修复网络、Base URL、凭据或供应商服务后，由具备 `admin.provider_configs.write` 权限的管理员调用现有重置接口。不要查询或输出明文密钥。

若未手动重置，冷却期结束后的第一个生成请求会取得单实例探测租约并执行最长 30 秒的轻量健康检查。探测成功后自动关闭保护并继续生成；失败则重新开始冷却。并发请求只会收到剩余等待时间，不会重复探测。

### 移除旧代码功能时的发布顺序

本版本启动时执行 `030_retire_code_prototypes` 清理迁移。发布前备份数据库，停止所有旧 API 实例和生成 Worker，确认它们不会重启；处理仍排队或执行中的代码任务，移除队列中的旧代码任务，保留其他阶段任务。随后执行新版本数据库迁移并启动新 API 与 Worker。不得在新旧 API 混跑期间执行清理，以免旧进程重新写入代码产物。

迁移删除旧代码运行及其关联事件，按明确字段清单清理工作区、保留阶段的历史快照和事件中的代码产物与引用；受影响工作区版本递增。其他阶段、已有文档和账务记录保留，原型界面关系图及 PlantUML 源码保留。迁移可重复执行，旧代码快照不能恢复到工作区。

## 验证

```bash
test "$(stat -c %a shared/production.env)" = "600"
curl http://127.0.0.1:4001/api/health
curl http://127.0.0.1:4001/api/version
curl http://127.0.0.1:4002/health
```

另外验证注册邮件、模型连通性、文档编辑回调和支付回调。日志只能记录配置是否存在，不能输出密钥值。

Provider 恢复后还需验证一次连接测试和一次仅生成需求规则的任务，并确认错误响应只包含失败次数、恢复时间、探测状态与请求编号等安全字段。

## 相关文档


- [宝塔与 PM2 部署](baota-pm2.md)
- [生成任务 Worker](generation-workers.md)
- [OpenAI 兼容供应商](../integrations/openai-compatible-provider.md)
