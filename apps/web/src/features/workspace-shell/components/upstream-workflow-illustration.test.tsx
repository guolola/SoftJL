// Verifies the standalone workflow's nodes, dependency states, accessibility, and reduced-motion behavior.
import { render, screen, within } from "@testing-library/react";
import { FileText } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { createRule } from "../../../../tests/helpers/workspace-test-utils";
import type { UpstreamInput, UpstreamInputState } from "../lib/upstream-dependencies";
import { UpstreamWorkflowIllustration } from "./upstream-workflow-illustration";

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motion.reduce,
}));

function renderIllustration(props: Partial<Parameters<typeof UpstreamWorkflowIllustration>[0]> = {}) {
  return render(
    <AppI18nProvider>
      <UpstreamWorkflowIllustration
        id="test-workflow"
        stage="feasibility"
        target="implementation"
        targetLabel="实现方案"
        targetIcon={FileText}
        targetColorIndex={2}
        resolveState={(input: UpstreamInput): UpstreamInputState =>
          input.kind === "feasibility" ? (input.artifact === "context" ? "ready" : "stale") : input.kind === "rules" ? "ready" : "missing"}
        {...props}
      />
    </AppI18nProvider>,
  );
}

describe("UpstreamWorkflowIllustration", () => {
  beforeEach(() => {
    motion.reduce = false;
  });

  it("renders visible upstream inputs with states, the platform logo, and the target artifact", () => {
    const { container } = renderIllustration();
    const figure = screen.getByRole("figure", { name: "实现方案的上游输入" });
    const items = within(within(figure).getByRole("list", { name: "直接上游输入" })).getAllByRole("listitem");
    expect(items.map((item) => [item.getAttribute("data-input"), item.getAttribute("data-state")])).toEqual([
      ["feasibility:context", "ready"],
      ["feasibility:business-flow", "stale"],
      ["rules", "ready"],
      ["supplementary", "missing"],
    ]);
    expect(items[0]).toHaveTextContent("就绪");
    expect(items[1]).toHaveTextContent("待更新");
    expect(items[3]).toHaveTextContent("缺失");
    expect(items[3]).toHaveTextContent("补充资料可选缺失");
    expect(within(figure).queryByText("需求基线")).not.toBeInTheDocument();
    expect(container.querySelector("[data-slot='upstream-target']")).toHaveTextContent("目标产物实现方案");
    // One curve per input converges on the logo; missing inputs stay dashed.
    const curves = container.querySelectorAll("[data-slot='upstream-connectors'] path");
    expect(curves).toHaveLength(4);
    expect(curves[3]).toHaveAttribute("stroke-dasharray", "3 4");
    expect(curves[0]).not.toHaveAttribute("stroke-dasharray");
    expect(screen.getByText("实现方案的直接上游输入：系统环境图（就绪）、业务流程图（待更新）、需求规则（就绪）、补充资料（可选）（缺失）"))
      .toHaveAttribute("aria-live", "polite");
  });

  it("gives each rule its own node, description, and connector without a baseline node", () => {
    const { container } = renderIllustration({
      target: "business-flow",
      targetLabel: "业务流程图",
      rules: [
        createRule({ id: "r2", text: "提交申请" }),
        createRule({ id: "r5", type: "functional" as const, text: "审核申请" }),
        createRule({ id: "r8", type: "data" as const, text: "查看结果" }),
      ],
      resolveState: () => "ready",
    });
    const items = within(screen.getByRole("list", { name: "直接上游输入" })).getAllByRole("listitem");
    expect(items.map(item => item.getAttribute("data-input"))).toEqual(["rules:r2", "rules:r5", "rules:r8"]);
    expect(items[0]).toHaveTextContent("业务规则 1");
    expect(items[1]).toHaveTextContent("功能需求 1");
    expect(items[2]).toHaveTextContent("数据需求 1");
    expect(items.map(item => item.title)).toEqual(["业务规则 1: 提交申请", "功能需求 1: 审核申请", "数据需求 1: 查看结果"]);
    expect(container.querySelectorAll("[data-slot='upstream-connectors'] path")).toHaveLength(3);
    expect(container.querySelector("[data-input^='baseline']")).toBeNull();
  });

  it("keeps only the workflow visible while preserving its accessible name and target hint", () => {
    renderIllustration({
      stage: "design",
      target: "deployment",
      targetLabel: "部署设计",
      targetHint: "来源：需求阶段部署需求模型 + 设计阶段组件（构件）关系",
      resolveState: () => "ready",
    });
    const figure = screen.getByRole("figure", { name: "部署设计的上游输入" });
    expect(figure.querySelector("figcaption")).toBeNull();
    expect(screen.queryByText("部署设计的上游输入")).not.toBeInTheDocument();
    expect(screen.queryByText("悬停、聚焦或点按卡片上的流程按钮查看依赖")).not.toBeInTheDocument();
    expect(screen.queryByText(/^间接依赖：/)).not.toBeInTheDocument();
  });

  it("shows real sources without requiring absent rule types", () => {
    const { container } = renderIllustration({ stage: "requirement", target: "usecase", targetLabel: "用例模型", rules: [createRule({ id: "r2", type: "functional" as const })], resolveState: () => "ready" });
    const items = within(screen.getByRole("list", { name: "直接上游输入" })).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("功能需求 1已关联");
    expect(screen.queryByText("缺少业务规则")).not.toBeInTheDocument();
    expect(screen.getByText("每个模型元素至少关联一条真实的上游来源")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-slot='upstream-connectors'] path")).toHaveLength(1);
  });

  it("preserves stale input status while a model needs regeneration", () => {
    renderIllustration({ stage: "requirement", target: "function", targetLabel: "功能结构图", rules: [createRule({ type: "functional" as const })], resolveState: () => "stale" });
    expect(screen.getByText("功能需求 1").closest("li")).toHaveAttribute("data-state", "stale");
    expect(screen.queryByText("暂无业务规则")).not.toBeInTheDocument();
  });

  it("shows missing mapped inputs without mapping review counts", () => {
    renderIllustration({ stage: "requirement", target: "function", targetLabel: "功能结构图", rules: [], resolveState: () => "missing" });
    expect(within(screen.getByRole("list", { name: "直接上游输入" })).getAllByRole("listitem")[0]).toHaveAttribute("data-state", "missing");
    expect(screen.queryByText("暂无该模型对应类型的需求")).not.toBeInTheDocument();
    expect(screen.queryByText(/元素关联待审核/)).not.toBeInTheDocument();
  });

  it("groups rule nodes by category and sorts numeric IDs within each category", () => {
    const rules = [
      createRule({ id: "r10", type: "functional" as const }),
      createRule({ id: "r11", type: "business-rule" as const }),
      createRule({ id: "r2", type: "functional" as const }),
      createRule({ id: "r9", type: "exception" as const }),
      createRule({ id: "r3", type: "business-rule" as const }),
      createRule({ id: "r1", type: "functional" as const }),
    ];
    const originalOrder = rules.map(rule => rule.id);
    renderIllustration({ target: "business-flow", rules, resolveState: () => "ready" });
    const items = within(screen.getByRole("list", { name: "直接上游输入" })).getAllByRole("listitem");
    expect(items.map(item => item.getAttribute("data-input"))).toEqual([
      "rules:r3", "rules:r11", "rules:r1", "rules:r2", "rules:r10", "rules:r9",
    ]);
    expect(items.map(item => item.textContent)).toEqual([
      "业务规则 1就绪", "业务规则 2就绪", "功能需求 1就绪",
      "功能需求 2就绪", "功能需求 3就绪", "异常处理 1就绪",
    ]);
    expect(rules.map(rule => rule.id)).toEqual(originalOrder);
  });

  it("animates flow only when motion is allowed", () => {
    const { container, unmount } = renderIllustration();
    // Missing inputs carry no flow; the two ready and one stale input plus the output each get a dot.
    expect(container.querySelectorAll("animateMotion")).toHaveLength(4);
    unmount();
    motion.reduce = true;
    const reduced = renderIllustration();
    // Model-category SVGs can contain static circles; only flow animations must disappear.
    expect(reduced.container.querySelectorAll("animateMotion")).toHaveLength(0);
  });

  it("labels planned inputs without suggesting generation has started", () => {
    const { container, unmount } = renderIllustration({ resolveState: () => "planned" });
    expect(screen.getAllByText("本次将生成")).toHaveLength(4);
    const connectors = container.querySelector("[data-slot='upstream-connectors']")!;
    expect(connectors.querySelectorAll("path[stroke-dasharray]")).toHaveLength(4);
    expect(connectors.querySelector("animateMotion")).toBeNull();
    unmount();
    renderIllustration({ resolveState: () => "running" });
    expect(screen.getAllByText("生成中")).toHaveLength(4);
  });
});

it("shows per-type ordinal numbers instead of long rule IDs while preserving references", () => {
  const rules = [createRule({ id: "r-29674a27-bab4-40da-a001", type: "business-rule" }), createRule({ id: "r-29674a27-bab4-40da-a002", type: "business-rule" }), createRule({ id: "r-29674a27-bab4-40da-a003", type: "functional" })];
  renderIllustration({ target: "business-flow", rules, resolveState: () => "ready" });
  expect(screen.getByText("业务规则 1").closest("li")).toHaveAttribute("data-input", `rules:${rules[0].id}`);
  expect(screen.getByText("业务规则 2").closest("li")).toHaveAttribute("data-input", `rules:${rules[1].id}`);
  expect(screen.getByText("功能需求 1").closest("li")).toHaveAttribute("data-input", `rules:${rules[2].id}`);
  expect(screen.queryByText(/29674a27/i)).not.toBeInTheDocument();
});
