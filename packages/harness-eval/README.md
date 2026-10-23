# 生成质量评估工具

## 职责

读取固定需求夹具，多次运行后输出结构、语义规则与追踪覆盖的自动评分。离线 mock 用于验证报告与评分规则，不能作为真实模型质量结果。

## 边界

API 模式通过正常会话认证、项目权限与保存的供应商配置启动和轮询任务，不绕过权限，也不直接发送模型密钥。结果仍需人工复核；当前夹具不代表所有业务或完整工程验收。

## 使用或常用命令

```bash
npm run build:packages
npm run test:harness-eval
npm run typecheck:harness-eval
npm run eval:harness
```

API 模式先启动核心服务，使用有权限的账号创建专用评估项目，在账号中保存供应商并完成模型发现和连接测试。把配置放入当前进程环境，再执行评估；此命令不自动加载根目录 `.env`。模型调用由自己的供应商结算，默认每个夹具尝试五次。

## 配置

| 变量 | 用途 |
| --- | --- |
| `UML_EVAL_MOCK=1` | 离线生成固定快照，仅验证评估器 |
| `UML_EVAL_API_BASE_URL` | API 根地址，默认本机 `4101` |
| `UML_EVAL_PROJECT_ID` | 当前账号有生成权限的专用项目 |
| `UML_EVAL_PROVIDER_CONFIG_ID`、`UML_EVAL_MODEL` | 已保存的供应商配置及其可用模型 |
| `UML_EVAL_USERNAME`、`UML_EVAL_PASSWORD` | 登录并在评估后注销工具创建的会话 |
| `UML_EVAL_SESSION_COOKIE` | 可选完整 Cookie 请求头；优先使用，工具不注销借用的会话；启用 MFA 时先完成正常登录 |
| `UML_EVAL_ATTEMPTS` | 每个夹具尝试次数，默认 `5`，范围 `1–100` |
| `UML_EVAL_TIMEOUT_MS`、`UML_EVAL_POLL_MS` | 单次运行超时与轮询间隔，默认 `180000` / `1000` 毫秒 |

账号、密码和 Cookie 属于秘密，不要放入 Issue、报告或提交。评估仅使用明确配置的专用项目：每个夹具先提交需求并提取规则，等待基线发布后按已保存来源启动建模；失败或取消的提取不会继续建模。不为评估隐式创建其他项目。

## 验证

测试使用真实 API 组装与内存存储验证登录、项目授权、运行发起、认证轮询、注销和未授权拒绝；模型输出使用故意无效的本地结果触发终态，避免外部调用。还覆盖 MFA 提示、错误脱敏与离线评分。真实模型质量需另行运行 API 模式。

## 相关文档

- [项目首页](../../README.md)
- [贡献指南](../../contributing.md)
- [模型服务接入](../../docs/integrations/openai-compatible-provider.md)
