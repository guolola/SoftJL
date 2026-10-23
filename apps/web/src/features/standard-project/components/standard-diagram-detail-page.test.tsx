// Covers ordinary detail parity, persisted edits, structural guards and compact/read-only navigation.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { standardModelFixture } from "@uml-platform/contracts/testing";
import type { StandardModel, StandardDiagram } from "@uml-platform/contracts";
import { withWorkspaceProviders } from "../../../../tests/helpers/workspace-test-utils";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/index";
import { downloadTextFile } from "../../../shared/lib/download";
import { StandardDiagramDetailPage } from "./standard-diagram-detail-page";

vi.mock("../../../shared/lib/download", () => ({ downloadTextFile: vi.fn(), downloadBlobFile: vi.fn() }));
const diagramFixture = (): StandardDiagram & { model: Extract<StandardModel, { diagramKind: "class" }> } => ({
  id: "class", kind: "class", title: "借阅设计类图", status: "completed",
  source: "@startuml\nclass Book\n@enduml",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><g id="elem_n_626f6f6b"><rect width="100" height="50"/><text>图书</text></g></svg>',
  model: { ...standardModelFixture("class"), classes: [
    { id: "book", name: "图书", attributes: [{ name: "ISBN", type: "String", visibility: "private", constraints: [] }], operations: [{ name: "borrow", visibility: "public", parameters: [], returnType: "void" }], constraints: [] },
    { id: "reader", name: "读者", attributes: [{ name: "name", type: "String", visibility: "private", constraints: [] }], operations: [], constraints: [] },
  ], relationships: [{ id: "borrows", sourceId: "reader", targetId: "book", label: "借阅", type: "association", sourceMultiplicity: "1", targetMultiplicity: "*" }] },
});
const props = () => ({ diagram: diagramFixture(), disabled: false, canEdit: true, onSave: vi.fn(async () => true as boolean | undefined) });
function mount(input = props()) {
  return render(withWorkspaceProviders(<StandardDiagramDetailPage {...input} />, createMockWorkspaceRepository()));
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

it("uses the professional header, canvas toolbar, overview and element/relation lists", async () => {
  const user = userEvent.setup(); const input = props(); mount(input);
  expect(screen.getByRole("heading", { name: "借阅设计类图" })).toBeInTheDocument();
  expect(screen.getByTestId("diagram-preview-section")).toBeInTheDocument();
  expect(screen.getByTestId("svg-preview-canvas")).toContainHTML('id="elem_n_626f6f6b"');
  expect(screen.getByRole("heading", { name: "元素清单" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "关系说明" })).toBeInTheDocument();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "放大 SVG" }));
  expect(screen.getByText("125%")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "适应宽度" }));
  expect(screen.getByText("100%")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "打开模型概览" }));
  expect(screen.getByRole("complementary", { name: "模型概览" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /定位.*图书/ }));
  expect(screen.getByRole("complementary")).toHaveTextContent(/ISBN.*String/);
  expect(screen.queryByRole("button", { name: /返回项目会话|返回图列表|重新生成此图/ })).not.toBeInTheDocument();
});

it.each(["light", "dark"])("preserves diagram content while zooming in the %s theme", async (theme) => {
  const user = userEvent.setup();
  const input = props();
  input.diagram.svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" style="background:transparent"><path id="connector" d="M10 10L200 200" stroke="#181818"/><text fill="#000000">借阅关系</text></svg>';
  render(withWorkspaceProviders(<div className={theme}><StandardDiagramDetailPage {...input} /></div>, createMockWorkspaceRepository()));
  const canvas = screen.getByTestId("svg-preview-canvas");
  const paper = canvas.querySelector(".uml-inline-svg");
  expect(paper).toHaveTextContent("借阅关系");
  await user.click(screen.getByRole("button", { name: "放大 SVG" }));
  expect(paper).toHaveStyle({ "--uml-svg-width": "750px" });
});

it("searches elements and relationships and exports the saved artifacts", async () => {
  const user = userEvent.setup(); mount();
  await user.type(screen.getByRole("textbox", { name: "搜索元素" }), "ISBN");
  expect(screen.getByRole("button", { name: /定位.*图书/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /定位.*读者/ })).not.toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "搜索关系" }), "不存在");
  expect(screen.queryByRole("button", { name: /编辑.*借阅/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "下载" }));
  await user.click(await screen.findByRole("menuitem", { name: "SVG" }));
  expect(downloadTextFile).toHaveBeenCalledWith("借阅设计类图.svg", expect.stringContaining("<svg"), "image/svg+xml");
});

it("keeps failed drafts and persists names, fields and methods only after confirmation", async () => {
  const user = userEvent.setup(); const input = props(); input.onSave.mockResolvedValueOnce(false).mockResolvedValueOnce(true); mount(input);
  await user.click(screen.getByRole("button", { name: "编辑类：图书" }));
  const dialog = screen.getByRole("dialog");
  await user.clear(within(dialog).getByLabelText("类名称"));
  await user.type(within(dialog).getByLabelText("类名称"), "馆藏图书");
  await user.clear(within(dialog).getByLabelText("第 1 个操作名称"));
  await user.type(within(dialog).getByLabelText("第 1 个操作名称"), "reserve");
  expect(input.onSave).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "确认编辑" }));
  expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("类名称")).toHaveValue("馆藏图书");
  await user.click(within(dialog).getByRole("button", { name: "确认编辑" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(input.onSave).toHaveBeenLastCalledWith({ ...input.diagram.model, classes: [
    { ...input.diagram.model.classes[0], name: "馆藏图书", operations: [{ ...input.diagram.model.classes[0].operations[0], name: "reserve" }] }, input.diagram.model.classes[1],
  ] });
});

it("edits relationships while preserving endpoints, multiplicities and type", async () => {
  const user = userEvent.setup(); const input = props(); mount(input);
  await user.click(screen.getByRole("button", { name: /编辑.*关系.*借阅/ }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("起点")).toHaveTextContent("读者");
  expect(within(dialog).getByLabelText("终点")).toHaveTextContent("图书");
  await user.clear(within(dialog).getByLabelText("关系名称")); await user.type(within(dialog).getByLabelText("关系名称"), "预约");
  await user.click(within(dialog).getByRole("button", { name: "确认编辑" }));
  expect(input.onSave).toHaveBeenCalledWith({ ...input.diagram.model, relationships: [{ ...input.diagram.model.relationships[0], label: "预约" }] });
});

it("blocks deleting a referenced class until its relationships are edited", async () => {
  const user = userEvent.setup(); const input = props(); mount(input);
  await user.click(screen.getByRole("button", { name: "删除类：图书" }));
  expect(input.onSave).not.toHaveBeenCalled();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认删除" }));
  expect(input.onSave).not.toHaveBeenCalled();
  expect(await within(screen.getByRole("dialog")).findByRole("alert")).toBeInTheDocument();
});

it("blocks structurally invalid deletion and rejects empty class names", async () => {
  const user = userEvent.setup(); const input = props(); input.diagram.model.classes = [input.diagram.model.classes[0]]; input.diagram.model.relationships = []; mount(input);
  await user.click(screen.getByRole("button", { name: "删除类：图书" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认删除" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("模型结构不完整");
  expect(input.onSave).not.toHaveBeenCalled();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
  await user.click(screen.getByRole("button", { name: "编辑类：图书" }));
  await user.clear(within(screen.getByRole("dialog")).getByLabelText("类名称"));
  await user.click(screen.getByRole("button", { name: "确认编辑" }));
  expect(input.onSave).not.toHaveBeenCalled();
});

it("keeps inspection available in read-only projects and guards edits when permissions change", async () => {
  const user = userEvent.setup(); const input = props(); const view = mount(input);
  await user.click(screen.getByRole("button", { name: "编辑类：图书" }));
  view.rerender(withWorkspaceProviders(<StandardDiagramDetailPage {...input} canEdit={false} disabled />, createMockWorkspaceRepository()));
  expect(screen.getByRole("button", { name: "确认编辑" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "确认编辑" }));
  expect(input.onSave).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("button", { name: "编辑类：图书" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /定位.*图书/ })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "重新生成此图" })).not.toBeInTheDocument();
});

it("uses compact detail tabs and locates an element back in the canvas", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({ matches: query === "(max-width: 767px)", media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const user = userEvent.setup(); mount();
  expect(screen.getByRole("tab", { name: "图" })).toHaveAttribute("aria-selected", "true");
  await user.click(screen.getByRole("tab", { name: "元素" }));
  await user.click(screen.getByRole("button", { name: /定位.*图书/ }));
  expect(screen.getByRole("tab", { name: "图" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("complementary")).toHaveTextContent("图书");
  await user.click(screen.getByRole("tab", { name: "关系" }));
  expect(screen.getByRole("heading", { name: "关系说明" })).toBeInTheDocument();
});
