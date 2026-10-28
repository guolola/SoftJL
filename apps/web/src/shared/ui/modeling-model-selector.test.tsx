// Exercises the selector shared by both composers, including the sole-model case and permission guards.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantRuntimeProvider, useExternalStoreRuntime } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModelingModelSelector, type ModelingModelSelectorProps } from "./modeling-model-selector";

afterEach(cleanup);
const messages = [];
function Harness(props: ModelingModelSelectorProps) {
  const runtime = useExternalStoreRuntime({ messages, onNew: async () => {} });
  return <AssistantRuntimeProvider runtime={runtime}><ModelingModelSelector {...props} /></AssistantRuntimeProvider>;
}

it("keeps the selected provider and model visible when it is the only configured choice", async () => {
  const user = userEvent.setup();
  render(<Harness models={[{ id: "provider/model", name: "Only model", icon: <svg data-testid="selected-provider" /> }]} value="provider/model" />);
  const trigger = screen.getByRole("combobox", { name: "Select model" });
  expect(trigger).toHaveTextContent("Only model");
  expect(trigger.querySelector('[data-testid="selected-provider"]')).toBeInTheDocument();
  await user.click(trigger);
  expect(screen.getByRole("option", { name: "Only model" })).toBeInTheDocument();
});

it("uses the original searchable option menu and keeps reasoning outside the popup", async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  const onReasoningChange = vi.fn();
  const translate = (value: string) => value === "Reasoning" ? "推理" : value;
  render(<Harness models={[{ id: "a", name: "Model A" }, { id: "b", name: "Model B" }]} value="a" onValueChange={onValueChange}
    reasoningSupported reasoning={false} onReasoningChange={onReasoningChange} translate={translate} />);
  const reasoning = screen.getByRole("switch", { name: "推理" });
  expect(reasoning.closest('[data-slot="model-selector-content"]')).toBeNull();
  await user.click(reasoning);
  expect(onReasoningChange).toHaveBeenCalledWith(true);
  await user.click(screen.getByRole("combobox"));
  await user.click(screen.getByRole("option", { name: "Model B" }));
  expect(onValueChange).toHaveBeenCalledWith("b");
});

it("locks model and reasoning changes when read-only while retaining their current values", async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  const onReasoningChange = vi.fn();
  render(<Harness models={[{ id: "a", name: "Current model" }]} value="a" onValueChange={onValueChange}
    reasoningSupported reasoning onReasoningChange={onReasoningChange} disabled />);
  expect(screen.getByRole("combobox")).toHaveTextContent("Current model");
  expect(screen.getByRole("combobox")).toBeDisabled();
  const reasoning = screen.getByRole("switch", { name: "Reasoning" });
  expect(reasoning).toBeChecked();
  await user.click(reasoning);
  expect(onReasoningChange).not.toHaveBeenCalled();
  expect(onValueChange).not.toHaveBeenCalled();
});

it("shows only confirmed vision and reasoning badges for each choice inside the list", async () => {
  const user = userEvent.setup();
  render(<Harness models={[
    { id: "both", name: "Both", capabilities: { vision: true, reasoning: true } },
    { id: "vision", name: "Vision only", capabilities: { vision: true, reasoning: false } },
    { id: "unknown", name: "Unknown", capabilities: { vision: null, reasoning: null } },
  ]} value="unknown" />);
  expect(screen.queryByText("Vision", { exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole("combobox"));
  const both = screen.getByRole("option", { name: /Both/ });
  expect(within(both).getByText("Vision")).toBeVisible(); expect(within(both).getByText("Reasoning")).toBeVisible();
  expect(within(screen.getByRole("option", { name: /Vision only/ })).queryByText("Reasoning")).not.toBeInTheDocument();
  expect(within(screen.getByRole("option", { name: "Unknown" })).queryByText("Vision")).not.toBeInTheDocument();
});
