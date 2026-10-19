# 平台 MCP 模块

## 职责

为外部 coding agent 提供经用户授权的已保存项目依据。提供四个只读工具、技术栈中立的上下文、实施任务与代码映射契约、独立本地验证器、来源版本、OAuth 与个人令牌。

代码以完整设计模型为直接依据。需求到设计的正确性与完整性由平台工作流负责；MCP 只输出设计、需求正文核对依据、工程约束、已有测试及追踪版本，排除需求模型、原始需求、业务规则正文、质量评审和候选方案。缺少设计时反馈缺口，不退回需求重新设计。

验收条件规定代码完成后应满足的行为，用于实施和测试；审核意见是对平台产物的检查结论。需求项只保存类型与文本；任务以关联的已保存需求全文作为验收核对依据。MCP 排除审核意见及其状态和修复记录。

## 边界

`context/` 提取白名单领域数据、范围与依赖，并组织实施任务和分发产物；`verification/` 提供无需平台依赖的本地验证器源码，服务器不执行该源码；`tools/` 负责读取及分页；`auth/` 负责协议配置、身份和项目授权；`records/` 负责授权与 OAuth 持久化；`server/` 组装 SDK 和依赖。HTTP 适配在 [`routes/mcp/`](../routes/mcp/register-mcp-routes.ts)，合同在 [`packages/contracts/src/mcp/`](../../../../packages/contracts/src/mcp/index.ts)。

`implementation-sources.ts` 在内部追踪与过期计算完成后裁剪编码输入。上游正文留在平台，设计产物仅附上游版本摘要；验收来源只保留需求 ID 与验收文本。通过 MCP 使用已保存资料即视为平台认可：无论审核问题是否修复，审核意见、确认状态、修复候选和追踪审核标记均不进入编码上下文，也不作为实施任务的阻断条件。模型缺失、无效引用、保存后的模型与源码不同步、版本过期及本地验证失败仍按实际情况报告。旧客户端须刷新快照和报告来源引用，保留已有代码与测试。

不读取或提供说明书，不导入前端状态、不使用原型生成提示、不读取供应商密钥，不启动 LLM 或代码流水线。工具没有本地文件写入能力；本地关联文件由 agent 自己维护。实施任务包在开始时读取，独立报告契约在交付验证时读取。验证器产物只返回文件下载元数据；按源码 UTF-8 字节哈希提供固定、可缓存的通用脚本，下载不读取项目资料，源码不再内嵌到 MCP JSON。

### 映射与一致性验证

以 `taskId` 关联需求、设计元素、实际代码、测试与来源版本。目前是任务级多对多登记，尚无设计元素到代码符号的逐对绑定。现有本地验证器核对引用、文件哈希，并在显式启用 `--run-checks` 后执行登记命令；自定义一致性算法可通过 `checks` 接入，逐规则结果和算法版本仍需后续扩展。

参见[中文 README 映射图](../../../../README.md#需求设计与代码映射)、[借阅映射示例](../../../../docs/integrations/coding-agent-mcp.md#映射示例与证据边界)与[一致性算法接入](../../../../docs/integrations/coding-agent-mcp.md#接入自定义一致性算法)。

## 使用或常用命令

从仓库根目录运行 `npm run build:contracts`、`npm run build:api`。针对性测试运行 `npx tsx --test apps/api/src/mcp/context/implementation-context.test.ts apps/api/src/mcp/records/postgres-mcp-store.test.ts apps/api/src/routes/mcp/register-mcp-routes.test.ts`。

## 配置

默认关闭。通过 `MCP_ENABLED=true` 注册 `/api/mcp` 与 OAuth/发现入口。生产复用 PostgreSQL，所有实例共用 `MCP_PUBLIC_ORIGIN`、`MCP_SHARED_SECRET`、`MCP_JWKS`；预注册客户端和 CIMD 可信源按部署设置。详见[集成文档](../../../../docs/integrations/coding-agent-mcp.md)。

## 验证

工具和 OAuth 集成测试使用真实 SDK 与授权组件；数据库测试执行实际 PostgreSQL SQL。UI、部署路由、契约分别有测试。正式客户端名单必须依据实际版本验收，不能由配置示例推导。生产开关、反向代理和真实代码生成仍需部署环境验收。

## 相关文档

- [Coding Agent MCP 接入](../../../../docs/integrations/coding-agent-mcp.md)
- [共享契约](../../../../packages/contracts/src/mcp/index.ts)
