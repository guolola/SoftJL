// Verifies modeling copy, UML preview content, and the chat result reveal sequence.
import { act, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resources } from "../../../../shared/i18n/resources";
import ChatIllustrations09 from "./chat-illustrations-09";
import BeamIllustrations31 from "./beam-illustrations-31";

const motionPreference = vi.hoisted(() => ({ reduced: true }));
vi.mock("motion/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("motion/react")>(),
  useReducedMotion: () => motionPreference.reduced,
}));

describe("project mode illustrations", () => {
  beforeEach(() => { motionPreference.reduced = true; });
  afterEach(() => { vi.useRealTimers(); });

  async function renderIllustrations(locale = "zh-CN") {
    const i18n = createInstance();
    await i18n.init({ resources, lng: locale, interpolation: { escapeValue: false } });
    return render(<I18nextProvider i18n={i18n}><ChatIllustrations09 /><BeamIllustrations31 /></I18nextProvider>);
  }

  it("shows multiple Chinese UML results without nested controls", async () => {
    const { container } = await renderIllustrations();
    for (const text of ["UML 建模助手", "生成订单系统的用例图和类图", "已生成 2 张 UML 图", "重新生成", "查看模型", "继续描述建模需求…", "订单系统", "用户", "创建订单", "支付订单", "查看订单", "用例图", "类图", "订单"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(container.querySelector('[data-diagram-preview="order-use-case"]')).toBeInTheDocument();
    expect(container.querySelector('[data-diagram-preview="order-class"]')).toBeInTheDocument();
    expect(container.querySelectorAll("[data-diagram-preview]")).toHaveLength(2);
    expect(container.querySelectorAll("button, input")).toHaveLength(0);
    expect(screen.queryByText("Image Generation")).not.toBeInTheDocument();
  });

  it("shows the real requirement-driven branches and independent document sources", async () => {
    const { container } = await renderIllustrations();
    for (const text of ["需求输入", "需求规则", "可行性分析", "需求模型", "设计模型", "测试用例", "说明书", "说明书按类型引用对应成果", "修改后提示关联成果更新"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    const edges = Array.from(container.querySelectorAll("[data-workflow-connection]"), node => node.getAttribute("data-workflow-connection"));
    expect(edges).toEqual(expect.arrayContaining(["input:rules", "rules:requirements", "requirements:design", "requirements:tests", "rules:feasibility", "feasibility:documents", "requirements:documents", "design:documents"]));
    expect(edges).not.toContain("design:tests");
    expect(edges).not.toContain("tests:documents");
    expect(edges).not.toContain("rules:design");
  });

  it("retains the modeling context when the app is in English", async () => {
    await renderIllustrations("en");
    expect(screen.getByText("UML assistant")).toBeInTheDocument();
    expect(screen.getByText("Create order system use case and class diagrams")).toBeInTheDocument();
    expect(screen.getByText("Create order")).toBeInTheDocument();
    expect(screen.getByText("Class diagram")).toBeInTheDocument();
    expect(screen.getByText("Req. models")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
  });

  it("reveals the UML result after the generation phase", async () => {
    motionPreference.reduced = false;
    vi.useFakeTimers();
    const { container } = await renderIllustrations();
    expect(container.querySelector('[data-diagram-preview="order-use-case"]')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getAllByText("正在生成 UML 图…").length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(1800); });
    act(() => { vi.advanceTimersByTime(420); });
    expect(container.querySelector('[data-diagram-preview="order-use-case"]')).toBeInTheDocument();
    expect(container.querySelector('[data-diagram-preview="order-class"]')).not.toBeInTheDocument();
    expect(screen.queryByText("已生成 2 张 UML 图")).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(420); });
    expect(container.querySelector('[data-diagram-preview="order-class"]')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText("已生成 2 张 UML 图")).toBeInTheDocument();
  });
});
