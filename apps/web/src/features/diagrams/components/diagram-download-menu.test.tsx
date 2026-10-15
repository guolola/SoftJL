// Verifies artifact selection, conversion feedback, and cancellation for diagram downloads.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n";
import { i18n } from "../../../shared/i18n/i18n";
import { WorkspaceRepositoryProvider, type WorkspaceRepository } from "../../../services/workspace-repository";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { DiagramDownloadMenu } from "./diagram-download-menu";

const mocks = vi.hoisted(() => ({ text: vi.fn(), blob: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("../../../shared/lib/download", () => ({ downloadTextFile: mocks.text, downloadBlobFile: mocks.blob }));
vi.mock("../../../shared/ui/floating-alert", () => ({ floatingAlert: { success: mocks.success, error: mocks.error } }));
const props = { diagramId: "sequence:first", diagramKind: "sequence" as const, fileStem: "design-sequence", svg: '<svg viewBox="0 0 100 100"><text>已保存</text></svg>', source: "@startuml\nAlice -> Bob\n@enduml" };
function view(repository: WorkspaceRepository, input = props) {
  return <AppI18nProvider><WorkspaceRepositoryProvider repository={repository}><DiagramDownloadMenu {...input} /></WorkspaceRepositoryProvider></AppI18nProvider>;
}
async function choose(name: string) {
  await userEvent.click(screen.getByRole("button", { name: "下载" }));
  await userEvent.click(await screen.findByRole("menuitem", { name }));
}
beforeEach(async () => { vi.clearAllMocks(); await i18n.changeLanguage("zh-CN"); });

it("offers formats in order and downloads the saved SVG and source", async () => {
  const repository = createMockWorkspaceRepository();
  repository.exportDiagram = vi.fn();
  render(view(repository));
  await userEvent.click(screen.getByRole("button", { name: "下载" }));
  expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual(["SVG", "PNG", "PDF", "PlantUML"]);
  await userEvent.click(screen.getByRole("menuitem", { name: "SVG" }));
  expect(mocks.text).toHaveBeenCalledWith("design-sequence.svg", props.svg, "image/svg+xml");
  await choose("PlantUML");
  expect(mocks.text).toHaveBeenCalledWith("design-sequence.puml", props.source, "text/plain");
  expect(repository.exportDiagram).not.toHaveBeenCalled();
});

it.each([
  { format: "png", fileStem: "context" },
  { format: "pdf", fileStem: "feasibility-business-flow" },
  { format: "pdf", fileStem: "design-sequence" },
  { format: "png", fileStem: "requirements-sequence" },
] as const)("downloads $format with its saved source and $fileStem filename", async ({ format, fileStem }) => {
  const repository = createMockWorkspaceRepository();
  const blob = new Blob(["output"]);
  repository.exportDiagram = vi.fn().mockResolvedValue(blob);
  render(view(repository, { ...props, fileStem }));
  await choose(format.toUpperCase());
  expect(repository.exportDiagram).toHaveBeenCalledWith({ diagramKind: "sequence", plantUmlSource: props.source, format }, expect.any(AbortSignal));
  expect(mocks.blob).toHaveBeenCalledWith(`${fileStem}.${format}`, blob);
});

it("explains missing artifacts and unsupported conversion without blocking SVG", async () => {
  render(view(createMockWorkspaceRepository(), { ...props, source: "" }));
  expect(screen.queryByText("PlantUML 源码尚未生成")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "下载" }));
  expect(await screen.findByRole("menuitem", { name: "SVG" })).not.toHaveAttribute("aria-disabled", "true");
  for (const name of ["PNG", "PDF", "PlantUML"]) {
    const item = screen.getByRole("menuitem", { name: new RegExp(name) });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("aria-description", "PlantUML 源码尚未生成");
  }
});

it("keeps source download available when SVG is missing and conversion is unsupported", async () => {
  render(view(createMockWorkspaceRepository(), { ...props, svg: "" }));
  expect(screen.queryByText(/当前环境暂不支持 PNG、PDF 下载/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "下载" }));
  expect(await screen.findByRole("menuitem", { name: /SVG/ })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("menuitem", { name: "PlantUML" })).not.toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("menuitem", { name: "PNG" })).toHaveAttribute("aria-description", "当前环境暂不支持 PNG、PDF 下载");
});

it("blocks duplicate conversions and permits retry after failure", async () => {
  const repository = createMockWorkspaceRepository();
  let reject!: (error: Error) => void;
  repository.exportDiagram = vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValue(new Blob());
  render(view(repository));
  await choose("PDF");
  expect(screen.getByRole("status")).toHaveTextContent("正在准备下载");
  expect(screen.getByRole("button", { name: "下载" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "下载" }));
  expect(repository.exportDiagram).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("字体不可用")));
  expect(mocks.error).toHaveBeenCalledWith("图表下载失败：字体不可用");
  await choose("PDF");
  expect(mocks.blob).toHaveBeenCalledTimes(1);
});

it.each(["artifact", "diagram", "unmount", "route"])("cancels conversion after %s changes and suppresses a late response", async (change) => {
  const repository = createMockWorkspaceRepository();
  let resolve!: (blob: Blob) => void;
  let signal!: AbortSignal;
  repository.exportDiagram = vi.fn((_input, passedSignal) => { signal = passedSignal!; return new Promise<Blob>((done) => { resolve = done; }); });
  const rendered = render(view(repository));
  await choose("PNG");
  if (change === "artifact") rendered.rerender(view(repository, { ...props, fileStem: "feasibility-business-flow", source: "new source" }));
  else if (change === "diagram") rendered.rerender(view(repository, { ...props, diagramId: "sequence:second" }));
  else if (change === "unmount") rendered.unmount();
  else act(() => window.dispatchEvent(new Event("uml-route-change")));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(new Blob()));
  expect(mocks.blob).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.error).not.toHaveBeenCalled();
});

it("supports keyboard selection and English labels", async () => {
  const repository = createMockWorkspaceRepository();
  repository.exportDiagram = vi.fn().mockResolvedValue(new Blob());
  render(view(repository));
  await act(async () => { await i18n.changeLanguage("en"); });
  screen.getByRole("button", { name: "Download" }).focus();
  await userEvent.keyboard("{ArrowDown}");
  await screen.findByRole("menuitem", { name: "SVG" });
  await userEvent.keyboard("{Enter}");
  await waitFor(() => expect(mocks.text).toHaveBeenCalled());
  await i18n.changeLanguage("zh-CN");
});
