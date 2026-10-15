// Verifies model picker vendor grouping for catalog and provider-managed models.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  USER_SETTINGS_STORAGE_KEY,
  type UserSettings,
} from "../lib/user-settings";
import { ModelPicker } from "./model-picker";

function seedSettings(patch: Partial<UserSettings>) {
  localStorage.setItem(
    USER_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      providerConfigId: "",
      providerLabel: "",
      providerModelCapabilities: {},
      providerModelOptions: [],
      defaultModel: "gpt-5.4",
      imageModel: "gpt-image-2",
      fontSize: "md",
      autoGenerate: false,
      showStaleBanner: true,
      ...patch,
    }),
  );
}

describe("ModelPicker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an empty managed-provider state instead of the static catalog", async () => {
    const user = userEvent.setup();

    render(<ModelPicker value="gpt-5.4" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "未选择模型" }));

    expect((await screen.findByText("请先选择模型供应商"))).toBeInTheDocument();
    expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();
    expect(screen.queryByText("Claude")).not.toBeInTheDocument();
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
    expect(screen.queryByText("DeepSeek")).not.toBeInTheDocument();
    expect(screen.queryByTitle("claude-opus-4-7")).not.toBeInTheDocument();
  });

  it("groups provider-managed catalog and prefixed models by vendor", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    seedSettings({
      providerConfigId: "provider-system-siliconflow",
      providerLabel: "SiliconFlow",
      providerModelOptions: [
        "deepseek-ai/DeepSeek-V4-Pro",
        "deepseek-ai/DeepSeek-V4-Flash",
        "Pro/moonshotai/Kimi-K2.6",
        "Pro/zai-org/GLM-5.1",
        "Pro/MiniMaxAI/MiniMax-M2.5",
        "Qwen/Qwen3.6-35B-A3B",
        "gpt-5.4",
      ],
      providerModelCapabilities: {
        "deepseek-ai/DeepSeek-V4-Pro": {
          id: "deepseek-ai/DeepSeek-V4-Pro",
          structuredOutputMode: "strict_json",
          supportsJsonSchema: true,
          supportsJsonObject: true,
        },
        "deepseek-ai/DeepSeek-V4-Flash": {
          id: "deepseek-ai/DeepSeek-V4-Flash",
          structuredOutputMode: "json_object",
          supportsJsonSchema: false,
          supportsJsonObject: true,
        },
      },
      defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
    });

    render(
      <ModelPicker
        value="deepseek-ai/DeepSeek-V4-Pro"
        onValueChange={onValueChange}
      />,
    );

    const providerTrigger = screen.getByRole("button", { name: "DeepSeek-V4-Pro" });
    expect(providerTrigger).toHaveClass("h-9", "w-28", "sm:w-40", "overflow-hidden");
    expect(providerTrigger).toHaveAttribute("title", "deepseek-ai/DeepSeek-V4-Pro");
    expect(providerTrigger.querySelector(".truncate")).toHaveTextContent("DeepSeek-V4-Pro");
    expect(providerTrigger).not.toHaveTextContent("托管");
    await user.click(providerTrigger);

    expect((await screen.findByText("DeepSeek"))).toBeInTheDocument();
    expect(screen.getAllByTestId("provider-icon-deepseek")).not.toHaveLength(0);
    expect((await screen.findByText("Kimi"))).toBeInTheDocument();
    expect((await screen.findByText("智谱"))).toBeInTheDocument();
    expect((await screen.findByText("Minimax"))).toBeInTheDocument();
    expect((await screen.findByText("Qwen"))).toBeInTheDocument();
    expect((await screen.findByText("OpenAI"))).toBeInTheDocument();
    expect(screen.queryByTitle("Qwen/Qwen3.6-35B-A3B")).not.toBeInTheDocument();

    await user.hover((await screen.findByText("DeepSeek")));
    const deepseekSubContent = (await screen.findByText("严格 JSON"))
      .closest("[data-slot='dropdown-menu-sub-content']")!;
    const deepseekPro = within(deepseekSubContent as HTMLElement).getByTitle("deepseek-ai/DeepSeek-V4-Pro");
    const deepseekFlash = within(deepseekSubContent as HTMLElement).getByTitle("deepseek-ai/DeepSeek-V4-Flash");
    expect(deepseekSubContent).toHaveClass(
      "max-h-72",
      "overflow-y-auto",
    );
    expect(within(deepseekPro).getByText("DeepSeek-V4-Pro")).toBeInTheDocument();
    expect(within(deepseekPro).getByText("严格 JSON")).toBeInTheDocument();
    expect(within(deepseekPro).queryByText("deepseek-ai/DeepSeek-V4-Pro")).not.toBeInTheDocument();
    expect(within(deepseekFlash).getByText("DeepSeek-V4-Flash")).toBeInTheDocument();
    expect(within(deepseekFlash).getByText("JSON 模式")).toBeInTheDocument();
    expect(within(deepseekFlash).queryByText("严格 JSON")).not.toBeInTheDocument();
    expect(within(deepseekFlash).queryByText("deepseek-ai/DeepSeek-V4-Flash")).not.toBeInTheDocument();

    await user.hover((await screen.findByText("Kimi")));
    expect(await screen.findByTitle("Pro/moonshotai/Kimi-K2.6")).toBeInTheDocument();

    await user.hover((await screen.findByText("智谱")));
    expect(await screen.findByTitle("Pro/zai-org/GLM-5.1")).toBeInTheDocument();

    await user.hover((await screen.findByText("Minimax")));
    expect(await screen.findByTitle("Pro/MiniMaxAI/MiniMax-M2.5")).toBeInTheDocument();

    await user.hover((await screen.findByText("Qwen")));
    expect(await screen.findByTitle("Qwen/Qwen3.6-35B-A3B")).toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("selects provider-managed models by their full model id", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    seedSettings({
      providerConfigId: "provider-system-siliconflow",
      providerLabel: "SiliconFlow",
      providerModelOptions: [
        "deepseek-ai/DeepSeek-V4-Pro",
        "deepseek-ai/DeepSeek-V4-Flash",
      ],
      providerModelCapabilities: {
        "deepseek-ai/DeepSeek-V4-Pro": {
          id: "deepseek-ai/DeepSeek-V4-Pro",
          structuredOutputMode: "strict_json",
          supportsJsonSchema: true,
          supportsJsonObject: true,
        },
        "deepseek-ai/DeepSeek-V4-Flash": {
          id: "deepseek-ai/DeepSeek-V4-Flash",
          structuredOutputMode: "compatible",
          supportsJsonSchema: false,
          supportsJsonObject: false,
        },
      },
      defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
    });

    render(
      <ModelPicker
        value="deepseek-ai/DeepSeek-V4-Pro"
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "DeepSeek-V4-Pro" }));
    await user.hover((await screen.findByText("DeepSeek")));
    const item = await screen.findByTitle("deepseek-ai/DeepSeek-V4-Flash");
    expect(within(item).getByText("兼容")).toBeInTheDocument();
    fireEvent.pointerDown(item, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(item, { button: 0, ctrlKey: false });
    fireEvent.click(item);

    expect(onValueChange).toHaveBeenCalledWith("deepseek-ai/DeepSeek-V4-Flash");
  });

  it("falls back to the managed provider label for unknown model prefixes", async () => {
    const user = userEvent.setup();
    seedSettings({
      providerConfigId: "provider-system-siliconflow",
      providerLabel: "SiliconFlow",
      providerModelOptions: ["vendorless-ultra-model"],
      defaultModel: "vendorless-ultra-model",
    });

    render(<ModelPicker value="vendorless-ultra-model" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "vendorless-ultra-model" }));
    expect((await screen.findByText("SiliconFlow"))).toBeInTheDocument();

    await user.hover((await screen.findByText("SiliconFlow")));

    expect(await screen.findByTitle("vendorless-ultra-model")).toBeInTheDocument();
  });
});
