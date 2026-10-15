<!-- 说明社区版通过服务器本地 Git 检出与 PM2 手动发布的流程。 -->

# 宝塔与 PM2 部署

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 维护中 |
| 目标读者 | 社区部署者与运维人员 |
| 事实来源 | `scripts/deploy/baota-pm2-git-deploy.sh`、`scripts/deploy/nginx-next-routing.mjs` 与 `ecosystem.config.cjs` |

## 概述

社区版提供服务器本地发布脚本，不提供自动生产部署工作流。推送 `main` 只触发仓库 CI。部署者自行准备服务器、源码检出和生产环境，然后手动运行 Git 发布脚本。

Next.js Web、API 和 PlantUML 渲染服务由 PM2 管理，Nginx 负责入口代理。发布使用按提交 SHA 命名的 release，通过健康检查后保留新版本，失败时恢复前一个 release 和对应路由配置。

## 当前设计或配置

### 目录与参数

部署目录包含 `releases/<sha>`、`current` 软链接、`shared/source` 源码检出和 `shared/production.env`。脚本读取 `DEPLOY_PATH`、`SOURCE_DIR`、`RELEASE_SHA` 等环境变量；必须提供要发布的提交 SHA，并提前将源码检出到该提交。

PM2 默认管理 `uml-web`、`uml-api` 和 `uml-render-service`，分别监听本机 `4003`、`4001` 和 `4002`。Web release 包含 Next.js standalone 服务、静态文件和 `public` 资源。可选 Worker 配置参见[生成任务 Worker](generation-workers.md)。

### Nginx

新站点以 [Next.js 站点模板](../../scripts/deploy/nginx-uml-platform.conf)为基础配置域名、TLS 和所需集成，模板的 `root` 路径应与 `DEPLOY_PATH` 对应，供发布脚本识别站点。站点 `/` 代理到 Web，`/api/` 保留 API 路径及 SSE 设置，MCP 发现路径转发到 API。

现有 Vite 站点由 `nginx-next-routing.mjs` 定向迁移。部署脚本先通过 `nginx -T` 只读检查唯一站点和配置写权限，再将已知静态页面配置切换为 Next.js 代理，保留 TLS、API 和 OnlyOffice 配置。原配置保存到 release 的 `nginx-routing-backup.json`，通过 `nginx -t` 后重载，发布失败时恢复。

非标准站点配置会停止部署，需人工核对。Nginx 操作需要 root 或部署账号已有的非交互式 sudo 权限；构建、环境变量加载和 PM2 仍由部署账号执行。可以使用 `NGINX_BIN` 指定 Nginx 可执行文件。旧 Vite 配置仅保留为路由迁移测试夹具。

### 构建与字体

脚本在服务器构建共享包、API、渲染服务和生产 Web，每个包只构建一次。Web 构建要求部署者配置 `PUBLIC_WEB_BASE_URL`。

渲染服务在构建前准备 PDF 字体和许可证，复用本机 `.runtime/pdf-fonts` 缓存，再复制到 `dist/assets/pdf-fonts`。发布脚本检查并复制这些资源。首次准备需要字体来源可访问，或预先准备有效缓存；字体二进制不进入 Git。

## 操作与维护

1. 准备 Node.js 22、Java 21、Graphviz、PM2、PostgreSQL 和 Nginx；启用队列时另行准备 Redis。
2. 在 `shared/source` 检出要发布的提交，在 `shared/production.env` 配置生产变量并限制为部署账号可读，参见[生产环境配置](production-environment.md)。
3. 配置新站点或核对现有 Nginx 配置。可用 `bash scripts/deploy/check-nginx-access.sh <部署目录>` 检查现有权限；它不授予新权限或切换 release。
4. 设置 `DEPLOY_PATH`、`SOURCE_DIR` 和 `RELEASE_SHA`，运行 `bash scripts/deploy/baota-pm2-git-deploy.sh`。脚本构建 release、执行数据库迁移、启动服务并检查健康和公网 SEO。
5. 检查日志和版本。发布失败时确认应用与路由均已回滚；手动回滚时还需加载同一份外部环境文件并重启 PM2。

归档部署入口已停用。不要把生产环境文件、服务器账号或私钥提交到仓库。旧的一致性修复和指纹迁移脚本已移除；需要定向修复设计来源时，使用[生成任务 Worker](generation-workers.md)文档中有备份和版本条件的工具。

## 验证

```bash
npm run test:deploy
pm2 status
curl http://127.0.0.1:4001/api/health
curl http://127.0.0.1:4001/api/version
curl http://127.0.0.1:4002/health
curl http://127.0.0.1:4003/
```

`releaseSha` 应与发布提交一致。公网检查首页、教程入口、登录及一次完整生成。PlantUML 回归需要 Java 和 Graphviz；不能仅凭 Java 退出码或返回 SVG 就判定绘图成功。

部署回归覆盖数据库迁移失败时的进程启动顺序、Nginx 定向迁移与恢复、字体和许可证的离线打包。它们使用隔离目录或模拟依赖，不执行真实发布。

## 相关文档

- [生产环境配置](production-environment.md)
- [生成任务 Worker](generation-workers.md)
- [SEO 运维](seo.md)
- [MCP 接入](../integrations/coding-agent-mcp.md)
- [平台架构](../architecture/platform-overview.md)
