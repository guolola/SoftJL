// Verifies the shared Select wrapper preserves native-select value semantics.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { SelectControl } from "./select";

describe("SelectControl", () => {
  test("renders a single flexible visible value inside the trigger", () => {
    render(
      <SelectControl
        aria-label="需求类型"
        value="业务规则"
        onValueChange={vi.fn()}
        className="w-[6.5rem]"
        options={[
          { value: "业务规则", label: "业务规则" },
          { value: "功能需求", label: "功能需求" },
        ]}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "需求类型" });
    const valueNodes = trigger.querySelectorAll("[data-slot='select-value']");

    expect(trigger).toHaveTextContent("业务规则");
    expect(valueNodes).toHaveLength(1);
  });

  test("maps empty-string option values back to empty strings", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <SelectControl
        aria-label="托管配置"
        value="custom-config"
        onValueChange={onValueChange}
        options={[
          { value: "", label: "不使用托管配置" },
          { value: "custom-config", label: "课程默认配置" },
        ]}
      />,
    );

    screen.getByRole("combobox", { name: "托管配置" }).focus();
    await user.keyboard("[ArrowDown]");
    await user.click(screen.getByRole("option", { name: "不使用托管配置" }));

    expect(onValueChange).toHaveBeenCalledWith("");
  });
});
