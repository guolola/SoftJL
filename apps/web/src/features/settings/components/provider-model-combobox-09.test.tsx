// Verifies combobox-09 uses discovered models, local logos and keyboard selection without accepting arbitrary IDs.
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ProviderDiscoveredModel } from "@uml-platform/contracts";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { ProviderModelCombobox09 } from "./provider-model-combobox-09";

const models: ProviderDiscoveredModel[] = [{ id: "deepseek-ai/DeepSeek-V3", structuredOutputMode: "strict_json" }, { id: "gpt-5.6", structuredOutputMode: "json_object" }, { id: "gemini-3.1-pro", structuredOutputMode: "compatible" }];

function ControlledPicker({ onChange }: { onChange: (model: string) => void }) {
  const [value, setValue] = useState(models[0].id);
  return <ProviderModelCombobox09 models={models} value={value} disabled={false} onValueChange={model => { setValue(model); onChange(model); }} />;
}

describe("Provider model combobox-09", () => {
  it("shows the selected brand logo and the matching logos in the original dropdown layout", async () => {
    const user = userEvent.setup();
    render(<AppI18nProvider><ControlledPicker onChange={() => {}} /></AppI18nProvider>);
    expect(screen.getByRole("combobox", { name: "供应商默认模型" })).toHaveValue(models[0].id);
    expect(screen.getByTestId("provider-icon-deepseek")).toBeInTheDocument();
    expect(screen.getByText("严格 JSON")).toHaveAttribute("data-mode", "strict_json");
    await user.click(screen.getByRole("button", { name: "展开模型列表" }));
    for (const [model, provider] of [[models[0].id, "deepseek"], [models[1].id, "openai"], [models[2].id, "google"]]) {
      expect(within(await screen.findByRole("option", { name: model })).getByTestId(`provider-icon-${provider}`)).toBeInTheDocument();
    }
    expect(document.querySelector('[data-component="combobox-09"]')).toBeInTheDocument();
    expect(within(screen.getByRole("option", { name: models[0].id })).getByText("严格 JSON")).toHaveClass("bg-emerald-100");
    expect(within(screen.getByRole("option", { name: models[1].id })).getByText("JSON 模式")).toHaveClass("bg-sky-100");
    expect(within(screen.getByRole("option", { name: models[2].id })).getByText("兼容", { exact: true })).toHaveClass("bg-muted");
  });

  it("filters models, supports keyboard selection and leaves unmatched text out of the selected value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AppI18nProvider><ControlledPicker onChange={onChange} /></AppI18nProvider>);
    const input = screen.getByRole("combobox", { name: "供应商默认模型" });
    await user.click(screen.getByRole("button", { name: "展开模型列表" }));
    await user.clear(input);
    await user.type(input, "gpt");
    expect(await screen.findByRole("option", { name: "gpt-5.6" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: models[0].id })).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("gpt-5.6");
    expect(input).toHaveValue("gpt-5.6");
    expect(within(input.closest('[data-slot="input-group"]') as HTMLElement).getByText("JSON 模式")).toHaveAttribute("data-mode", "json_object");
    await user.click(screen.getByRole("button", { name: "展开模型列表" }));
    await user.clear(input);
    await user.type(input, "missing-model");
    expect(await screen.findByText("没有匹配的模型")).toBeVisible();
    await user.keyboard("{Enter}{Escape}");
    expect(onChange).not.toHaveBeenCalledWith("missing-model");
  });

  it("disables the input and trigger until models are available and during provider operations", () => {
    const { rerender } = render(<AppI18nProvider><ProviderModelCombobox09 models={[]} value="" disabled={false} onValueChange={() => {}} /></AppI18nProvider>);
    expect(screen.getByRole("combobox", { name: "供应商默认模型" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "展开模型列表" })).toBeDisabled();
    rerender(<AppI18nProvider><ProviderModelCombobox09 models={models} value={models[0].id} disabled onValueChange={() => {}} /></AppI18nProvider>);
    expect(screen.getByRole("combobox", { name: "供应商默认模型" })).toBeDisabled();
  });
});
