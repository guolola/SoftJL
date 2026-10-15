// Verifies the motion switch preserves Base UI state semantics and size compatibility.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './switch'

describe('Switch', () => {
  it('maps the legacy default size to medium and exposes the motion thumb', () => {
    const { container } = render(<Switch aria-label='默认开关' />)

    expect(screen.getByRole('switch', { name: '默认开关' })).toHaveAttribute('data-size', 'md')
    expect(container.querySelector("[data-slot='switch-thumb']")).toHaveClass(
      'group-data-[size=md]/switch:size-4',
    )
  })

  it('supports the large size and forwards checked changes', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label='大型开关' size='lg' onCheckedChange={onCheckedChange} />)

    const control = screen.getByRole('switch', { name: '大型开关' })
    expect(control).toHaveAttribute('data-size', 'lg')
    await userEvent.click(control)

    expect(control).toBeChecked()
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })
})
