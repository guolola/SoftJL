<!-- 说明平台接入 OpenAI 兼容模型供应商时使用的合同与安全限制。 -->

# OpenAI 兼容模型供应商

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 持续维护 |
| 目标读者 | 后端开发、集成人员与平台管理员 |
| 事实来源 | 模型供应商适配器、地址校验与连接测试 |

## 概述

平台通过 OpenAI 兼容接口发现模型并发起聊天生成。用户只需配置供应商根地址、API Key 和默认模型；后端负责地址规范化、安全校验与请求转发。

## 当前设计或配置

### 请求合同

- 聊天请求使用 `POST /v1/chat/completions`。
- API Key 通过 `Authorization: Bearer <API_KEY>` 发送。
- JSON 请求包含 `model`、`messages`，并可使用 `stream`、结构化输出和工具调用字段。
- 流式响应使用 SSE，并以 `data: [DONE]` 结束。

地址规范化会接受供应商根地址或兼容端点形式，并避免重复拼接路径。模型列表以当前供应商发现结果为准，不在文档中固定排名或型号。

### 安全限制

托管供应商地址必须使用公网 HTTPS、默认安全端口，不得包含 URL 凭据，也不得通过重定向或 DNS 解析访问本机、内网或保留地址。密钥加密后持久化，日志与接口响应不得回传明文。

## 操作与维护

1. 在账号设置中新增供应商，填写 Base URL 与 API Key。
2. 执行模型发现和连通性测试。
3. 选择适合结构化输出、长上下文和当前任务的模型。
4. 保存为默认供应商或在项目中选择允许的模型。
5. 供应商变更协议时先更新适配器合同和测试，再更新文档。

## 验证

- 测试根地址和已带路径的地址不会产生重复路径。
- 测试 Bearer 认证、普通 JSON、SSE 增量与 `[DONE]`。
- 测试无效凭据、限流、超时、非 JSON 与中断流。
- 测试内网地址、非 HTTPS、异常端口和重定向均被拒绝。

## 相关文档

- [平台架构](../architecture/platform-overview.md)
- [生产环境配置](../deployment/production-environment.md)
- [应用内供应商配置](../../apps/web/src/features/product-docs/content/provider-configuration.md)
- [应用内模型选择指南](../../apps/web/src/features/product-docs/content/recommended-models.md)
