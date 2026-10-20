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
| `RENDER_SERVICE_BASE_URL` | API 调用渲染服务的地址 |
| `PLANTUML_SERVER_URL` | 可选的外部 PlantUML 服务地址 |

### 公网与跨域

| 变量 | 用途 |
| --- | --- |
| `PUBLIC_WEB_BASE_URL` | 对外 Web 根地址 |
| `PUBLIC_API_BASE_URL` | 对外 API 根地址 |
| `API_CORS_ORIGINS` | API 允许的 Web 来源 |
| `RENDER_SERVICE_CORS_ORIGINS` | 渲染服务允许的来源 |

### 账号与文档

| 变量 | 用途 |
| --- | --- |
| `UML_DOCUMENT_STORAGE_DIR` | 文档存储目录 |
| `UML_AVATAR_STORAGE_DIR` | 头像存储目录 |

### 模型与生成

`UML_PROVIDER_CONFIG_SECRET` 用于保护供应商凭据；`UML_LLM_*` 控制模型请求并发、超时和重试；`UML_*_STORAGE_DIR` 指定持久化目录。具体可选项以源码读取和部署环境模板为准。

| 变量 | 用途 |
| --- | --- |
| `UML_PROVIDER_BREAKER_COOLDOWN_SECONDS` | Provider 连续失败触发保护后的自动探测冷却时间，默认 `300` 秒 |

## 操作与维护

- 将文件放在 release 目录之外，并设置为仅部署用户可读写的 `600` 权限。
- 变量变更后通过部署脚本或 PM2 重新加载环境，不在终端历史中直接暴露密钥。
- 定期轮换供应商密钥；变更后完成专项验证。
- 禁用生产环境中的开发回退、演示账号和宽松供应商策略。

### Provider 熔断恢复

Provider 连接测试或模型发现连续失败三次后会进入保护状态。先根据请求时间和请求编号检查安全化日志中的失败类型与上游状态码；修复网络、Base URL、凭据或供应商服务后，等待冷却期结束后的自动探测。社区版没有运营后台的重置接口。不要查询或输出明文密钥。

冷却期结束后的第一个生成请求会取得单实例探测租约并执行最长 30 秒的轻量健康检查。探测成功后自动关闭保护并继续生成；失败则重新开始冷却。并发请求只会收到剩余等待时间，不会重复探测。

### 当前数据库基线

v2.2.3 使用单一 `current_platform_schema_v3` 安装基线，不再执行旧社区版迁移链或历史数据清理。首次部署创建空数据库，将 `DATABASE_URL` 指向新库；已采用该基线的数据库可继续使用，v1、v2 及更早记录会被拒绝。项目仅保留项目与成员关系，不包含组织、课程、班级、团队及其配额表。API 与 Worker 只连接当前基线的数据库，不会自动迁移或清空旧库。来源映射不再接受 `reviewStatus`、`confidence` 或 `auto-filled-pending-review`；含旧元数据的工作区需重新创建项目与模型，不自动转换。

构建 API 后，先运行 `node apps/api/dist/db/migrate.js --check` 只读检查目标库，再运行 `node apps/api/dist/db/migrate.js` 初始化。旧迁移记录或无版本的已有表会被兼容检查拒绝，不按旧库升级方式部署。

## 验证

```bash
test "$(stat -c %a shared/production.env)" = "600"
curl http://127.0.0.1:4001/api/health
curl http://127.0.0.1:4001/api/version
curl http://127.0.0.1:4002/health
```

账号采用用户名注册与登录，项目邀请在站内通知中接受或拒绝，无需 SMTP。另需验证注册登录、邀请通知、模型连通性、DOCX 预览和下载。日志只能记录配置是否存在，不能输出密钥值。

Provider 恢复后还需验证一次连接测试和一次仅生成需求规则的任务，并确认错误响应只包含失败次数、恢复时间、探测状态与请求编号等安全字段。

## 相关文档


- [宝塔与 PM2 部署](baota-pm2.md)
- [生成任务 Worker](generation-workers.md)
- [OpenAI 兼容供应商](../integrations/openai-compatible-provider.md)
