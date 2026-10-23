<!-- 说明端到端测试工具包覆盖的场景与使用边界。 -->

# 端到端测试工具包

## 职责

以真实浏览器验证工作台布局与操作流程，并输出便于定位问题的测试证据。各场景通过受控 API 响应或显式调用受测服务准备数据。

## 边界

本包是独立集成测试工作区，不承载生产业务逻辑，也不被生产应用依赖。应用内部测试继续遵守工作区边界；本包可显式调用受测服务准备场景。

## 使用或常用命令

```bash
npm run test:harness-e2e
npm run test:harness-e2e -- --list
```

列表命令只收集用例，不启动网页或浏览器。运行浏览器验收前完成 `npm run build:packages`；测试配置负责构建 Web 并启动独立测试端口。

## 配置

测试使用固定的隔离站点来源。CI 已用相同来源构建生产 Web 时，可以设置 `PLAYWRIGHT_SKIP_BUILD=1` 复用产物，避免重复构建。配置应使用专用测试变量，禁止提交真实账号、密钥或生成产物。

需要可用的 Playwright 浏览器执行文件，或设置 `PLAYWRIGHT_USE_SYSTEM_CHROME=1` 使用本机 Chrome。`UML_E2E_USE_EXISTING_BUILD=true` 仅在已有完整 Web 构建时跳过重复构建。

## 验证

先完成共享契约构建，再运行端到端测试并检查所有场景及证据输出。

## 相关文档

- [可信生成链路](../../docs/architecture/trusted-generation.md)
- [仓库治理规范](../../docs/development/repository-hygiene.md)
