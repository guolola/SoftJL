// Verifies shared page controls retain single-model visibility, capability guards and synchronized preferences.
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { WorkspaceRepositoryProvider, createMockWorkspaceRepository } from "../../../services/workspace-repository";
import { patchUserSettings, loadUserSettings } from "../../../shared/lib/user-settings";
import { i18n } from "../../../shared/i18n";
import { GenerationModelControls } from "./generation-model-controls";

const context = (model: string, reasoning = true) => ({ model, contextBudget: 100000, capacity: {
  context: 100000, output: 8000, source: "admin", matchedId: model, updatedAt: null,
  capabilities: { reasoning, vision: false, toolCall: true },
} });
beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("zh-CN");
  patchUserSettings({ providerConfigId: "provider-1", defaultModel: "model-a", providerModelOptions: ["model-a"] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(context("model-a")), { status: 200 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Harness({ disabled = false, ordinary = false, copies = 1 }) {
  return <I18nextProvider i18n={i18n}><WorkspaceRepositoryProvider repository={createMockWorkspaceRepository()} projectId="project-1">
    {Array.from({ length: copies }, (_, index) => <GenerationModelControls key={index} disabled={disabled} ordinary={ordinary} />)}
  </WorkspaceRepositoryProvider></I18nextProvider>;
}

it("shows a sole model and shares reasoning changes between mounted controls and subsequent pages", async () => {
  const user = userEvent.setup();
  const first = render(<Harness copies={2} />);
  expect(screen.getAllByRole("combobox", { name: "选择模型" })).toHaveLength(2);
  expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("model-a");
  const switches = await screen.findAllByRole("switch", { name: "推理" });
  await user.click(switches[0]!);
  expect(switches[1]).toBeChecked();
  first.unmount();
  render(<Harness />);
  expect(await screen.findByRole("switch", { name: "推理" })).toBeChecked();
});

it("updates the shared model and drops old capabilities until the new model resolves", async () => {
  const user = userEvent.setup();
  patchUserSettings({ providerModelOptions: ["model-a", "model-b"] });
  render(<Harness />);
  await screen.findByRole("switch", { name: "推理" });
  let resolveContext!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { resolveContext = resolve; }));
  await user.click(screen.getByRole("combobox", { name: "选择模型" }));
  await user.click(screen.getByRole("option", { name: "model-b" }));
  expect(loadUserSettings().defaultModel).toBe("model-b");
  expect(screen.queryByRole("switch", { name: "推理" })).not.toBeInTheDocument();
  await act(async () => { resolveContext(new Response(JSON.stringify(context("model-b", false)), { status: 200 })); });
  expect(screen.queryByRole("switch", { name: "推理" })).not.toBeInTheDocument();
});

it("disables model and reasoning changes during runs or read-only access", async () => {
  render(<Harness disabled />);
  expect(screen.getByRole("combobox", { name: "选择模型" })).toBeDisabled();
  expect(await screen.findByRole("switch", { name: "推理" })).toHaveAttribute("aria-disabled", "true");
});

it("resolves ordinary document capabilities from the ordinary project endpoint", async () => {
  render(<Harness ordinary />);
  await screen.findByRole("switch", { name: "推理" });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/projects/project-1/standard/model-context?"), expect.anything());
});
