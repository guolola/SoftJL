<!-- 记录社区版当前发布内容、链路收益、功能边界及部署要求。 -->

# SoftJL Community v2.2.3

## 更新重点

- **生成与渲染连续修复**：后置结构和来源问题沿用首次生成的完整会话，继承已消耗的修复预算；同批模型分支保留原始历史后各自修复，避免互相污染。模型、来源映射和绘图全部通过后一起发布，失败候选不覆盖有效成果。
- **来源映射简化**：校验真实模型元素，支持嵌套事件流、结构元素和限定字段 ID，仍要求业务元素具有完整来源。移除来源映射置信度、待确认状态及自动候选映射，不再把这些字段作为生成前置门槛；矩阵展示同步调整。
- **供应商配置列表**：展示名称、状态、默认模型、更新时间与启用项，只允许选择一个可用供应商。个人配置仅由所属用户编辑或删除，停用或无可用模型的配置无法启用。
- **模型搜索与发现**：模型选择支持搜索、品牌图标及严格 JSON/JSON 模式/兼容模式标识。发现阶段已完成的模型探测用于后续保存，取消重复测试调用；保存仍执行地址安全校验，编辑时重新填写密钥并获取模型列表。
- **独立工作台偏好**：自动生成、过期提示及完成提示音独立维护，保存时只合并当前页面字段。错误浮层显示在配置弹窗上方，关闭提示后可继续修改，不丢失表单。

## 生成链路与消耗

本次优化集中在“发现供应商模型 → 保存配置 → 选择直接上游 → 生成与渲染连续修复 → 发布有效成果”的链路：

- 供应商保存不再额外重复执行模型连通性测试，复用发现阶段的结果，减少配置过程的等待及重复调用；地址策略继续由服务端校验。
- 后置修复不重新拼装另一份生成上下文，直接延续原消息历史和已消耗预算。来源问题与结构问题共同校验，修复返回完整模型及映射，绘图成功后才发布。
- 设计任务仅使用实际直接上游，缺少来源时不回退到整份需求模型；保留独立分支并行、依赖批次限制及失败实例重试。实现方案与文档章节继续使用局部补丁协议。

这些机制旨在减少无效调用和重复生成。本版本没有线上总耗时或总 Token 降幅结论；完整模型修复会保留并增加历史输入，实际消耗取决于模型、项目规模、修复次数及供应商缓存行为。

`npm run benchmark:generation` 使用 20 个用例、8 个无关模型的固定合成样本和 `cl100k_base` 分词，不调用远端模型：

- 单用例审查上下文从 6,637 缩减至 413 Token，表示当前样本的来源范围裁剪效果，不代表相对上一版本的线上收益。
- 使用当前模型修复协议，首次请求为 3,882 Token，第一次修复请求为 4,269 Token；原始前缀保留，新增输出与校验反馈使输入增加 387 Token。统计包含序列化消息结构，不计工具或供应商封装。

上述数值仅用于复现输入范围和会话增长，不代表全部调用总 Token、缓存命中、计费或线上耗时；旧字段补丁修复样本不再作为当前模型修复的节省依据。

## 功能边界

保留快速建模、工程建模、自带模型服务配置、账号认证、项目权限、供应商密钥加密、DOCX 内置预览与下载，以及由部署者启用并明确授权范围的 MCP。继续排除平台计费、支付、充值额度、运营后台、官网宣传首页和官网自动生产部署。

组织、课程、班级、团队及其关联字段、权限和配额保持移除；项目可见性字段已移除，统一通过成员邀请协作，仅已加入成员可访问。

## 部署要求

1. 使用 Node.js 22.19+，运行 `npm ci` 并构建共享包和应用。
2. 本版本继续采用 `current_platform_schema_v3`。首次安装使用空数据库；已采用该基线的数据库结构可继续使用，但工作区数据必须符合当前契约。
3. **v2.2.0 的 v2 基线及其他旧数据库不能直接升级**。旧库会被明确拒绝，不会自动迁移或清空；部署前准备新的空数据库并配置 `DATABASE_URL`。不再保留旧邮箱字段、邮件邀请令牌和历史迁移兼容链。
4. 构建后可先用 `node apps/api/dist/db/migrate.js --check` 只读检查目标库，再用 `node apps/api/dist/db/migrate.js` 初始化。
5. SMTP、邮箱验证、邮件找回密码和邮件邀请链接不再参与账号流程。可选本地访客账号使用 `UML_GUEST_USERNAME` 配置；供应商加密密钥和持久化目录按部署环境维护。
6. **来源映射旧数据不再兼容**：`reviewStatus`、`confidence` 字段和 `auto-filled-pending-review` 值已移除，包含这些内容的工作区会被拒绝。请重建受影响的项目和模型；本次不自动迁移、删除或转换这些数据。

## 验证

使用契约、提示词、API、Web 和浏览器回归验证渲染修复延续、分支隔离、共享预算、真实来源引用、旧字段拒绝、供应商列表与搜索、保存免重复探测、偏好独立保存及错误提示层级；数据库行为由 PGlite 使用当前 SQL 基线验证。类型检查、代码规范、生产构建及 `npm run audit:docs` 为发布检查入口。

模拟供应商与本地输入样本用于验证流程约束，不证明远端模型质量、真实线上耗时或费用。实际供应商工具调用、图表质量和 DOCX 预览仍需在部署环境验收。

## English summary

v2.2.3 continues post-generation structure and provenance repairs in the original conversation, carrying the spent budget while isolating sibling histories. Valid models, mappings and rendered outputs are published together. Source references resolve against real model elements; mapping review/confidence metadata and auto-filled pending mappings are retired.

Provider settings now use a status table, single enabled selection and searchable discovered models with brand/output-mode indicators. Saving reuses discovery probes while retaining address safety checks. Workspace preferences save independently, and actionable errors remain visible above dialogs. Scoped inputs, independent branches and bounded repairs aim to reduce repeated work; no production speed, total-token or billing reduction is claimed.

Use Node.js 22.19+ and `current_platform_schema_v3`. Older database baselines are rejected without migration or deletion. Workspaces with retired mapping metadata must be recreated under the current contract; no automatic conversion is provided. Community BYOK, project authorization, optional explicitly scoped MCP, collaboration notifications, quick-modeling history and built-in DOCX preview remain available; billing and operations administration remain excluded.
