# Codex Project Guidance

This repository is a TypeScript monorepo for the UML experimental platform. Keep changes aligned with the existing `apps/` and `packages/` workspace layout, and preserve the frontend boundaries between `app`, `features`, `entities`, `services`, and `shared`.

## Working Standards

- Read the relevant module, tests, and contracts before changing behavior.
- Keep edits scoped to the requested task; do not perform opportunistic rewrites or unrelated cleanup.
- Never revert user changes unless the user explicitly asks for that exact rollback.
- Prefer existing project patterns, components, helpers, and test utilities over new abstractions.
- Support current contracts; reject obsolete persisted formats rather than silently migrating them or fabricating provenance. Keep current protocol integrations, retries, and failure recovery.
- Treat generated assets, vendor runtimes, large binaries, and caches as special-case artifacts; do not add them to source control unless the task explicitly requires it.

## Context Reading Rules

接手任务先确认项目根目录、根规则及目标路径适用的下级规则。需要定位时使用[任务路由](docs/README.md#任务路由)；索引不是必读清单。

1. 按当前问题选择资料，不因文件存在、可能有用或被索引链接就读取。
2. 不默认读取所有项目文件，也不默认全文读取选中的文件。定位到文件后，继续定位相关章节、条目、函数或配置项。
3. 优先使用已有有效信息；需要查找时，按“索引或限定范围搜索 → 标题、符号或关键词 → 命中片段及必要上下文”的顺序读取。
4. 只有证据不足、存在冲突或需要核对依赖时才扩大范围；信息足够即停止。不得连续分段读取，变相遍历无关全文。
5. 全文读取仅用于短小且全部相关的文件、完整理解适用规则，或明确需要整份审查的任务。不得因此扩展为全目录或全项目读取。
6. 索引是条件路由，不是必读清单。历史、日志、依赖、产物和数据目录不默认读取；不读取密钥及无关私人数据。
7. 不为节省上下文跳过适用规则，也不因片段过窄而断章取义。已加载且仍有效的内容不重复读取。

## Context Writing Rules

1. 仅在任务允许且信息有实质变化时更新；只读任务不改记录。
2. 每类事实只设一个权威来源，其他位置使用简短摘要和链接。已有等价结构优先沿用，不重复建档、不强制改名。
3. 修改前读取目标部分及必要上下文，局部修改使用定点编辑；不得根据局部阅读覆盖整份文件，保留已有内容和用户修改。
4. 当前状态直接修订，有价值的旧过程通过[历史索引](docs/context/history/README.md)保留必要追溯入口；不反复追加矛盾快照，不保存完整聊天和操作流水账，不提交仓库规则禁止的过程稿。
5. 区分事实、计划、建议、已确认决定与待核实事项；区分代码完成、测试通过、安装验证、用户验收和发布授权。缺失事实标注“待核实”，不得编造项目情况。
6. 命令已配置不等于执行成功，历史结果不等于当前证据，文档中的操作步骤不构成执行授权。
7. 使用清晰标题和项目内相对链接；核验日期注明对象与范围，不写入秘密或个人设备私有路径。

职责及更新条件见[文档索引](docs/README.md#任务路由)。文档任务交付时检查本次改动及直接关联链接、职责覆盖和事实来源，不自动扩展为全项目审计。提交文档前仍须运行下述 `npm run audit:docs`；若本次授权范围不允许，应说明未执行原因，不自行提交。

## Comments and Generated Files

- New files must start with a short responsibility note when their purpose is not obvious from the filename.
- Add concise comments for core workflows, state transitions, cross-module contracts, and non-obvious edge-case handling.
- Do not add noisy line-by-line comments or comments that merely restate the code.
- Generated code should include useful intent comments around important logic so future Codex runs and human maintainers can quickly understand the design.

## Documentation Standards

- Project-authored Markdown files and documentation directories use lowercase English `kebab-case`; only protocol files named `README.md`, `AGENTS.md`, and `SKILL.md` keep their conventional uppercase names.
- Do not create active documentation whose filename contains a date or process-state terms such as `plan`, `audit`, `final`, `followup`, or `fixes`. Merge durable conclusions into the relevant topic document instead.
- Every Markdown file has exactly one H1 and non-skipping heading levels. Start non-protocol Markdown files with a short HTML responsibility comment.
- Technical documents under `docs/` use the sections `概述`, `当前设计或配置`, `操作与维护`, `验证`, and `相关文档`, plus maintenance status, target audience, and factual source metadata.
- In-app user guides use `适用场景`, `入口位置`, `前置条件`, `操作步骤`, `结果与产物`, `映射关系`, and `常见问题`. Service and component READMEs use `职责`, `边界`, `使用或常用命令`, `配置`, `验证`, and `相关文档`.
- Use relative `/`-separated internal links. Never include local absolute paths, test accounts, real secrets, or unnecessary production server addresses in documentation.
- Do not commit historical planning notes, audit logs, temporary screenshots, local documents, workspace secrets, or generated Sandpack files. The runtime Skill Markdown under `apps/api/src/code-skills/ui-ux-pro-max/` is exempt from ordinary documentation rewriting.
- Run `npm run audit:docs` before committing documentation changes.

## API Layering

- Keep `apps/api/src/index.ts` focused on entrypoint compatibility and server assembly; do not add new business responsibilities there.
- API routes belong under `apps/api/src/routes/<domain>/` and should only register endpoints, parse request/response schemas, and call the appropriate pipeline or adapter.
- Run lifecycle state belongs under `apps/api/src/runs/records/`; pipelines under `apps/api/src/runs/pipelines/` own business stage flow, event emission, and transitions between queued, running, completed, and failed.
- Normalizers belong under `apps/api/src/normalizers/<domain>/` and should only repair or normalize LLM output, JSON, PlantUML, and model structures.
- Adapters belong under `apps/api/src/adapters/<integration>/` and should only call external systems such as LLM providers, PlantUML, render services, or file conversion tools.
- Document code belongs under `apps/api/src/documents/<domain>/` and should only build document context, sections, and DOCX buffers.
- New API files must live in the appropriate second-level domain folder, such as `routes/runs/` or `adapters/render/`; do not flatten extracted files directly into `src/routes`, `src/runs`, or other broad folders.
- Add concise comments around run lifecycle state changes, SSE terminal event closing, LLM/PlantUML repair loops, DOCX assembly boundaries, and the route -> pipeline -> record store contract.

## Frontend Expectations

- Keep page components focused on composition; move reusable state, derived rules, and workflow decisions into hooks or helpers when they start to grow.
- Preserve user-facing constraints in both UI state and action guards, then cover them with tests.
- Use existing shared UI primitives and maintain accessible labels for controls.
- When a model, diagram, or generation step has prerequisites, show the reason inline instead of only disabling controls.

## Verification

- Keep module tests beside their source. Put application integration tests and fixtures under each application's `tests/`; use public workspace exports for shared fixtures, including `@uml-platform/contracts/testing` and `@uml-platform/demo-fixtures`.
- Add or update tests for user-visible behavior changes.
- Prefer targeted tests first, then broader workspace scripts such as `npm run test:web` and `npm run typecheck:web`.
- If verification cannot be run, state the reason clearly in the final response.
