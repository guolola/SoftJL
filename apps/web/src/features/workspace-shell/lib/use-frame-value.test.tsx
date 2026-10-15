// Verifies frame coalescing without delaying history, terminal state or task switches.
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFrameValue } from "./use-frame-value";

afterEach(() => vi.unstubAllGlobals());
it("coalesces pending fragments and immediately exposes terminal content", () => {
  let frame: FrameRequestCallback | undefined;
  const request = vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const { result, rerender } = renderHook(({ text, live, id }) => useFrameValue(text, live, id), { initialProps: { text: "历史正文", live: true, id: "a" } });
  rerender({ text: "历史正文甲", live: true, id: "a" });
  rerender({ text: "历史正文甲乙", live: true, id: "a" });
  expect(result.current).toBe("历史正文");
  expect(request).toHaveBeenCalledTimes(1);
  act(() => frame?.(0));
  expect(result.current).toBe("历史正文甲乙");
  rerender({ text: "完整正文", live: false, id: "a" });
  expect(result.current).toBe("完整正文");
  rerender({ text: "另一个任务", live: true, id: "b" });
  expect(result.current).toBe("另一个任务");
});
