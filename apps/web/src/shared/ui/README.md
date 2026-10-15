<!-- 说明 Web 共享 UI 层的职责、边界和验证要求。 -->

# 共享 UI

## 职责

提供源自 AdminCN full-navbar-layout 的 Base UI 基础组件、交互约定和可访问性能力。导入来源与原始摘要记录在 `template-sources.json`。

## 边界

共享 UI 不包含具体业务流程、服务请求或页面级状态。业务组合放在 `features`，领域数据放在 `entities`，页面编排放在 `app`。

## 使用或常用命令

业务页面必须复用已导入的模板组件。Flow 官网保留独立的原模板组件与动画，不反向依赖业务页面。React 18 的 ref 转发和 History API 导航适配不得改变模板视觉。

```bash
npm run test:web
npm run typecheck:web
```

## 配置

采用模板默认主题与字体，仅提供明暗切换；无保存偏好时跟随系统。通过页面主题标识隔离 Flow 和 AdminCN 变量，并使浮层继承相同主题。旧字号与密度偏好不再参与渲染。

## 组合约定

业务界面的页面级组合统一复用 `shared/template/layout/page.tsx`：`PageContainer`（AdminCN compact 外壳 `max-w-360 px-4 py-6 sm:px-6`，画布类界面用 `flush`）、`PageHeader`（`h1 text-xl font-bold` + muted 描述 + 右侧 actions）、`StatGrid`/`StatCard`、`TableToolbar`（InputGroup 搜索 `max-w-2xs` + 筛选 + 行/页 Select）、`TablePagination`、`EmptyState`（虚线面板 + `size-12` 图标）。

- 表格面：`Card className="py-0 shadow-none"` → `TableToolbar` → `Table` → `TablePagination`；过宽矩阵给 `<Table className="min-w-[Npx]">` 走横向滚动，禁止整体缩放。
- 设置面：`PageHeader` → `TabsList variant="line"` → 分节 `Card` + `Field/FieldGroup`，危险区用 `border-destructive/40`。
- 双栏编辑器：`grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]`；仪表盘：`grid grid-cols-6 gap-6` + 响应式 col-span。
- 弹窗：`DialogContent` 显式 `max-w-md|lg|xl|4xl` + `max-h-[85vh] overflow-y-auto`。
- 禁止在 `features/`、`app/` 内手写 `<button>/<input>/<textarea>/<select>/<table>` 及 `rounded-* border` 面板（governance 测试扫描）；白名单仅 sr-only 文件输入、Monaco/OnlyOffice 宿主、SVG 画布、resize handle。

## 验证

覆盖关键状态、键盘操作、禁用原因和用户可见反馈；重点验证菜单点击、弹窗焦点恢复、空值选择和百分比分栏。布局以业务基线和模板外壳分别验收，官网另行验证滚动与动画时序。

## 相关文档

- [平台架构](../../../../../docs/architecture/platform-overview.md)
- [仓库治理规范](../../../../../docs/development/repository-hygiene.md)
