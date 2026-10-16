<!-- 说明社区版应用的搜索索引边界与部署检查。 -->
# SEO 运维

- 维护状态：维护中
- 目标读者：Web 开发与社区部署人员
- 事实来源：Web 根布局、应用路由、robots 与部署验证脚本

## 概述

社区版提供项目工作台，不包含官网宣传首页。所有应用页面默认使用 `noindex, nofollow`，不提供公开营销页面的搜索元信息。

## 当前设计或配置

- 根地址 `/` 在服务端跳转 `/projects`，未登录时沿用登录验证和登录后返回项目列表的流程。
- `robots.txt` 禁止抓取全部路径，不再声明站点地图；`/sitemap.xml` 保留为空地图。
- 首页模板、专用图片、分享封面、规范链接及结构化数据已移除。
- Web 构建不再要求 SEO 域名变量。API 对外访问和 MCP 的部署地址仍按各自配置维护。
- 旧营销子页返回真实 404，旧 `/tutorial` 地址继续跳转线上使用指南。

## 操作与维护

应用入口或认证流程变更时，同步根地址跳转和浏览器检查。不要在私有项目页面发布结构化数据或向站点地图添加应用地址。部署后设置目标地址 `PUBLIC_WEB_BASE_URL`，运行 Web 部署验证脚本。

## 验证

```bash
npm run build:web:production
npm run test:web
npm run typecheck:web
PUBLIC_WEB_BASE_URL=https://community.example.org npm run deployment:verify --workspace @uml-platform/web
```

验证覆盖入口跳转、登录与项目页面的不索引元信息、robots 抓取限制、空站点地图与旧营销地址的 404。

## 相关文档

- [社区版维护](../development/community-edition.md)
- [宝塔与 PM2 部署](baota-pm2.md)
- [生产环境配置](production-environment.md)
