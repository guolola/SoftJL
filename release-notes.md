<!-- 记录社区版当前发布内容、链路收益、功能边界及部署要求。 -->

# SoftJL Community v2.2.2

## 更新重点

- **统一模型修复会话**：需求模型、设计模型、可行性图表及渲染阶段结构修复保留各自任务的原始请求和历次输出，在同一会话追加校验反馈，返回完整修正模型。结构、引用和来源映射共享最多五次修复预算，避免分别修补后仍互相矛盾。
- **依赖模型分批生成**：需求用例与分析模型、设计类与数据库/组件/部署等直接或间接依赖不允许同批生成。卡片展示冲突原因，全选保留已选目标并补充独立模型，前端操作守卫和 API 执行相同限制。
- **上游变化及时失效**：用例事件流、关联用例、角色或系统边界变化时，已有分析模型及关联下游会标记为待更新。来源卡片和连线更准确地区分可用、待更新和生成中状态。
- **JSON 输出指令补齐**：JSON 模式及结构化模式降级时，缺少明确指令的请求自动补充合法 JSON 要求；保留原有文字与图片输入，降低供应商因缺少指令而拒绝调用的风险。
- **说明与流程预览**：模型卡片随内容增高，完整展示冲突原因与生成说明；页面预留滚动条宽度以减少跳动。创建项目弹窗从缩放入场后及时测量并绘制流程连线，尺寸变化时更新，关闭后清理测量任务。
- **社区版能力继续保留**：用户名账号、站内邀请通知、默认头像、项目展开卡片、快速建模上下文占用、逐轮任务记录和本轮成果历史继续可用。

## 生成链路与消耗

本次优化集中在“选择独立目标 → 校验已保存上游 → 生成模型 → 同会话校验与修复 → 发布有效成果”的链路：

- 在调用模型前拦截同批上下游冲突，避免下游读取旧模型后再次返工；独立分支继续并行，成功成果无需随失败实例重做。
- 模型修复延续原始消息前缀，保留无效输出与校验原因，允许联动修正节点、关系和来源映射，减少分离修复协议之间的错位。每个任务隔离历史并受共享修复上限约束。
- 保留按任务裁剪上下文、单用例范围选择、实际供应商 Token 汇总和快速建模会话压缩。实现方案与文档章节仍使用受目标和基础版本约束的局部补丁协议。

这些机制旨在减少无效调用和重复生成。本版本没有线上总耗时或总 Token 降幅结论；完整模型修复会保留并增加历史输入，实际消耗取决于模型、项目规模、修复次数及供应商缓存行为。

`npm run benchmark:generation` 使用 20 个用例、8 个无关模型的固定合成样本和 `cl100k_base` 分词，不调用远端模型：

- 单用例审查上下文从 6,637 缩减至 422 Token，表示该样本的来源范围裁剪效果，并非本次版本新增收益。
- 使用当前模型修复协议，首次请求为 3,858 Token，第一次修复请求为 4,245 Token；原始前缀保留，新增输出与校验反馈使输入增加 387 Token。统计包含序列化消息结构，不计工具或供应商封装。

上述数值仅用于复现输入范围和会话增长，不代表全部调用总 Token、缓存命中、计费或线上耗时；旧字段补丁修复样本不再作为当前模型修复的节省依据。

## 功能边界

保留快速建模、工程建模、自带模型服务配置、账号认证、项目权限、供应商密钥加密、DOCX 内置预览与下载，以及由部署者启用并明确授权范围的 MCP。继续排除平台计费、支付、充值额度、运营后台、官网宣传首页和官网自动生产部署。

组织、课程、班级、团队及其关联字段、权限和配额保持移除；项目可见性字段已移除，统一通过成员邀请协作，仅已加入成员可访问。

## 部署要求

1. 使用 Node.js 22.19+，运行 `npm ci` 并构建共享包和应用。
2. 本版本继续采用 `current_platform_schema_v3`，包含用户名账号和站内通知回执。首次安装使用空数据库；已采用该基线的数据库可继续使用，包括 v2.2.1 的当前基线数据库。
3. **v2.2.0 的 v2 基线及其他旧数据库不能直接升级**。旧库会被明确拒绝，不会自动迁移或清空；部署前准备新的空数据库并配置 `DATABASE_URL`。不再保留旧邮箱字段、邮件邀请令牌和历史迁移兼容链。
4. 构建后可先用 `node apps/api/dist/db/migrate.js --check` 只读检查目标库，再用 `node apps/api/dist/db/migrate.js` 初始化。
5. SMTP、邮箱验证、邮件找回密码和邮件邀请链接不再参与账号流程。可选本地访客账号使用 `UML_GUEST_USERNAME` 配置；供应商加密密钥和持久化目录按部署环境维护。

## 验证

使用契约、提示词、API、Web 和浏览器回归验证修复会话、来源覆盖、共享预算、双向及间接依赖冲突、批量选择和上游变更状态；数据库行为由 PGlite 使用当前 SQL 基线验证。类型检查、代码规范、生产构建及 `npm run audit:docs` 为发布检查入口。

模拟供应商与本地输入样本用于验证流程约束，不证明远端模型质量、真实线上耗时或费用。实际供应商工具调用、图表质量和 DOCX 预览仍需在部署环境验收。

## English summary

v2.2.2 unifies model structure and provenance repair in task-local conversations with a shared five-repair limit. Exact request prefixes and generated outputs are retained; corrections return complete models. UI selection, bulk actions, preflight and API guards reject dependent model batches, including indirect dependencies. Changed use-case sources invalidate existing analysis models and dependent designs. JSON mode receives explicit instructions when needed, including after schema fallback.

Scoped inputs, independent branches and failed-instance retries aim to reduce repeated work. Retained repair history adds input; no production speed, total-token, cache or billing reduction is claimed. The benchmark reports both scoped review inputs and current repair-message growth.

Use Node.js 22.19+ and `current_platform_schema_v3`. Existing databases on that baseline remain usable; older baselines are rejected without migration or deletion. Community BYOK, project authorization, optional explicitly scoped MCP, collaboration notifications, quick-modeling history and built-in DOCX preview remain available; billing and operations administration remain excluded.
