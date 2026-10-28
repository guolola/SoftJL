<!-- 记录社区版当前发布内容、兼容边界及部署验证要求。 -->

# SoftJL Community v2.2.7

## 更新重点

本版本在 v2.2.6 基础上对齐主项目 main 的 `508a0ae1`，同步 `41abc589` 之后适用于社区版的核心功能与修复。

- **模型目录与品牌**：后端改用 Models.dev 当前目录，统一模型名称、品牌、生命周期、容量及推理、视觉能力展示。完整下载与校验成功后替换缓存，失败保留上次有效资料；不模糊推测模型身份。
- **个人模型设置**：个人供应商所有者可维护上下文、最大输出量和推理、视觉能力，清空覆盖恢复参考值。服务端校验权限、模型归属及容量约束，保存后刷新模型选择和预算，不重新探测供应商。
- **原生多模态需求附件**：图片原件直接参与输入预检与需求规则提取，文本附件和图片保持稳定来源，不额外调用图片转写。来源变动阻止发布；附件类型、数量、大小、空内容、总字符数及视觉能力错误分别提示。
- **部分成功与失败项重试**：需求、设计和可行性批次分别展示成功与失败产物，直接重试失败项并保留已完成成果。可行性重试以实际产物回执确定范围，任务完成、失败及重试后刷新所属项目历史。
- **建模规则与提示词隔离**：快速建模和工程建模独立固定提示词版本，受限技能读取保持路径和权限边界。编辑、保存及渲染使用对应模式的结构校验，细化活动控制流、片段、层级与键约束诊断。
- **当前持久化契约与界面**：来源矩阵与说明书使用显式来源字段，移除历史标识推断及文档、公告、头像等旧格式兜底；完善项目卡片悬停、键盘焦点及主题展示。

- **发布依赖维护**：升级到 Zod 4.6.7，使用原生 JSON Schema 投影并保留当前默认值与字段校验；Pi 传递依赖 undici 固定为 8.12.3，URI 解析依赖更新至修复版。补充超限集合先拒绝再校验元素的回归测试；对应 [Zod 公告](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) 与 [undici 公告](https://github.com/advisories/GHSA-xjj6-f33q-929c)。

## 功能边界

保留快速建模、工程建模、自带模型服务、账号与项目权限、成员邀请、通知中心、任务历史、实际用量、DOCX 内置预览与下载，以及部署者启用并明确授权范围的只读 MCP。

继续排除平台计费、支付、充值额度、运营后台、组织课程班级团队管理、考试页面和官网宣传首页，不加入桌面编程助手入口、介绍弹窗及相关下载页面。个人模型设置不恢复管理员模型目录或提示词管理接口。社区版根地址继续进入项目列表；普通版和专业版表示工作流模式，与付费档位无关。

## 部署与兼容要求

1. 使用 Node.js 22.19+、npm 10、Java 21 和 Graphviz，运行 npm ci、npm run build:packages 及应用构建。完整同步全部工作区，不只复制单个应用。
2. 数据库继续使用 current_platform_schema_v3。升级前备份数据库、模型凭据加密密钥、头像、文档和模型目录缓存；旧数据库结构不会自动升级或清空。
3. 本次进一步收紧需求基线、来源映射和活动模型契约。包含旧质量报告、已删除字段、旧映射来源说明或旧活动结构的工作区会被拒绝；部署者须按当前契约整理或重建受影响项目，不自动转换或推造来源。旧通用 nodes/edges、独立 prepare 操作和旧问题选项的限制继续有效。
4. 保留 plantuml/plantuml-1.2026.3beta8.jar，并完整部署 API dist 下的运行时规则、技能与参考资料。社区版继续锁定 Pi 1.3.0，不导入官网本机配置、凭据、数据或发布工作流。
5. 模型目录使用 Models.dev 当前缓存格式，旧 Modelpedia 缓存不转换为新资料。未匹配模型保持未知容量并沿用保守运行预算；个人覆盖按当前格式保存，不迁移旧格式文件。
6. 文档、公告等持久化数据必须符合当前契约，无效内容明确报错，不再静默兜底。来源字段必须显式存在，不从历史模型标识推造用例来源；受影响数据需按当前契约整理或重建。

## 验证

发布检查覆盖共享契约、提示词、API、渲染、Web、评估工具、开发与部署脚本、代码规范、类型检查、文档检查和生产构建。新增集成测试检查个人模型接口已注册，同时运营后台与计费接口继续返回 404。浏览器回归覆盖社区版入口、建模交互、任务历史和响应式布局；实际执行结果以对应提交的 CI 为准。

模拟供应商验证流程、权限和产物契约；真实模型质量、耗时和用量仍需部署者使用自己的服务配置验收。本版本不声称生产耗时、Token 或费用降幅。

## English summary

v2.2.7 aligns community functionality with upstream main at 508a0ae1, following the v2.2.6 baseline 41abc589. Models.dev supplies reference metadata, and personal provider owners can override context/output limits and reasoning/vision capabilities with permission checks and immediate selector updates.

Original requirement images reach native multimodal screening and extraction with stable source identities. Partial results list successful and failed outputs separately, retries preserve completed siblings, and project task history refreshes on terminal events. Quick and engineering modeling pin separate prompt versions and apply their own structural rules. Obsolete caches and persisted formats are rejected without silent migration. Back up data and deploy the complete workspace, PlantUML jar and API resources with Node.js 22.19+.

Community BYOK, project permissions and optional scoped read-only MCP remain. Hosted billing, operations administration and marketing pages stay excluded, and this release omits the desktop Coding Agent entry and announcement.
