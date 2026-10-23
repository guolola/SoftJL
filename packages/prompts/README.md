# 提示词

## 职责

构建生成、修复、自检与说明书任务所需的当前提示词。

## 边界

依赖共享契约，不调用外部模型、不保存运行状态，也不依赖任何应用内部实现。

## 使用或常用命令

在仓库根目录运行 `npm run build:prompts` 和 `npm run test:prompts`。

## 配置

继承根 TypeScript 配置。业务入口由 `src/index.ts` 明确导出。

## 验证

验证上下文内容、结构约束、当前生成规则及公共导出；测试夹具通过共享契约的测试入口使用。

## 相关文档

- [共享契约](../contracts/README.md)
- [仓库治理规范](../../docs/development/repository-hygiene.md)
