<!-- 说明 main 分支通过 GitHub Actions 发布到宝塔与 PM2 的当前流程。 -->

# 宝塔与 PM2 部署

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 生产使用 |
| 目标读者 | 部署与运维人员 |
| 事实来源 | `.github/workflows/deploy.yml` 与 `scripts/deploy/baota-pm2-git-deploy.sh` |

## 概述

推送 `main` 后，部署工作流会测试、构建并通过 SSH 在服务器创建按提交 SHA 命名的 release。Next.js Web、API 和 PlantUML 渲染服务由 PM2 管理，Nginx 负责入口代理。

归档包部署入口 `baota-pm2-deploy.sh` 仍依赖旧的 Vite 产物，迁移后已停用；生产发布使用本页所述的 Git 部署入口。

## 当前设计或配置

### GitHub Secrets

| 名称 | 用途 |
| --- | --- |
| `DEPLOY_HOST` | 目标服务器地址 |
| `DEPLOY_USER` | SSH 用户 |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_SSH_KEY` | SSH 私钥 |
| `DEPLOY_PATH` | 部署根目录，可使用脚本默认值 |

### 目录与进程

部署根目录默认包含 `releases/<sha>`、`current` 软链接和 `shared/production.env`。PM2 进程为 `uml-web`、`uml-api` 与 `uml-render-service`；分别监听 `4003`、`4001` 与 `4002`。Web release 包含 Next.js standalone 服务、`_next` 静态文件与 `public` 资源。

### Nginx

站点 `/` 代理到 Next.js Web 进程；`/api/` 仍原样代理到 API，保留 SSE 的关闭缓冲与读取超时设置。首页由 Next.js 输出可索引元信息，登录及业务路由带有 `noindex`，未知地址返回真实 404。

旧的 `/features`、`/workflow`、`/cases` 和 `/pricing` 返回 404。部署脚本通过 `nginx -T` 定位唯一匹配已知 Web 根目录的站点，把原 Vite 页面块迁移为 Next.js 代理，同时保留 TLS、API 和 OnlyOffice 配置。原配置备份到 release 目录的 `nginx-routing-backup.json`，通过 `nginx -t` 后才重载；健康或 SEO 检查失败时同时恢复应用和路由配置。非标准配置会停止部署，需人工核对；可用 `NGINX_BIN` 指定 Nginx 可执行文件。

在构建与切换 `current` 前，脚本先只读预检站点匹配、路由形态和配置写权限。Nginx 迁移由 root 执行；非 root 部署账号需要对新的 `nginx-next-routing.mjs` helper 具有现成的 `sudo -n` 权限，构建、环境变量加载和 PM2 仍由原部署账号执行。脚本不修改 sudoers 或证书权限，也不请求密码；权限不足会提前停止并保留线上版本。路由恢复失败不会阻止应用回滚，但部署仍报告失败，需人工处理配置。

### PDF 字体

工作流比较本次构建字体及许可证与服务器缓存的 SHA-256。内容一致时，在清理源码目录前将缓存暂存为部署归档；缺失或不一致时上传构建产物。服务器恢复归档后离线准备 PDF 字体，字体二进制不进入 Git。

源码包传输上限为 120 秒，字体缓存检查上限为 60 秒，必要的字体上传上限为 600 秒。日志分别标记源码传输、字体复用或上传、服务器构建与健康检查，超时会报告失败。

## 操作与维护

1. 在服务器准备 Node.js 22、Java 21、Graphviz、PM2、PostgreSQL、Redis 和 Nginx。
2. 将生产变量保存在 `shared/production.env`，权限设为 `600`。
3. 在仓库配置五项部署 Secret，推送 `main`。
4. 工作流切换 `current` 后重启 PM2，并自动检查 Web、API 与渲染服务健康状态。
5. 需要回滚时把 `current` 切回已验证的 release，并重新加载同一份外部环境文件后重启进程。

不要把生产环境文件、服务器地址、账号或私钥提交到 Git。

部署权限排查可在 `Deploy to BaoTa PM2` 的手动运行界面选择 `preflight_only`。该模式仅检查部署账号现有的 Nginx 校验与非交互式 sudo 权限，不修改配置、切换 release 或重启服务，也不会授予新权限；它与生产部署使用独立的并发组。

## 验证

```bash
pm2 status
curl http://127.0.0.1:4001/api/health
curl http://127.0.0.1:4001/api/version
curl http://127.0.0.1:4002/health
curl http://127.0.0.1:4003/
```

`/api/version` 的 `releaseSha` 应与部署提交一致。公网还应检查首页、`/tutorial`、登录流程和一次完整生成。

工作区 Node 测试入口给 `src/**/*.test.ts` 加引号，由测试运行器展开所有目录层级；不要让 Linux Shell 提前展开并漏掉根目录或深层测试。PlantUML 回归从 `JAVA_HOME/bin` 按操作系统选择 `java` 或 `java.exe`，与 Actions 中的 Java 21 配置一致。

CI 与部署工作流显式安装 Graphviz，并把实际 `dot` 路径写入 `GRAPHVIZ_DOT`。绘图回归要求 SVG 包含预期元素标识；Java 退出码为零或返回 SVG 错误图片不能视为绘图成功。

路由迁移的本地回归检查为 `node --test scripts/deploy/nginx-next-routing.test.mjs`。

字体缓存复用、内容变化或缺失时拒绝复用，以及离线字体准备的回归检查为 `node --test scripts/deploy/pdf-font-assets.test.mjs`。

## 相关文档

- [生产环境配置](production-environment.md)
- [生成任务 Worker](generation-workers.md)
- [SEO 运维](seo.md)
- [平台架构](../architecture/platform-overview.md)
