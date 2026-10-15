// Pins the mobile breakpoint that decides between the desktop sidebar and the mobile sheet.
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useIsMobile } from "./use-mobile";

const setWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
};

describe("useIsMobile", () => {
  afterEach(() => {
    setWidth(1024);
  });

  it("treats laptop widths as desktop", () => {
    setWidth(800);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("treats phone widths as mobile", () => {
    setWidth(700);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
});
