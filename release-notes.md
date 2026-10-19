<!-- 记录当前社区版本的可发布说明、优化证据、功能边界与升级要求。 -->

# SoftJL Community v2.2.0

## 更新重点

本次重点修复来源补齐和生成成果同步，减少重复生成，让结果及时可见：

- **缺失映射单独补齐**：只请求缺失业务元素及必要引用，不重写已通过的模型和映射；校验返回引用、类型和置信状态，拒绝越界修改或虚构来源。来源完整时不增加调用，补齐与结构修复共享次数上限。
- **连续成果即时显示**：需求分析模型分批返回时持续更新工作区与侧栏；可行性空白补充表单与默认空值保持同一口径，避免第一项成果保存后阻止后续成果发布。用户修改仍受版本保护。
- **映射比例统一**：矩阵展示元素映射率，按当前范围全部元素计算，搜索和分页不改变结果；需求分析总览复用单模型的来源记录。
- **输入提示补齐**：说明 TXT、Markdown 与 PNG、JPEG、WebP 的支持条件，图片仍要求模型具备视觉能力。

## 生成链路优化

继续优化“输入 → 生成 → 校验 → 修复 → 重试”的链路，减少重复上下文与整段重生成，让独立任务更早产出结果。

- **上下文按任务取用**：审查只携带当前任务的依赖；单用例保留目标及关联用例，约束、边界和待确认来源继续保留。
- **修复从整段重写转向字段补丁**：本地处理可确定的 JSON 标点问题；模型修复携带诊断、字段约束、引用索引与基础版本。拒绝越界或过期补丁，无法定位时只扩大到当前产物。
- **独立分支并行、失败实例重试**：设计分支按依赖推进；单个用例失败不阻塞其他独立成果，重试保留已成功模型。输入变化后阻止旧任务覆盖新工作区。
- **限制重复尝试**：重试请求带标识，普通项目对话压缩保留历史；修改指定图表时不重复生成其他图表。
- **进度链路减负**：任务抽屉只保留生命周期、子任务状态和结果计数，过滤供应商正文、推理片段与输入图片，避免长输出在进度状态中累积和反复渲染。
- **消耗可核对**：任务历史汇总供应商实际报告的 Token，包括修复、失败与取消后已发出的调用。缓存输入不重复相加，未报告的用量保持缺失。

这些机制减少不必要的输入和工作，有助于缩短等待。实际总耗时、总 Token 与费用仍取决于需求规模、供应商、模型、并发限制和修复结果，本版本不公布未经实测的线上降幅。

## 可复现的输入样本

运行 `npm run benchmark:generation`。样本包含 20 个用例、8 个无关模型及一个错误关系端点，使用本地 `cl100k_base` 分词器；不会调用供应商。

| 输入范围 | 未按任务裁剪的样本 | 当前范围选择或字段修复 | 输入缩减 |
| --- | ---: | ---: | ---: |
| 单用例审查上下文 | 6,637 Token | 422 Token | 93.6% |
| 关系端点修复上下文 | 8,096 Token | 641 Token | 92.1% |

这是**同一合成样本的输入范围对比**，不是版本间的线上总消耗对比，也不包含模型输出、后续修复、网络延迟或计费。脚本同时检查目标用例及依赖仍存在、业务规则保留、修复目标可定位且原模型未被改写。缺失映射补齐可能增加必要调用，其收益在于保留已有成果并缩小每次修复范围；不承诺所有任务的总 Token 都下降。真实效果应使用同一项目、模型、供应商及并发配置，记录完整任务耗时、全部调用的输入/输出用量、失败率与人工检查结果后比较。

## 功能对齐

- 移除组织、课程、班级、团队的页面、接口、项目关联字段、数据表以及对应权限和配额。项目可见性统一为私有或公开，协作通过项目成员邀请完成。
- 新建项目可选择普通版或专业版，模式创建后固定，两者均可使用自己的模型服务。
- 普通版支持持续对话、追问、目标图表生成与修改、消息编辑和重新生成、停止及恢复、会话压缩、附件能力检查，以及按需生成测试和说明书。
- 专业版保留规则确认、三项可行性分析、完整需求及设计模型、测试、覆盖与追踪、三类工程说明书。
- 模型输入区统一模型选择、推理与附件能力提示；容量目录提供已知模型的参考容量，资料缺失时明确显示运行预算。
- 文档使用内置 DOCX 预览与下载，无需 OnlyOffice；下载后使用 Word 兼容编辑器修改。
- MCP 支持读取普通项目成果及专业项目实施依据；继续由部署者启用，并明确选择授权项目或账号范围。
- 持久会话恢复保留系统指令、消息修订与压缩用量，重启后继续使用当前分支及已保存的项目约束。

社区版继续排除平台计费、支付、充值额度、运营后台、官网宣传首页和官网自动生产部署。保留社区版已升级的依赖版本、自部署入口、账号认证、项目权限与供应商密钥加密。

## 运行依赖

普通项目使用维护中的 `@earendil-works` SDK 1.3.0，最低 Node.js 版本为 22.19.0；不沿用已弃用的旧包名。供应商凭据和模型目录保存在内存中，会话只开放平台提供的项目工具，不加载 API 主机上的个人配置、扩展或终端工具。锁文件固定本轮验证的依赖版本。

## 部署要求

1. 首次部署准备空数据库并配置 `DATABASE_URL`。本版本采用 `current_platform_schema_v2`，已采用该基线的数据库可继续使用；v1 及旧迁移链数据库会被拒绝，不自动升级或清空数据。
2. 使用 Node.js 22.19+，运行 `npm ci`、共享包与应用构建。
3. 直接采用官网当前 `current_platform_schema_v2` 安装基线，移除旧社区迁移链与历史数据修补代码。新建项目必须明确选择普通版或专业版。
4. 旧迁移记录与历史模型格式不再兼容；启动会拒绝旧库，不执行旧库升级。可用 `node apps/api/dist/db/migrate.js --check` 只读检查目标库，初始化使用 `node apps/api/dist/db/migrate.js`。
5. 文档预览不再依赖 OnlyOffice，原编辑服务器配置不参与当前预览链路。MCP、PostgreSQL、队列和模型凭据按部署环境配置。

## 验证入口

共享契约、提示词、API、Web、渲染服务、脚本、构建和类型检查分别使用根目录已有命令。新增的固定样本对比使用 `npm run benchmark:generation`；文档检查使用 `npm run audit:docs`。

模拟供应商测试验证流程约束与修复边界，不证明远端模型质量、真实总耗时或实际费用。发布前仍需用自己的供应商验收普通项目工具调用、专业项目生成和 DOCX 预览。

## English summary

v2.2.0 improves source mapping completion and generated artifact synchronization. Missing provenance is completed through bounded requests that preserve accepted models and mappings; complete mappings need no extra call. Cumulative previews and feasibility results stay synchronized, and mapping rates remain consistent across scoped views, searches and pages. Scoped context and field patches continue to reduce repeated work.

The reproducible fixture above measures local input tokens only; it is not a production speed or billing benchmark. Mapping completion can add necessary calls, so total tokens are not guaranteed to decrease on every task. New installations use an empty database with `current_platform_schema_v2`; existing databases on that baseline remain usable. Historical migration chains and model formats are no longer supported. Billing, operations administration and hosted deployment remain excluded.
