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

项目自有 Markdown 文件和文档目录使用英文小写 `kebab-case`。固定协议文件仅保留 `README.md`、`AGENTS.md` 和 `SKILL.md` 约定名称。活文档文件名不使用日期或 `plan`、`audit`、`final`、`followup`、`fixes` 等过程状态。

### 结构

每个 Markdown 只有一个一级标题，章节不跳级。技术文档、应用内指南和组件 README 使用各自固定章节。内部链接使用相对路径和 `/`。

### 跟踪边界

- `apps/web/public/sandpack/` 由 Web 的预开发和预构建脚本生成，不跟踪。
- `apps/web/.next*/`、根目录 `.tmp-*.json` 与 `apps/web/.tmp-*.png` 是本地构建或视觉验证产物，不跟踪。
- `apps/api/.local-documents/`、`tmp/`、日志、测试证据和本地密钥不跟踪。
- `plantuml/build/libs/plantuml-1.2026.3beta8.jar` 是 CI 与生产渲染的明确运行时例外，继续跟踪。
- `apps/api/src/code-skills/ui-ux-pro-max/` 是运行时 Skill 资产，不按普通文档重写。

## 操作与维护

- 有长期价值的结论合并到主题文档，完成后删除过程稿。
- 新增图片前确认被 README、应用或文档引用。
- 构建生成内容写入已忽略目录，不能依赖手工提交。
- 删除文件前确认没有运行时引用；大型二进制只有在明确必需时保留。

## 验证

```bash
npm run audit:docs
git status --short
git ls-files
```

提交前还应运行相关测试和生产构建，并确认生成目录仍被忽略。

## 相关文档

- [文档索引](../README.md)
- [平台架构](../architecture/platform-overview.md)
- [项目协作规范](../../AGENTS.md)
