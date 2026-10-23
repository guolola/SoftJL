// Verifies drawer lifecycle and global pointer-event cleanup.
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

  it("restores the previous body pointer state after closing and unmounting", async () => {
    document.body.style.pointerEvents = "none";
    const { rerender, unmount } = render(<TestDrawer open />);

    expect(screen.getByRole("dialog", { name: "测试抽屉" })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.body.style.pointerEvents).toBe("auto");
    });

    const overlay = document.querySelector<HTMLElement>("[data-slot='drawer-overlay']");
    expect(overlay).not.toBeNull();

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
