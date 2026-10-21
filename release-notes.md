<!-- 记录社区版当前发布内容、链路收益、功能边界及部署要求。 -->

# SoftJL Community v2.2.4

## 更新重点

- **快速建模范围确认**：模型选项携带稳定 ID 和明确类型，提交时由服务端校验，不再根据展示文字推断生成范围。重复、伪造、过期及数量不合法的选项会在创建任务前被拒绝；本轮新增类型保留其他已完成模型。
- **未支持图表先说明**：快速建模遇到当前八类模型之外的请求时先说明不支持，阻止擅自替换、生成或修改其他图。替代方案必须通过当前询问组件明确选择，并提供“不生成替代图”；旧范围、正文同意和推荐快捷操作不能代替这次确认。
- **选择与会话记录一致**：结构化选择保存到本轮消息，拒绝生成可形成明确的空范围；编辑或重新生成时恢复对应问题、范围和未支持请求状态，避免沿用后续轮次的选择。旧问题不能确认新一轮生成。
- **成员邀请搜索补全**：可按已注册用户名或显示名搜索，展示头像与身份，自动排除自己、现有项目成员和停用账号，最多返回 20 项。查询仍要求项目邀请权限；输入防抖，关闭弹窗或输入新内容后忽略过期响应。
- **动态头像与资料同步**：内置 12 个优化后的本地 GIF 默认头像，上传支持 GIF 并保留原始帧、循环和透明度。保存资料后导航栏、侧栏和头像菜单即时同步，不重新认证或卸载当前项目；迟到的认证响应不会覆盖新资料。
- **项目筛选与界面细节**：项目列表新增普通版、专业版筛选，保留共享项目筛选；同步头像选择与登录界面的调整。保留社区版近期更新的双语成果介绍、复杂建模截图及既有 CI 布局采样修复。

## 生成链路与消耗

本次优化集中在“识别请求 → 明确支持范围 → 校验选择 → 创建任务 → 按本轮范围生成”的链路：

- 在模型生成前拦截未支持请求和无效答案，避免生成用户未确认的替代图，减少误生成后的重做与修复。
- 生成与修改工具同时检查当前范围；模型目录返回准确任务 ID 和授权状态，避免猜测目标或扩大到其他产物。
- 编辑、重新生成和后续问答保留各自边界，避免旧选择错误地触发后续生成；用户拒绝时不创建替代图。
- 延续按任务裁剪上下文、生成与渲染共用修复会话及预算、独立分支并行、失败实例重试，以及供应商保存复用模型发现结果等机制。

本版本未提供线上总耗时或总 Token 降幅结论。上述约束旨在减少不必要的调用与返工；实际消耗仍取决于项目、模型、供应商和修复次数。

`npm run benchmark:generation` 保留可复现的本地合成输入对比：20 个用例、8 个无关模型，使用 `cl100k_base` 分词，不调用远端模型。当前样本的单用例审查上下文为 6,637 → 413 Token；完整模型修复的首次请求为 3,882 Token，第一次修复请求为 4,269 Token，新增历史与反馈增加 387 Token。这是既有输入裁剪与会话增长样本，不代表本版本新增收益、线上总消耗、费用或耗时降幅。

## 功能边界

保留快速建模、工程建模、自带模型服务、账号认证、项目成员权限、密钥加密、DOCX 内置预览与下载，以及部署者启用并明确授权范围的 MCP。继续排除平台计费、支付、充值额度、运营后台、官网宣传首页及其专用依赖和生产部署流程。

快速建模支持功能结构、用例、活动/流程、总体架构、概念 E-R、设计类、时序及数据库表关系八类模型；本次未扩展图表种类。未支持请求的确认规则仅描述快速建模，工程建模仍按自身模型契约和依赖运行。

## 部署要求

1. 使用 Node.js 22.19+，运行 `npm ci` 并构建共享包和应用。
2. 数据库仍使用 `current_platform_schema_v3`；首次安装准备空数据库，已有数据必须符合当前契约。v1、v2 及历史迁移链不自动升级，也不会自动清空。
3. 默认头像改为本地 GIF，旧游戏角色 SVG 路径已移除且不自动映射。现有部署若引用旧目录，请在升级前改用自行上传的有效头像，或准备符合新目录的新账户数据；同步部署新的 `apps/web/public/avatars/` 资源，并保留自定义头像存储目录。
4. 快速建模旧范围问题若缺少 `scopeChoices`，请重新发起模型选择；不能提交旧答案来授权新范围。普通业务澄清继续按现有问答契约处理。
5. 来源映射中的 `reviewStatus`、`confidence` 和 `auto-filled-pending-review` 仍不兼容，含这些旧元数据的工作区需重建项目和模型，不自动转换。
6. 构建后可用 `node apps/api/dist/db/migrate.js --check` 只读检查目标库，再用 `node apps/api/dist/db/migrate.js` 初始化。SMTP、邮箱验证和邮件邀请不参与账号流程；供应商密钥与持久化目录按部署环境维护。

## 验证

使用共享契约、API、Web 和浏览器回归验证生成范围、未支持图表确认、旧问题拒绝、会话边界恢复、邀请搜索权限、过期响应处理、GIF 上传及导航资料同步。生产构建、类型检查、代码规范与 `npm run audit:docs` 为发布检查入口。

模拟供应商和本地输入样本用于验证流程约束，不证明真实模型质量、线上耗时或费用；生成内容及实际部署仍需人工验收。

## English summary

v2.2.4 validates Quick Modeling scope choices by stable option IDs and explicit diagram kinds. Unsupported requests cannot silently generate substitutes: alternatives require a new structured confirmation, including a decline option. Saved answers and restored turn boundaries prevent stale questions or later choices from authorizing the wrong work.

Project invitations gain permission-scoped registered-user search with avatars and debouncing. Twelve bundled animated GIF avatars and original-byte GIF uploads replace the former default catalog. Profile saves update navigation immediately without remounting the project, and delayed authentication responses cannot overwrite newer profile data. Projects can be filtered by Standard or Professional mode.

These changes aim to reduce unwanted generation and repeated work; no new production latency, total-token or billing reduction is claimed. The supported Quick Modeling diagram types are unchanged. Use Node.js 22.19+ and the current v3 database baseline. Retired avatar paths, obsolete model-selection questions and old mapping metadata are not automatically converted. Community BYOK, authorization, optional explicitly scoped MCP and DOCX preview remain; hosted billing, operations administration and marketing pages remain excluded.
