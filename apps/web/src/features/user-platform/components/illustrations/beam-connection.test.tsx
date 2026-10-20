// Covers beam measurements during dialog entry, scaled previews, resizing, and cleanup.
import { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeamConnection, ConnectionBeam } from "./beam-connection";

const OriginalResizeObserver = globalThis.ResizeObserver;

function Preview() {
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);
  return <BeamConnection>
    {({ containerRef }) => <>
      <div ref={fromRef} data-endpoint="from" />
      <div ref={toRef} data-endpoint="to" />
      <ConnectionBeam containerRef={containerRef} fromRef={fromRef} toRef={toRef}
        beamType="dash" beamColor="#89d2b7" beamSize={8} active={false} speed={100} />
    </>}
  </BeamConnection>;
}

describe("ConnectionBeam", () => {
  let scale: number;
  let destinationTop: number;
  let frames: Map<number, FrameRequestCallback>;
  let resize: ResizeObserverCallback;
  let disconnect: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    scale = 0;
    destinationTop = 60;
    frames = new Map();
    let nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { frames.delete(id); }));
    disconnect = vi.fn<() => void>();
    globalThis.ResizeObserver = class extends OriginalResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        resize = callback;
      }
      disconnect = disconnect;
    };
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(336);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const endpoint = this.dataset.endpoint;
      return new DOMRect(
        100 + (endpoint ? 112 * scale : 0),
        200 + (endpoint === "to" ? destinationTop * scale : 0),
        (endpoint ? 96 : 320) * scale,
        (endpoint ? 48 : 336) * scale,
      );
    });
  });

  afterEach(() => {
    cleanup();
    globalThis.ResizeObserver = OriginalResizeObserver;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function nextFrame() {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback(0));
    });
  }

  it("draws after a zero-scale dialog opens without any resize notification", () => {
    const { container } = render(<Preview />);
    expect(container.querySelector("path")).toHaveAttribute("d", "");
    nextFrame();
    expect(frames.size).toBe(1);

    scale = 0.5;
    nextFrame();
    expect(container.querySelector("path")).toHaveAttribute("d", "M 160 24 L 160 84");
    expect(frames.size).toBe(0);
  });

  it("measures an already visible preview immediately and updates on resize", () => {
    scale = 0.5;
    const { container } = render(<Preview />);
    expect(container.querySelector("path")).toHaveAttribute("d", "M 160 24 L 160 84");
    expect(frames.size).toBe(0);

    scale = 1;
    destinationTop = 120;
    act(() => { resize([], {} as ResizeObserver); });
    expect(container.querySelector("path")).toHaveAttribute("d", "M 160 24 L 160 144");
  });

  it("keeps only one retry when resize notifications arrive during entry", () => {
    render(<Preview />);
    act(() => { resize([], {} as ResizeObserver); });
    expect(frames.size).toBe(1);
    scale = 0.5;
    act(() => { resize([], {} as ResizeObserver); });
    expect(frames.size).toBe(0);
  });

  it("cancels pending measurements when the dialog unmounts", () => {
    const { unmount } = render(<Preview />);
    expect(frames.size).toBe(1);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });
});
