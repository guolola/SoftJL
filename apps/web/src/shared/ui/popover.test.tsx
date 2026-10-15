// Verifies the shared popover opens, closes, and restores keyboard focus.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

describe("Popover", () => {
  it("opens from the trigger and returns focus after Escape", async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger render={<Button type="button" />}>查看说明</PopoverTrigger>
        <PopoverContent side="bottom" align="start">
          <PopoverTitle>说明</PopoverTitle>
          <PopoverDescription>弹出内容</PopoverDescription>
        </PopoverContent>
      </Popover>,
    );

    const trigger = screen.getByRole("button", { name: "查看说明" });
    await user.click(trigger);
    expect(screen.getByText("弹出内容")).toBeVisible();
    expect(screen.getByText("弹出内容").closest("[data-slot='popover-content']")).toHaveClass(
      "data-open:zoom-in-0!",
      "data-closed:zoom-out-0!",
      "duration-400",
      "motion-reduce:animate-none",
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByText("弹出内容")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
