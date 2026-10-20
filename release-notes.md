<!-- 记录社区版当前发布内容、链路收益、功能边界及部署要求。 -->

# SoftJL Community v2.2.1

## 更新重点

- **用户名账号与站内邀请**：使用用户名注册和登录，无需邮箱验证；按已注册用户名邀请成员，接收者在通知中心接受或拒绝。邀请校验拦截自己、无效用户名和未注册账号，决定只允许接收者执行一次。
- **通知中心**：合并项目邀请与公告，支持个人已读和移除状态；移除不影响其他用户。重发邀请后恢复显示与未读状态，PostgreSQL 中的决定和回执在重启后继续保留。
- **默认头像与账号界面**：新账号及缺少头像的账号自动分配头像，保留已有自选图片，并可在账号页切换。同步项目卡片、模式徽标和交互提示的界面改进。项目创建简化为单页表单，移除可见性设置，访问统一由成员关系控制。
- **快速建模任务记录**：每条已接受的消息保存独立任务，在确认请求前持久化记录；图表、测试和文档只归属本轮新增或修改的成果，沿用内容不重复记入。本轮失败或停止后仍保留已完成成果。
- **项目历史完整展示**：快速建模进入独立历史分类，显示模型与本轮已接受成果；失败任务通过快速建模会话继续，避免误用工程建模的重试入口。

- **项目展开卡片**：展开查看封面、项目资料与成员后进入项目；支持键盘、外部点击及移动端关闭，保持滚动位置，修复遮罩层级和头像提示退出闪烁。
- **实时上下文占用**：快速建模的占用比例使用当前会话测量和实际运行预算，单次供应商调用单独显示；压缩期间不沿用旧占用值，模型未报告时保持未知。

## 生成链路与消耗

本次优化集中在“接收命令 → 持久化任务 → 有序保存成果 → 停止与恢复 → 查看历史”的链路：

- 保存任务后再确认接收，重复请求复用已有命令记录，减少因刷新或重发造成的重复生成。
- 同一轮工作区保存与历史投影按顺序完成，避免并发保存让状态与成果错位；取消后的延迟保存不能把任务恢复为运行中。
- 只记录本轮变化的成果，历史摘要不携带 SVG 正文、会话私有上下文或文档正文，减少历史列表传输和解析负担。
- 延续按任务裁剪上下文、字段补丁修复、缺失映射单独补齐、独立分支并行和失败实例重试，并保留供应商实际报告的 Token 汇总。

这些机制减少重复工作和恢复成本，有助于缩短等待、控制不必要的 Token 消耗。本版本没有新增线上总耗时或总 Token 降幅结论；真实效果取决于项目规模、模型、供应商、并发和修复结果。

`npm run benchmark:generation` 可复现既有的本地输入范围样本：20 个用例、8 个无关模型，使用 `cl100k_base` 分词，不调用远端模型。单用例审查输入从 6,637 缩减至 422 Token，字段修复输入从 8,096 缩减至 641 Token。该结果仅表示同一合成样本的输入范围缩减，不代表本次版本相对上一版本的新增收益，也不等于线上总耗时、全部调用总 Token 或计费降幅。

## 功能边界

保留快速建模、工程建模、自带模型服务配置、账号认证、项目权限、供应商密钥加密、DOCX 内置预览与下载，以及由部署者启用并明确授权范围的 MCP。继续排除平台计费、支付、充值额度、运营后台、官网宣传首页和官网自动生产部署。

组织、课程、班级、团队及其关联字段、权限和配额保持移除；项目可见性字段已移除，统一通过成员邀请协作，仅已加入成员可访问。

## 部署要求

1. 使用 Node.js 22.19+，运行 `npm ci` 并构建共享包和应用。
2. 本版本采用 `current_platform_schema_v3`，包含用户名账号和站内通知回执。首次安装使用空数据库；已经使用该基线的数据库可继续使用。
3. **v2.2.0 的 v2 基线及其他旧数据库不能直接升级**。旧库会被明确拒绝，不会自动迁移或清空；部署前准备新的空数据库并配置 `DATABASE_URL`。不再保留旧邮箱字段、邮件邀请令牌和历史迁移兼容链。
4. 构建后可先用 `node apps/api/dist/db/migrate.js --check` 只读检查目标库，再用 `node apps/api/dist/db/migrate.js` 初始化。
5. SMTP、邮箱验证、邮件找回密码和邮件邀请链接不再参与账号流程。可选本地访客账号使用 `UML_GUEST_USERNAME` 配置；供应商加密密钥和持久化目录按部署环境维护。

## 验证

使用共享契约、API、Web 和浏览器回归验证账号、邀请权限、通知回执、快速建模成果归属与历史展示；数据库行为由 PGlite 使用当前 SQL 基线验证。类型检查、代码规范、生产构建及 `npm run audit:docs` 为发布检查入口。

模拟供应商与本地输入样本用于验证流程约束，不证明远端模型质量、真实线上耗时或费用。实际供应商工具调用、图表质量和 DOCX 预览仍需在部署环境验收。

## English summary

v2.2.1 adds expandable project previews and live session context occupancy, and aligns username accounts, in-app invitations, personal notification receipts, default avatars and durable quick-modeling task history. Each accepted turn retains only its own changed diagrams, tests and documents, including partial outputs after failure or cancellation. Quick turns appear in project history and continue through the conversation workflow. Existing scoped context and focused repair optimizations remain available; no new production speed or total-token reduction is claimed.

Install with Node.js 22.19+ and an empty database using `current_platform_schema_v3`. Databases on older baselines, including v2.2.0's v2 baseline, are rejected without migration or deletion. SMTP and email-token account flows are retired. Community BYOK, project authorization, optional explicitly scoped MCP and built-in DOCX preview remain; billing and operations administration remain excluded.
