// Verifies the shared model editor enforces context-specific collection and source-rule constraints.
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelEditPanel } from "./model-edit-panel";

const contextModel = {
  diagramKind: "context",
  modelId: "context",
  title: "订单系统上下文",
  summary: "系统边界",
  notes: [],
  system: { id: "system", name: "订单系统", description: "目标系统", sourceRequirementIds: [] },
  people: [{ id: "customer", name: "客户", description: "下单", sourceRequirementIds: ["r1"] }],
  externalSystems: [{ id: "payment", name: "支付平台", description: "支付", sourceRequirementIds: ["r1"] }],
  relationships: [{ id: "pay", sourceId: "system", targetId: "payment", direction: "directed", label: "发起支付", description: "支付请求", sourceRequirementIds: ["r1"] }],
} satisfies Record<string, unknown>;

function ContextEditor({
  section,
  onCommit,
  initialModel = contextModel,
  readOnly = false,
  saving = false,
}: {
  section: "elements" | "relationships";
  onCommit: (draft: Record<string, unknown>) => Promise<void>;
  initialModel?: Record<string, unknown>;
  readOnly?: boolean;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(structuredClone(initialModel));
  return (
    <ModelEditPanel
      draft={draft}
      setDraft={setDraft}
      onCommitDraft={async (next) => {
        setDraft(next);
        await onCommit(next);
      }}
      onSelectElement={() => undefined}
      saving={saving}
      readOnly={readOnly}
      visibleSection={section}
      sourceRuleOptions={[{ id: "r1", label: "客户可以发起订单" }]}
    />
  );
}

describe("ModelEditPanel context mode", () => {
  it("keeps the fixed system singleton and requires a valid source rule for new people", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(draft: Record<string, unknown>) => Promise<void>>(async () => undefined);
    render(<ContextEditor section="elements" onCommit={onCommit} />);

    expect(screen.queryByRole("button", { name: "添加中心系统" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除中心系统：订单系统" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加人员" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加" }));
    expect(screen.queryByRole("menuitem", { name: "添加中心系统" })).not.toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: "添加外部系统" })).toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "添加人员" }));
    const dialog = screen.getByRole("dialog", { name: "添加人员" });
    expect(dialog.querySelector('[data-slot="field-set"]')).toHaveClass(
      "rounded-xl",
      "bg-muted/10",
      "p-4",
      "sm:p-5",
    );
    expect(screen.getByRole("checkbox", { name: "r1：客户可以发起订单" }).closest("div.grid")).not.toHaveClass("overflow-y-auto");
    screen.getAllByRole("textbox").forEach((field) => {
      expect(field).toHaveClass("px-4");
      expect(field.closest('[data-slot="field"]')).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("请至少选择一条当前有效的来源需求规则");
    expect(screen.getByRole("button", { name: "确认添加" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "r1：客户可以发起订单" }));
    await user.click(screen.getByRole("button", { name: "确认添加" }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit.mock.calls[0]?.[0]).toMatchObject({
      people: expect.arrayContaining([expect.objectContaining({ sourceRequirementIds: ["r1"] })]),
    });
  });

  it("filters elements through the shared type selector and restores all types", async () => {
    const user = userEvent.setup();
    render(<ContextEditor section="elements" onCommit={async () => undefined} />);
    const filter = screen.getByRole("combobox", { name: "按元素类型筛选" });
    expect(filter).toHaveTextContent(/^全部类型▼?$/);
    await user.click(filter);
    expect(await screen.findByRole("option", { name: "角色" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").every(option => !/\s\d+$/u.test(option.textContent ?? ""))).toBe(true);
    await user.click(await screen.findByRole("option", { name: "系统边界" }));
    expect(screen.getByRole("button", { name: "定位元素：订单系统" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "定位元素：客户" })).not.toBeInTheDocument();
    await user.click(filter);
    await user.click(await screen.findByRole("option", { name: "全部类型" }));
    expect(screen.getByRole("button", { name: "定位元素：客户" })).toBeInTheDocument();
  });

  it("hides creation in read-only mode and disables the menu while saving", () => {
    const { rerender } = render(<ContextEditor section="elements" readOnly onCommit={async () => undefined} />);
    expect(screen.queryByRole("button", { name: "添加" })).not.toBeInTheDocument();
    rerender(<ContextEditor section="elements" saving onCommit={async () => undefined} />);
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
  });

  it("uses the shared relation dialog for direction, endpoints, description, and sources", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(draft: Record<string, unknown>) => Promise<void>>(async () => undefined);
    render(<ContextEditor section="relationships" onCommit={onCommit} />);

    expect(screen.getByText("发起支付").closest('[data-slot="spotlight-card"]')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加关系" }));
    expect(screen.getByRole("dialog", { name: "添加关系" }).querySelector('[data-slot="field-set"]')).toBeInTheDocument();
    expect(screen.getByLabelText("起点")).toBeInTheDocument();
    expect(screen.getByLabelText("起点").closest('[data-slot="field"]')).toBeInTheDocument();
    expect(screen.getByLabelText("方向")).toBeInTheDocument();
    expect(screen.getByLabelText("终点")).toBeInTheDocument();
    expect(screen.getByLabelText("说明")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认添加" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "r1：客户可以发起订单" }));
    await user.click(screen.getByRole("button", { name: "确认添加" }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit.mock.calls[0]?.[0]).toMatchObject({
      relationships: expect.arrayContaining([
        expect.objectContaining({ direction: "directed", sourceRequirementIds: ["r1"] }),
      ]),
    });
  });

  it("keeps editor content stable throughout the close animation", async () => {
    const user = userEvent.setup();
    render(<ContextEditor section="elements" onCommit={async () => undefined} />);

    await user.click(screen.getByRole("button", { name: "编辑人员：客户" }));
    expect(screen.getByRole("dialog", { name: "编辑人员" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByText("未找到可编辑元素。")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "编辑人员" })).not.toBeInTheDocument();
    });
  });

  it("paginates context elements with the same shared list controls", async () => {
    const user = userEvent.setup();
    const pagedModel: Record<string, unknown> = {
      ...contextModel,
      people: Array.from({ length: 9 }, (_, index) => ({
        id: `person-${index + 1}`,
        name: `人员 ${index + 1}`,
        sourceRequirementIds: ["r1"],
      })),
    };
    render(
      <ContextEditor
        section="elements"
        initialModel={pagedModel}
        onCommit={async () => undefined}
      />,
    );

    expect(document.querySelector('[aria-label="1-8 / 11"]')).toBeInTheDocument();
    expect(screen.queryByText("人员 9")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(document.querySelector('[aria-label="9-11 / 11"]')).toBeInTheDocument();
    expect(screen.getByText("人员 9")).toBeInTheDocument();
  });
});
