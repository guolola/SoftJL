// Verifies the shared checkbox preserves state callbacks while adding bounded confetti.
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Checkbox } from './checkbox'

const reducedMotion = vi.hoisted(() => ({ value: false }))

vi.mock('motion/react', async (importOriginal) => ({
  ...await importOriginal<typeof import('motion/react')>(),
  useReducedMotion: () => reducedMotion.value,
}))

describe('Checkbox', () => {
  beforeEach(() => {
    reducedMotion.value = false
  })

  it('emits the original change and renders twelve particles only when checked', () => {
    const onCheckedChange = vi.fn()
    const { container } = render(
      <Checkbox aria-label='确认规则' onCheckedChange={onCheckedChange} />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: '确认规则' }))

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
    expect(container.querySelectorAll("[data-slot='checkbox-confetti-particle']")).toHaveLength(12)
  })

  it('does not render particles while unchecking or when reduced motion is requested', () => {
    const first = render(<Checkbox defaultChecked aria-label='取消规则' />)
    fireEvent.click(screen.getByRole('checkbox', { name: '取消规则' }))
    expect(first.container.querySelector("[data-slot='checkbox-confetti']")).not.toBeInTheDocument()
    first.unmount()

    reducedMotion.value = true
    const second = render(<Checkbox aria-label='减少动态效果' />)
    fireEvent.click(screen.getByRole('checkbox', { name: '减少动态效果' }))
    expect(second.container.querySelector("[data-slot='checkbox-confetti']")).not.toBeInTheDocument()
  })
})
