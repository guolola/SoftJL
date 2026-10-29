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

### 任务路由

SoftJL Community 是支持需求、UML、测试与工程说明书的自托管 TypeScript monorepo。本索引承担 PROJECT_INDEX 职责；项目用途和基本使用见[仓库首页](../README.md#overview)。下列入口是条件路由，不是必读清单；定位后继续选择相关章节、条目或配置项。

| 当前任务 / 文档职责 | 权威入口或路由 | 何时更新 |
| --- | --- | --- |
| 接手项目、确认长期规则和读写要求 | [AGENTS.md](../AGENTS.md) | 长期约定变化时 |
| 了解用途、能力与基本使用 | [README.md](../README.md#overview) | 实际能力和使用方式变化时 |
| 定位资料及正确写入位置（PROJECT_INDEX） | 本节 | 入口或职责变化时，不复制专题正文 |
| 接续目标、进展、阻塞与下一步（NOW） | [当前交接](context/now.md) | 状态实质变化且任务允许记录时 |
| 定位目录、版本、配置和部署对象（MAP） | [目录与运行映射](#目录与运行映射) | 映射或入口变化时 |
| 查找操作、前置条件与验证步骤（RUNBOOK） | [操作路由](#操作路由) | 操作方法或验证要求变化时 |
| 理解已确认决策、理由、范围和来源 | [决策](context/decisions.md) | 决策确认或被替代时 |
| 定位问题、风险与验证缺口 | [风险](context/risks.md) | 相关证据或状态变化时 |
| 追溯有价值的历史记录 | [历史索引](context/history/README.md) | 必要归档发生时，先搜索再读 |

沿用既有专题，不另建 PROJECT_INDEX、MAP、RUNBOOK 或无独立用途的 PROJECT_NOTES。以后遇到已有项目笔记，保留有效内容并补充专题入口，按任务检索，不复制其全部内容。

### 目录与运行映射

本节只路由关系说明；代码和配置是实现事实依据，实际运行环境须单独核实。

| 定位对象 | 说明与事实入口 |
| --- | --- |
| 应用、共享包、脚本与测试边界 | [仓库目录归属](development/repository-hygiene.md#结构)、[组件边界](architecture/platform-overview.md#组件边界) |
| API 调用链与前端分层 | [后端调用链](architecture/platform-overview.md#后端调用链)、[前端分层](architecture/platform-overview.md#前端分层) |
| 社区版与官网版职责边界 | [社区版维护](development/community-edition.md#当前设计或配置) |
| 版本声明与升级约束 | [package.json](../package.json) 的 `version`、[版本与升级](../README.md#release-and-upgrades)、[发布说明](../release-notes.md) |
| 本地启动、持久化与配置 | [快速开始](../README.md#quick-start)、[生产配置](deployment/production-environment.md#当前设计或配置)；按需定位配置项，不读取本地密钥文件 |
| 生产 release、共享目录与 PM2 服务 | [部署目录与参数](deployment/baota-pm2.md#目录与参数)；实际服务器、目录实例与运行版本待核实 |
| 可选 MCP 服务与客户端接入 | [服务配置](integrations/coding-agent-mcp.md#服务配置) |

### 操作路由

执行对应操作前，读取下列相关章节，确认前置条件、验证步骤与当前授权。命令已配置不代表执行成功，文档步骤不构成执行授权；当前执行证据统一记录在交接状态或对应专题中。

| 对应操作 | 前置条件、步骤与验证入口 |
| --- | --- |
| 安装、启动与模型配置 | [快速开始](../README.md#quick-start)（含环境要求和健康检查）、[常用命令](../README.md#common-commands) |
| 社区版维护与升级 | [操作与维护](development/community-edition.md#操作与维护)、[验证](development/community-edition.md#验证)、[发布与升级](../README.md#release-and-upgrades) |
| 文档治理与提交检查 | [仓库治理](development/repository-hygiene.md#操作与维护)、[验证要求](development/repository-hygiene.md#验证) |
| 生产配置与部署 | [生产配置维护](deployment/production-environment.md#操作与维护)、[配置验证](deployment/production-environment.md#验证)、[部署步骤](deployment/baota-pm2.md#操作与维护)、[部署验证](deployment/baota-pm2.md#验证) |
| MCP 接入与验收 | [接入步骤](integrations/coding-agent-mcp.md#操作与维护)、[验收边界](integrations/coding-agent-mcp.md#验证) |

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

- [社区版维护](development/community-edition.md)
- [仓库治理规范](development/repository-hygiene.md)
- [编程助手 MCP 接入](integrations/coding-agent-mcp.md)
- [OpenAI 兼容供应商](integrations/openai-compatible-provider.md)

## 操作与维护

更新实现时，以代码、环境变量读取位置和工作流为事实源同步修改对应文档。历史计划、审计流水和一次性排障记录不作为活文档保留。

按[任务路由](#任务路由)选择写入位置：专题事实在原处修订，本索引只维护入口和职责；当前进展、已确认决定和风险分别写入对应上下文文件。读取与写入的长期规则统一由 [AGENTS.md](../AGENTS.md#context-reading-rules)维护。

## 验证

```bash
npm run audit:docs
```

该命令检查命名、标题结构、必需章节、相对链接、索引完整性和禁止跟踪的杂物。

以上为配置的全仓库检查命令，不代表本次已执行。仅限文档改动的任务应按授权检查本次文件及直接关联链接；具体执行范围和结果见[当前交接的验证记录](context/now.md#验证)。提交前仍需满足项目的完整文档检查要求。

## 相关文档

- [仓库首页（English）](../README.md)
- [项目介绍（简体中文）](../readme-zh-cn.md)
- [项目协作规范](../AGENTS.md)
- [线上使用指南](https://jianglisoftware.com/tutorial)
