// Verifies the demo integration catalog preserves guide actions and accessible pointer/keyboard behavior.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../../shared/i18n";
import { mcpClients } from "../model/client-configurations";
import { ClientCatalog } from "./client-catalog";

const preferences = vi.hoisted(() => ({ reducedMotion: false, finePointer: true }));
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => preferences.reducedMotion,
}));

beforeEach(async () => {
  preferences.reducedMotion = false;
  preferences.finePointer = true;
  await i18n.changeLanguage("zh-CN");
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === "(hover: hover) and (pointer: fine)" && preferences.finePointer,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => false,
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("ClientCatalog", () => {
  it("replaces the catalog title with one unboxed address header and copies its server URL", () => {
    const onCopy = vi.fn().mockResolvedValue(true);
    render(<ClientCatalog onSelect={vi.fn()} serverUrl="https://platform.example/api/mcp" onCopy={onCopy} />);
    const header = screen.getByRole("heading", { name: "MCP 地址", level: 2 });
    const address = screen.getByRole("textbox", { name: "MCP 地址" });
    expect(screen.queryByRole("heading", { name: "MCP 客户端" })).not.toBeInTheDocument();
    expect(address).toHaveValue("https://platform.example/api/mcp");
    expect(address).toHaveAccessibleDescription("传输协议：Streamable HTTP（流式 HTTP）。请在客户端使用本页 MCP 地址连接。");
    expect(header.closest('[data-slot="card"]')).toBeNull();
    expect(address.closest('[data-slot="card"]')).toBeNull();
    const first = screen.getByRole("article", { name: "DeepSeek Harness" });
    expect(header.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "复制地址" }));
    expect(onCopy).toHaveBeenCalledWith("https://platform.example/api/mcp");
  });

  it("keeps all clients visible before intersection or scrolling with normal motion preferences", () => {
    render(<ClientCatalog onSelect={vi.fn()} serverUrl="" onCopy={vi.fn()} />);
    expect(screen.getByRole("button", { name: "复制地址" })).toBeDisabled();
    for (const client of mcpClients) {
      expect(screen.getByRole("article", { name: client.name })).toBeVisible();
      expect(screen.getByRole("button", { name: `查看 ${client.name} 接入指南` })).toBeVisible();
    }
  });
  it("keeps every client and opens its guide with the actual trigger for focus restoration", () => {
    const onSelect = vi.fn();
    render(<ClientCatalog onSelect={onSelect} serverUrl="https://platform.example/api/mcp" onCopy={vi.fn()} />);

    expect(screen.getAllByRole("article")).toHaveLength(mcpClients.length);
    for (const client of mcpClients) {
      const card = screen.getByRole("article", { name: client.name });
      const guide = within(card).getByRole("button", { name: `查看 ${client.name} 接入指南` });
      expect(guide).toHaveAttribute("aria-haspopup", "dialog");
      expect(within(card).getByText("只读访问项目资料")).toBeVisible();
      expect(within(card).getByText(client.mode === "manual" ? "接入能力以客户端版本为准" : "远程 MCP 服务")).toBeVisible();
      fireEvent.click(guide);
      expect(onSelect).toHaveBeenLastCalledWith(client.id, guide);
    }
  });

  it("supports keyboard navigation and Enter activation without requiring pointer effects", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ClientCatalog onSelect={onSelect} serverUrl="https://platform.example/api/mcp" onCopy={vi.fn()} />);
    await user.tab();
    expect(screen.getByRole("textbox", { name: "MCP 地址" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "复制地址" })).toHaveFocus();
    await user.tab();
    const first = screen.getByRole("button", { name: "查看 DeepSeek Harness 接入指南" });
    expect(first).toHaveFocus();
    await user.keyboard("[Enter]");
    expect(onSelect).toHaveBeenCalledWith("deepseek", first);
    await user.tab();
    expect(screen.getByRole("button", { name: "查看 Qoder 接入指南" })).toHaveFocus();
  });

  it("uses the supplied module's moving blobs and keeps the window listener inside its catalog", () => {
    const outside = document.createElement("div");
    outside.className = "card";
    outside.innerHTML = '<div class="blob"></div><div class="fake-blob"></div>';
    document.body.append(outside);
    const outsideAnimate = vi.fn();
    Object.assign(outside.querySelector(".blob")!, { animate: outsideAnimate });
    const removeListener = vi.spyOn(window, "removeEventListener");
    const view = render(<ClientCatalog onSelect={vi.fn()} serverUrl="https://platform.example/api/mcp" onCopy={vi.fn()} />);
    const blobs = [...view.container.querySelectorAll<HTMLElement>(".blob")];
    const animate = vi.fn();
    for (const blob of blobs) Object.assign(blob, { animate });
    const first = screen.getByRole("article", { name: "DeepSeek Harness" });
    fireEvent.mouseMove(first, { clientX: 120, clientY: 160 });
    expect(animate).toHaveBeenCalledTimes(12);
    expect(animate).toHaveBeenCalledWith([{ transform: "translate(96px, 136px)" }], { duration: 300, fill: "forwards" });
    expect(blobs[0]).toHaveStyle({ opacity: "0.8" });
    expect(blobs[0]).toHaveClass("pointer-events-none");
    expect(outsideAnimate).not.toHaveBeenCalled();
    view.unmount();
    expect(removeListener).toHaveBeenCalledWith("mousemove", expect.any(Function));
    outside.remove();
  });

  it.each(["reduced motion", "touch"])("keeps guides usable without animating blobs for %s", (preference) => {
    preferences.reducedMotion = preference === "reduced motion";
    preferences.finePointer = preference !== "touch";
    const onSelect = vi.fn();
    const { container } = render(<ClientCatalog onSelect={onSelect} serverUrl="https://platform.example/api/mcp" onCopy={vi.fn()} />);
    const animate = vi.fn();
    for (const blob of container.querySelectorAll(".blob")) Object.assign(blob, { animate });
    const card = screen.getByRole("article", { name: "Qoder" });
    fireEvent.mouseMove(card, { clientX: 120, clientY: 160 });
    expect(animate).not.toHaveBeenCalled();
    const guide = within(card).getByRole("button", { name: "查看 Qoder 接入指南" });
    fireEvent.click(guide);
    expect(onSelect).toHaveBeenCalledWith("qoder", guide);
  });
});
