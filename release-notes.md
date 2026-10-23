<!-- 记录社区版当前发布内容、兼容边界及部署验证要求。 -->

# SoftJL Community v2.2.5

## 更新重点

- **工作区结构对齐**：共享契约按 access、modeling、requirements、runs、workspace 分域；应用级集成测试与夹具归入各应用的 tests 目录。新增独立 demo-fixtures 工作区，API 演示与 Web 测试通过公开包入口复用数据，公共编译选项由根配置维护。
- **快速建模使用具体模型契约**：八类入口保持不变。功能、用例、活动、架构、类、时序和物理表复用工程建模契约、结构校验与渲染器；概念 E-R 独立保存实体、属性、关系和基数。生成、直接保存及持久化读取拒绝旧通用 nodes/edges、未知字段和伪造来源，编辑器按类型维护实际模型。
- **原生活动泳道**：适合结构化表达的业务流程使用原生纵向泳道，保留判断分支、汇合、并发、重试与循环；不适合原生结构的合法图保留显式图结构。标签转义和端点校验继续保护模型语义。
- **建模技能与原生扩展**：Pi 原生资源加载器显式加载专用运行时规则、建模与交付技能，以及建模和摘要扩展。受限 read 仅能读取维护的 Markdown 资源，并检查真实路径；默认关闭宿主机个人资源发现与通用文件、终端工具。构建自动携带资源，社区版保留已锁定的 Pi 1.3.0 运行时。
- **交互问答与生成统计**：接入 assistant-ui QuestionFlow，保留单选、多选、推荐、已提交回执、提交失败重试和只读状态；选项 ID 与模型类型继续由服务端验证。新回复保存首内容耗时、总耗时、内容块数与基于实际输出 Token 的速度，历史缺失字段不补造。
- **项目引导与任务历史**：快速建模增加介绍入口，工程引导等待页面加载完成后启动，项目模式使用统一标识。任务进度、记录与产物归属使用当前契约；精简历史读取保持分页、事件游标及完整记录隔离。

## 生成链路与消耗

本版本继续按任务裁剪上下文，保留同一模型任务的完整修复会话、共享五次修复预算、独立分支并行与失败实例重试。结构化输出和局部补丁使用当前契约；无效格式在保存或调用下游前失败，不静默升级旧数据。

生成评估先提取需求并等待工作区基线发布，再读取已保存输入建模；使用明确配置的项目及受管供应商，保留会话认证与权限检查。

本版本没有提供真实供应商端到端耗时、总 Token 或费用降幅结论。`npm run benchmark:generation` 使用本地合成输入，不调用远端模型；回归测试不证明真实模型生成质量。

## 功能边界

保留快速建模、工程建模、自带模型服务、账号认证、项目成员与邀请、通知中心、站内公告、任务历史、实际用量、DOCX 内置预览与下载，以及部署者启用并明确授权范围的 MCP。

继续排除平台计费、支付、充值额度、运营后台、组织课程班级团队管理、考试页面、官网宣传首页及其专用资源。普通版和专业版表示工作流模式，与付费档位无关。社区版入口仍直接进入项目列表，旧使用指南地址跳转线上指南。

## 部署要求

1. 使用 Node.js 22.19+、npm 10、Java 21 和 Graphviz，更新后运行 `npm ci`、`npm run build:packages` 及应用构建。共享包新增 `@uml-platform/demo-fixtures`，不得只复制单个应用目录。
2. 数据库继续使用 `current_platform_schema_v3`。升级前备份数据；旧数据库结构不会自动升级或清空。
3. 本版本不兼容快速建模旧通用 nodes/edges 模型、已移除的独立 prepare 操作、旧需求结构及未知持久化字段。含旧格式的项目需按当前契约重新整理或重建；不自动转换，也不推造来源。旧模型选择问题缺少 scopeChoices 时需重新发起选择。
4. PlantUML 运行时移至 `plantuml/plantuml-1.2026.3beta8.jar`，文件内容未变。同步完整源码或部署产物，检查自定义启动配置中的旧路径。
5. 完整部署 API dist，包含 `runs/pipelines/standard/resources/` 下的运行时规则、技能和参考资料。仅复制 JavaScript 文件会导致技能加载失败。
6. 保留模型凭据加密密钥、模型目录缓存、自定义头像和文档存储目录。旧默认头像路径及旧映射审查元数据仍不自动兼容；SMTP、邮箱验证和邮件邀请不参与社区版账号流程。

## 验证

发布检查覆盖共享契约、提示词、API、渲染服务、Web、评估工具、开发与部署脚本、类型检查、代码规范、文档检查及生产构建。浏览器回归检查社区版入口、项目与成员、建模交互、任务记录和响应式布局。

模拟供应商用于验证流程、权限与产物契约；生成内容及实际模型兼容性仍需部署者使用自己的配置验收。

## English summary

v2.2.5 aligns the community workspace layout, shared contract domains and application test directories. An independent demo-fixtures package provides shared frozen data through public exports.

Quick Modeling keeps eight supported views. Seven reuse the engineering model contracts, validators, renderers and editors; conceptual E-R uses its own entity, attribute and relationship structure. Native activity swimlanes preserve supported branches, joins, parallel paths and loops. Obsolete generic nodes/edges models and unknown persisted fields are rejected rather than silently converted.

Pi's native resource loader now loads maintained modeling skills, runtime rules and explicit extensions. Its restricted read tool only accesses approved Markdown resources. QuestionFlow handles structured inquiries and saved receipts, and new replies retain actual generation timing and token statistics. Community BYOK, authentication, project permissions and optional scoped MCP remain; hosted billing, operations administration, exams and marketing pages remain excluded.

Upgrade all workspaces together, use Node.js 22.19+, rebuild the shared packages, and deploy the complete API resource directory. The unchanged PlantUML jar now resides directly under plantuml/. Back up data before upgrading: old model and requirement formats are not migrated automatically. No production latency, token or cost reduction is claimed.
