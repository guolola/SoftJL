// Covers scrollbar geometry, timed position locking and interrupted disclosure cleanup.
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDisclosureScrollLock } from "./use-disclosure-scroll-lock";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mount(direction = "ltr") {
  const viewport = document.createElement("div");
  viewport.style.cssText = `overflow-y:auto;scrollbar-gutter:stable both-edges;scrollbar-width:thin;padding:0 24px;direction:${direction}`;
  const content = document.createElement("div");
  viewport.append(content);
  document.body.append(viewport);
  const hook = renderHook(() => useDisclosureScrollLock({ current: content }, 200));
  return { ...hook, viewport };
}

it.each(["ltr", "rtl"])("preserves both scrollbar gutters and padding during %s disclosure animation", direction => {
  const hook = mount(direction);
  const originalStyle = hook.viewport.getAttribute("style");
  hook.viewport.scrollTop = 120;
  act(() => hook.result.current());
  expect(hook.viewport.getAttribute("style")).toBe(originalStyle);
  hook.viewport.scrollTop = 170;
  fireEvent.scroll(hook.viewport);
  expect(hook.viewport.scrollTop).toBe(120);
  act(() => vi.advanceTimersByTime(200));
  hook.viewport.scrollTop = 180;
  fireEvent.scroll(hook.viewport);
  expect(hook.viewport.scrollTop).toBe(180);
  expect(hook.viewport.getAttribute("style")).toBe(originalStyle);
  hook.unmount();
  hook.viewport.remove();
});

it("restarts the lock when toggled again and removes it when unmounted", () => {
  const hook = mount();
  hook.viewport.scrollTop = 120;
  act(() => hook.result.current());
  act(() => vi.advanceTimersByTime(150));
  act(() => hook.result.current());
  act(() => vi.advanceTimersByTime(50));
  hook.viewport.scrollTop = 170;
  fireEvent.scroll(hook.viewport);
  expect(hook.viewport.scrollTop).toBe(120);
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
  hook.viewport.scrollTop = 180;
  fireEvent.scroll(hook.viewport);
  expect(hook.viewport.scrollTop).toBe(180);
  hook.viewport.remove();
});
