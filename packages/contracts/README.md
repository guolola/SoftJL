# 共享契约

## 职责

提供应用和提示词共同使用的 schema、类型、业务身份与确定性规则。

## 边界

按需求、建模、运行、工作区、访问控制和 MCP 等领域组织内部实现。公共业务入口为包根；纯测试夹具通过 `@uml-platform/contracts/testing` 使用，不进入包根导出。

## 使用或常用命令

在仓库根目录运行 `npm run build:contracts` 和 `npm run test:contracts`。

## 配置

使用根 TypeScript 配置并构建到已忽略的 `dist/`。其他工作区使用声明的包入口，不能绕过入口读取本包源码或构建目录。

## 验证

覆盖当前 schema、共享规则与公共导出契约。测试与所属领域源码相邻。

## 相关文档

- [仓库治理规范](../../docs/development/repository-hygiene.md)
- [建模能力](../../docs/architecture/modeling-capabilities.md)
