// Verifies rich quick-model edits retain their semantics and avoid engineering source controls.
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { validateStandardModel, type StandardDiagram, type StandardModel } from "@uml-platform/contracts";
import { modelReviewFixtures, standardModelFixture } from "@uml-platform/contracts/testing";
import { withWorkspaceProviders } from "../../../../tests/helpers/workspace-test-utils";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/index";
import { StandardModelEditPanel } from "./standard-model-edit-panel";

function mount(model: StandardModel, onSave = vi.fn(async () => true as boolean | undefined)) {
  const diagram: StandardDiagram = { id: model.diagramKind, kind: model.diagramKind, title: model.title, model, status: "completed" };
  render(withWorkspaceProviders(<StandardModelEditPanel diagram={diagram} disabled={false} readOnly={false} onSave={onSave} onSelectElement={() => undefined} />, createMockWorkspaceRepository()));
  return onSave;
}

it("does not require a professional use-case source when opening an ordinary sequence", () => {
  const model = standardModelFixture("sequence");
  if (model.diagramKind !== "sequence") throw new Error("fixture");
  delete model.sourceUseCaseId;
  mount(model);
  expect(screen.queryByText(/sourceUseCaseId|草稿尚未通过校验|保留上次有效结果/)).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("edits ER identifying attributes and retains failed drafts and all relationships", async () => {
  const user = userEvent.setup();
  const model = standardModelFixture("er");
  const onSave = mount(model, vi.fn(async () => false as boolean | undefined).mockResolvedValueOnce(false).mockResolvedValueOnce(true));
  await user.click(screen.getByRole("button", { name: "编辑 实体 图书" }));
  const dialog = screen.getByRole("dialog");
  await user.clear(within(dialog).getByLabelText("属性 1"));
  await user.type(within(dialog).getByLabelText("属性 1"), "图书编号");
  await user.click(within(dialog).getByRole("button", { name: "保存并更新此图" }));
  expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("属性 1")).toHaveValue("图书编号");
  expect(within(dialog).getByRole("checkbox", { name: "标识属性" })).toBeChecked();
  await user.click(within(dialog).getByRole("button", { name: "保存并更新此图" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(onSave).toHaveBeenLastCalledWith({ ...model, entities: [{ ...model.entities[0], attributes: [{ ...model.entities[0].attributes[0], name: "图书编号" }] }, model.entities[1]] });
});

it("rejects invalid ER cardinalities and saves a valid correction without changing endpoints", async () => {
  const user = userEvent.setup(); const model = standardModelFixture("er"); const onSave = mount(model);
  await user.click(screen.getByRole("button", { name: "编辑 实体关系 借阅" }));
  const dialog = screen.getByRole("dialog");
  await user.clear(within(dialog).getByLabelText("源基数"));
  await user.type(within(dialog).getByLabelText("源基数"), "4..1");
  await user.click(within(dialog).getByRole("button", { name: "保存并更新此图" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  await user.clear(within(dialog).getByLabelText("源基数"));
  await user.type(within(dialog).getByLabelText("源基数"), "0..*");
  await user.click(within(dialog).getByRole("button", { name: "保存并更新此图" }));
  expect(onSave).toHaveBeenCalledWith({ ...model, relationships: [{ ...model.relationships[0], sourceMultiplicity: "0..*" }] });
});

it("edits native nested sequence fragments without dropping branches or messages", async () => {
  const user = userEvent.setup();
  const model = validateStandardModel("sequence", modelReviewFixtures("design", "sequence")[1].model);
  if (model.diagramKind !== "sequence") throw new Error("fixture");
  const onSave = mount(model);
  await user.click(screen.getByRole("button", { name: "编辑组合片段：重复处理" }));
  const dialog = screen.getByRole("dialog");
  await user.clear(within(dialog).getByLabelText("组合片段名称"));
  await user.type(within(dialog).getByLabelText("组合片段名称"), "逐项处理订单");
  await user.click(within(dialog).getByRole("button", { name: "确认编辑" }));
  expect(onSave).toHaveBeenCalledWith({ ...model, fragments: model.fragments.map(fragment => fragment.id === "loop" ? { ...fragment, label: "逐项处理订单" } : fragment) });
});

it("hides source-rule controls while keeping ordinary functional edits available", async () => {
  const user = userEvent.setup(); const model = standardModelFixture("function"); const onSave = mount(model);
  await user.click(screen.getByRole("button", { name: "编辑功能：下单" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByText(/来源需求|来源用例|来源设计类/)).not.toBeInTheDocument();
  const name = within(dialog).getByRole("textbox", { name: /名称/ });
  await user.clear(name); await user.type(name, "提交订单");
  await user.click(within(dialog).getByRole("button", { name: "确认编辑" }));
  expect(onSave).toHaveBeenCalledWith({ ...model, nodes: model.nodes.map(node => node.id === "child" ? { ...node, name: "提交订单" } : node) });
});
