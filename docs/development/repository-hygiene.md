<!-- 规定仓库文档、生成目录和临时产物的长期治理方式。 -->

# 仓库治理规范

| 元信息 | 内容 |
| --- | --- |
| 维护状态 | 强制执行 |
| 目标读者 | 所有贡献者与自动化代理 |
| 事实来源 | `AGENTS.md`、`.gitignore` 与文档检查脚本 |

## 概述

仓库只跟踪源码、必要运行时资产和可维护的现状文档。历史计划、审计流水、临时截图、本地数据、凭据和可重复生成的第三方目录不进入当前版本。

## 当前设计或配置

### 命名

项目自有 Markdown 文件和文档目录使用英文小写 `kebab-case`。`README.md`、`AGENTS.md`、`SKILL.md` 和 `.github/` 下的 GitHub 社区协议文件、模板目录保留约定名称。活文档文件名不使用日期或 `plan`、`audit`、`final`、`followup`、`fixes` 等过程状态。

### 结构

每个 Markdown 只有一个一级标题，章节不跳级。技术文档、应用内指南和组件 README 使用各自固定章节。内部链接使用相对路径和 `/`。

| 位置 | 归属 |
| --- | --- |
| `apps/` | 独立运行的 Web、API 和渲染服务 |
| `packages/contracts/` | 按业务域组织的共享协议、规则及独立测试夹具入口 |
| `packages/prompts/` | 提示词构建，不依赖应用内部实现 |
| `packages/demo-fixtures/` | API 演示与前端测试共用的冻结数据 |
| `packages/harness-e2e/`、`packages/harness-eval/` | 独立浏览器验收和生成评估 |
| `scripts/` | 开发、CI、部署与检查入口 |
| `docs/` | 架构、部署、开发和集成说明 |

根级 `tsconfig.base.json` 保存公共编译选项，工作区保留各自输入、输出及运行环境设置。工作台原模板的边界、许可证和来源清单继续保留，官网宣传资源不随社区版发布。

### 测试与工作区边界

模块测试与源码相邻；应用级集成测试放在应用的 `tests/integration/`，专用测试数据和辅助方法放在 `tests/fixtures/`、`tests/helpers/`。Web 初始化与通用辅助代码通过 `@test/*` 引用。跨工作区纯夹具使用 `@uml-platform/contracts/testing`，演示场景使用 `@uml-platform/demo-fixtures`。

应用内部测试不能读取另一个应用的内部实现，或通过相对路径绕过其他包的公开入口访问 `src/`、`dist/`。独立端到端工作区可以显式加载受测服务模块准备集成场景，生产包不能反向依赖该工作区。移动测试时同步修改发现规则与 CI，并核对测试用例数量。

### 跟踪边界

- 旧代码预览的 `apps/web/public/sandpack/` 与 `apps/web/public/vendor/` 已停用；现行 Web 启动和构建不生成这些目录。
- `apps/web/.next*/`、根目录 `.tmp-*.json` 与 `apps/web/.tmp-*.png` 是本地构建或视觉验证产物，不跟踪。
- `apps/api/.local-documents/`、`tmp/`、日志、测试证据和本地密钥不跟踪。
- `plantuml/plantuml-1.2026.3beta8.jar` 是 CI 与生产渲染的明确运行时例外，继续跟踪。
- `apps/api/src/code-skills/ui-ux-pro-max/` 是运行时 Skill 资产，不按普通文档重写。

## 操作与维护

- 有长期价值的结论合并到主题文档，完成后删除过程稿。
- 新增图片前确认被 README、应用或文档引用。
- 构建生成内容写入已忽略目录，不能依赖手工提交。
- 删除文件前确认没有运行时引用；大型二进制只有在明确必需时保留。
- 一次性维护数据不独占脚本目录；有运行时用途的资产归所属模块，无用途的本地留存进入已忽略目录。

## 验证

```bash
npm run audit:docs
npm run build:packages
npm run test:api
npm run test:web
npm run typecheck:web
git status --short
git ls-files
```

提交前还应运行相关测试和生产构建，并确认生成目录仍被忽略。

## 相关文档

- [文档索引](../README.md)
- [平台架构](../architecture/platform-overview.md)
- [项目协作规范](../../AGENTS.md)
