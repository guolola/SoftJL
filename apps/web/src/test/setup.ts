// Desktop is the default fixture; responsive tests explicitly set their viewport.
import { cleanup, configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 });

// Base UI distinguishes mouse and touch through PointerEvent.pointerType.
if (!window.PointerEvent) {
  class PointerEventMock extends MouseEvent {
    pointerType: string;
    pointerId: number;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? 'mouse';
      this.pointerId = init.pointerId ?? 1;
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  window.PointerEvent = PointerEventMock as typeof PointerEvent;
}

// GitHub's deployment runner can render Radix portals slower than the default query window.
configure({ asyncUtilTimeout: 5_000 });

Object.defineProperty(window.navigator, "languages", {
  configurable: true,
  value: ["zh-CN"],
});

Object.defineProperty(window.navigator, "language", {
  configurable: true,
  value: "zh-CN",
});

afterEach(() => {
  cleanup();
});

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!window.ResizeObserver) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: ResizeObserverMock,
  });
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// ScrollArea reads Web Animations directly, while component exit animations should
// complete synchronously in JSDOM so interaction state cannot leak between tests.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}
(globalThis as typeof globalThis & { BASE_UI_ANIMATIONS_DISABLED?: boolean })
  .BASE_UI_ANIMATIONS_DISABLED = true;

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    root = null; rootMargin = ''; thresholds = [];
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
}

// JSDOM has no layout hit testing; OTP uses it to detect password-manager badges.
if (!document.elementFromPoint) document.elementFromPoint = () => null;
