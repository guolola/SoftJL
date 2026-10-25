<!-- 记录社区版当前发布内容、兼容边界及部署验证要求。 -->

# SoftJL Community v2.2.6

## 更新重点

本次同步官网提交 `41abc589` 的建模核心改动，保留社区仓库的独立历史与部署边界。

- **统一生成与修复会话**：需求提取、可行性和工程模型使用固定的上游输入，首次请求只提供一次；校验失败在原会话中追加本轮问题，返回修正后的完整 JSON，共用五次修复预算。截断输出、结构错误、来源错误和图形编译失败均有明确状态，不通过补丁或额外工具查询扩展任务范围。
- **精确的来源诊断**：统一检查当前规则、模型和真实元素的引用及覆盖。错误包含字段路径、模型与元素标识、名称和失败原因；隔离范围之外的来源、重复引用和缺少映射在发布前被拒绝。
- **当前需求与映射契约**：需求基线精简为版本、规则、运行、输入指纹与创建时间；规则保留标识、类型、文本及可选原文片段。来源映射仅保存必要引用，设计模型的直接上游统一进入 targets。删除的质量报告、来源占位和冗余映射说明不再持久化。
- **泳道编译与模型一致性**：活动图使用统一结构化泳道编译，覆盖复杂判断、汇合、并行和循环；不支持的结构显式失败并进入模型会话修复。共用候选校验、契约空值处理和输出 Schema，避免模型与绘图源不一致。
- **任务进度与工作区**：按产物展示生成、结构校验、模型编译和渲染调用状态，保留失败实例及已完成成果。更新来源矩阵、依赖过期判断、手动编辑和工作区恢复契约，修复血缘图工具栏过期定时器覆盖新状态的问题。

## 功能边界

保留快速建模、工程建模、自带模型服务、账号与项目权限、成员邀请、通知中心、任务历史、实际用量、DOCX 内置预览与下载，以及部署者启用并明确授权范围的只读 MCP。

继续排除平台计费、支付、充值额度、运营后台、组织课程班级团队管理、考试页面和官网宣传首页。本次不加入桌面编程助手入口、介绍弹窗及相关下载页面。社区版根地址继续进入项目列表；普通版和专业版表示工作流模式，与付费档位无关。

## 部署与兼容要求

1. 使用 Node.js 22.19+、npm 10、Java 21 和 Graphviz，运行 npm ci、npm run build:packages 及应用构建。完整同步全部工作区，不只复制单个应用。
2. 数据库继续使用 current_platform_schema_v3。升级前备份数据库、模型凭据加密密钥、头像、文档和模型目录缓存；旧数据库结构不会自动升级或清空。
3. 本次进一步收紧需求基线、来源映射和活动模型契约。包含旧质量报告、已删除字段、旧映射来源说明或旧活动结构的工作区会被拒绝；部署者须按当前契约整理或重建受影响项目，不自动转换或推造来源。旧通用 nodes/edges、独立 prepare 操作和旧问题选项的限制继续有效。
4. 保留 plantuml/plantuml-1.2026.3beta8.jar，并完整部署 API dist 下的运行时规则、技能与参考资料。社区版继续锁定 Pi 1.3.0，不导入官网本机配置、凭据、数据或发布工作流。

## 验证

发布检查覆盖共享契约、提示词、API、渲染、Web、评估工具、开发与部署脚本、代码规范、类型检查、文档检查和生产构建。浏览器回归覆盖社区版入口、建模交互、任务历史和响应式布局；实际执行结果以对应提交的 CI 为准。

模拟供应商验证流程、权限和产物契约；真实模型质量、耗时和用量仍需部署者使用自己的服务配置验收。本版本不声称生产耗时、Token 或费用降幅。

## English summary

v2.2.6 synchronizes upstream commit 41abc589. Generation and repair share one conversation with pinned source inputs and complete JSON candidates. The backend validates structure, real source references, coverage and diagram compilation before publishing, and reports precise mapping diagnostics. Activity diagrams use the structured swimlane compiler; per-artifact progress distinguishes generation, validation, compilation and rendering.

Requirement baselines and traceability retain only current facts and required references. Removed quality metadata, obsolete mapping fields and unsupported persisted formats are rejected without automatic conversion. Back up data and align existing workspaces with the current contracts before upgrading. Node.js 22.19+, the complete shared workspace build, the PlantUML jar and API runtime resources remain required.

Community BYOK, project permissions and optional scoped read-only MCP remain. Hosted billing, operations administration and marketing pages stay excluded, and this release omits the desktop Coding Agent entry and announcement.
