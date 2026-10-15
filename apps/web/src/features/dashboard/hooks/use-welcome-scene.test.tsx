// Exercises production welcome lifecycle, shell locking, and cleanup with a controlled animation clock.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWelcomeScene } from './use-welcome-scene'

const motion = vi.hoisted(() => ({ animate: vi.fn() }))
vi.mock('motion/react', () => ({ animate: motion.animate }))
const originalResizeObserver = globalThis.ResizeObserver

type AnimationOptions = { duration: number; onUpdate: (value: number) => void; onComplete: () => void }
let scene: ReturnType<typeof useWelcomeScene>
let frames: Map<number, FrameRequestCallback>
let now: number
let nextFrame: number
let animation: AnimationOptions
let stopAnimation: ReturnType<typeof vi.fn>
let resize: () => void
let disconnect: ReturnType<typeof vi.fn>
let reduced: boolean
let preferenceListener: (() => void) | undefined
let stageWidth: number

function Fixture({ enabled = true, onComplete }: { enabled?: boolean; onComplete?: () => void } = {}) {
  scene = useWelcomeScene({ enabled, onComplete })
  return <div ref={scene.stageRef} data-testid='stage'>
    <div ref={scene.gridRef}>
      <div data-testid='dashboard-06-grid'>
        {Array.from({ length: 12 }, (_, index) => <div key={index} data-welcome-card={index} data-index={index}
          style={index === 0 ? { opacity: .95, transform: 'rotate(2deg)', zIndex: 3, boxShadow: '0 2px 4px black' } : {}} />)}
      </div>
    </div>
  </div>
}

function nextPaint(elapsed = 16) {
  act(() => {
    now += elapsed
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback(now))
  })
}

function cards() { return Array.from(document.querySelectorAll<HTMLElement>('[data-welcome-card]')) }
function finishReturn() { act(() => { animation.onUpdate(1); animation.onComplete() }) }

beforeEach(() => {
  frames = new Map()
  now = 1000
  nextFrame = 0
  stageWidth = 1200
  reduced = false
  preferenceListener = undefined
  document.body.style.overflow = 'auto'
  stopAnimation = vi.fn()
  motion.animate.mockReset().mockImplementation((_from, _to, options: AnimationOptions) => {
    animation = options
    return { stop: stopAnimation }
  })
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames.delete(id) }))
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return reduced },
    addEventListener: (_event: string, callback: () => void) => { preferenceListener = callback },
    removeEventListener: () => { preferenceListener = undefined },
  })))
  disconnect = vi.fn()
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect = disconnect
  } as unknown as typeof ResizeObserver
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'stage') return new DOMRect(0, 72, stageWidth, 900)
    const index = Number(this.dataset.index ?? 0)
    return new DOMRect((index % 3) * 300 + 24, Math.floor(index / 3) * 260 + 170, index < 6 ? 270 : 540, index < 6 ? 210 : 370)
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  globalThis.ResizeObserver = originalResizeObserver
  document.body.style.overflow = ''
})

describe('useWelcomeScene', () => {
  it('skips a completed welcome without locking the shell, and starts only when enabled', () => {
    const complete = vi.fn()
    const view = render(<Fixture enabled={false} onComplete={complete} />)
    const initialStyles = cards().map(card => card.getAttribute('style'))
    expect(scene.phase).toBe('settled')
    expect(document.body.style.overflow).toBe('auto')
    expect(frames.size).toBe(0)
    expect(cards().map(card => card.getAttribute('style'))).toEqual(initialStyles)
    view.rerender(<Fixture enabled onComplete={complete} />)
    nextPaint()
    expect(scene.phase).toBe('floating')
    expect(complete).not.toHaveBeenCalled()
    act(() => scene.confirm())
    expect(complete).not.toHaveBeenCalled()
    finishReturn()
    expect(complete).toHaveBeenCalledTimes(1)
  })
  it('measures before revealing cards, guards repeated confirmation, and restores the original grid', () => {
    render(<Fixture />)
    const initialStyles = cards().map(card => card.getAttribute('style'))
    expect(scene.phase).toBe('preparing')
    expect(document.body.style.overflow).toBe('hidden')
    nextPaint()
    expect(scene.phase).toBe('floating')
    expect(cards().filter(card => Number(card.style.opacity) > 0)).toHaveLength(8)
    const floated = cards()[0].style.transform
    nextPaint(500)
    expect(cards()[0].style.transform).not.toBe(floated)
    act(() => { scene.confirm(); scene.confirm(); scene.confirm() })
    expect(scene.phase).toBe('returning')
    expect(motion.animate).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
    finishReturn()
    expect(scene.phase).toBe('settled')
    expect(document.body.style.overflow).toBe('auto')
    expect(cards().map(card => card.getAttribute('style') || null)).toEqual(initialStyles)
    expect(cards().every(card => !card.hasAttribute('data-welcome-depth'))).toBe(true)

    act(() => scene.confirm())
    expect(scene.phase).toBe('settled')
    expect(motion.animate).toHaveBeenCalledTimes(1)
  })

  it('recomputes the visible layout on resize and immediately settles a return interrupted by resize', () => {
    render(<Fixture />)
    nextPaint()
    stageWidth = 390
    act(() => resize())
    nextPaint()
    expect(cards().filter(card => Number(card.style.opacity) > 0)).toHaveLength(4)
    act(() => scene.confirm())
    act(() => animation.onUpdate(.3))
    expect(scene.phase).toBe('returning')
    act(() => window.dispatchEvent(new Event('resize')))
    expect(scene.phase).toBe('settled')
    expect(stopAnimation).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
    expect(document.body.style.overflow).toBe('auto')
    expect(cards()[1].style.transform).toBe('')
  })

  it('uses a static reduced-motion welcome and safely handles a preference change mid-return', () => {
    reduced = true
    const view = render(<Fixture />)
    nextPaint()
    expect(scene.reducedMotion).toBe(true)
    expect(scene.phase).toBe('floating')
    expect(cards().every(card => card.style.transform === '')).toBe(true)
    expect(frames.size).toBe(0)
    act(() => scene.confirm())
    expect(animation.duration).toBeLessThan(.3)
    act(() => { reduced = false; preferenceListener?.() })
    expect(scene.phase).toBe('settled')
    expect(scene.reducedMotion).toBe(false)
    expect(stopAnimation).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
    view.unmount()
    render(<Fixture />)
    nextPaint()
    expect(cards()[1].style.transform).not.toBe('')
    expect(frames.size).toBe(1)
  })

  it.each(['floating', 'returning'] as const)('unmounting while %s restores owned styles and stops all future work', phase => {
    const view = render(<Fixture />)
    const elements = cards()
    const initialStyles = elements.map(card => card.getAttribute('style'))
    nextPaint()
    if (phase === 'returning') act(() => scene.confirm())
    view.unmount()
    expect(elements.map(card => card.getAttribute('style') || null)).toEqual(initialStyles)
    expect(document.body.style.overflow).toBe('auto')
    expect(frames.size).toBe(0)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(preferenceListener).toBeUndefined()
    if (phase === 'returning') expect(stopAnimation).toHaveBeenCalledTimes(1)
    act(() => { window.dispatchEvent(new Event('resize')); scene.confirm() })
    nextPaint()
    expect(frames.size).toBe(0)
    expect(elements.map(card => card.getAttribute('style') || null)).toEqual(initialStyles)
  })
})
