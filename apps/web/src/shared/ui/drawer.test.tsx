// Verifies the shared drawer's visual layering and global pointer-event cleanup.
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawer, DrawerContent, DrawerTitle } from "./drawer";

function TestDrawer({ open }: { open: boolean }) {
  return (
    <Drawer direction="right" open={open} onOpenChange={vi.fn()}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerTitle>测试抽屉</DrawerTitle>
      </DrawerContent>
    </Drawer>
  );
}

describe("Drawer", () => {
  afterEach(() => {
    document.body.style.pointerEvents = "";
  });

  it("uses a stable solid overlay and restores the previous body pointer state", async () => {
    document.body.style.pointerEvents = "none";
    const { rerender, unmount } = render(<TestDrawer open />);

    expect(screen.getByRole("dialog", { name: "测试抽屉" })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.body.style.pointerEvents).toBe("auto");
    });

    const overlay = document.querySelector<HTMLElement>("[data-slot='drawer-overlay']");
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveClass("bg-black/45");
    expect(overlay).not.toHaveClass(
      "backdrop-blur-[1px]",
      "data-[state=open]:animate-in",
      "data-[state=closed]:animate-out",
    );
    expect(screen.getByRole("dialog", { name: "测试抽屉" })).not.toHaveClass("transition");

    rerender(<TestDrawer open={false} />);
    await waitFor(() => {
      expect(document.body.style.pointerEvents).toBe("none");
    });

    rerender(<TestDrawer open />);
    await waitFor(() => {
      expect(document.body.style.pointerEvents).toBe("auto");
    });
    unmount();
    await waitFor(() => {
      expect(document.body.style.pointerEvents).toBe("none");
    });
  });
});
