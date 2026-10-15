// Supplies measured DOM geometry for the real React Flow canvas in JSDOM tests.
import { beforeEach, afterEach, vi } from 'vitest';
export function useReactFlowTestLayout() {
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const originalObserver = globalThis.ResizeObserver;
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList.contains('react-flow') ? 1024 : 288; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.classList.contains('react-flow') ? 600 : 100; } });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor(transform: string) { const scale = /scale\(([^)]+)\)/.exec(transform); if (scale) this.m22 = Number(scale[1]); } });
    globalThis.ResizeObserver = class {
      timers: ReturnType<typeof setTimeout>[] = [];
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) { this.timers.push(setTimeout(() => this.callback([{ target, contentRect: { width: (target as HTMLElement).offsetWidth, height: (target as HTMLElement).offsetHeight } } as ResizeObserverEntry], this as unknown as ResizeObserver), 0)); }
      unobserve() {}
      disconnect() { this.timers.forEach(clearTimeout); }
    } as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    if (width) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width);
    if (height) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height);
    globalThis.ResizeObserver = originalObserver;
    vi.unstubAllGlobals();
  });
}
