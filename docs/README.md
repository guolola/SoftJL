<!-- 作为项目技术文档的统一索引与维护入口。 -->

# 项目文档

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 持续维护 |
| 目标读者 | 使用者、开发者、部署与运维人员 |
| 事实来源 | 当前源码、测试、工作区脚本与 GitHub Actions |

## 概述

这里收录仍然有效的架构、部署、开发与集成文档。面向最终用户的操作手册统一使用[线上使用指南](https://jianglisoftware.com/tutorial)，社区版不再维护本地教程页面；旧 `/tutorial` 地址及其子路径会跳转到线上对应地址。

## 当前设计或配置

### 架构

- [平台架构](architecture/platform-overview.md)
- [可信生成链路](architecture/trusted-generation.md)
- [普通项目 Agent](architecture/standard-project-agent.md)

### 部署

- [宝塔与 PM2 部署](deployment/baota-pm2.md)
- [生成任务 Worker](deployment/generation-workers.md)
- [生产环境配置](deployment/production-environment.md)
- [SEO 运维](deployment/seo.md)

### 开发与集成

- [仓库治理规范](development/repository-hygiene.md)
- [编程助手 MCP 接入](integrations/coding-agent-mcp.md)
- [OpenAI 兼容供应商](integrations/openai-compatible-provider.md)

## 操作与维护

更新实现时，以代码、环境变量读取位置和工作流为事实源同步修改对应文档。历史计划、审计流水和一次性排障记录不作为活文档保留。

## 验证

```bash
npm run audit:docs
```

该命令检查命名、标题结构、必需章节、相对链接、索引完整性和禁止跟踪的杂物。

## 相关文档

- [仓库首页（English）](../README.md)
- [项目介绍（简体中文）](../readme-zh-cn.md)
- [项目协作规范](../AGENTS.md)
- [线上使用指南](https://jianglisoftware.com/tutorial)
