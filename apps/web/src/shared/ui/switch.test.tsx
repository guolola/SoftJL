// Verifies the motion switch preserves Base UI state semantics and size compatibility.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './switch'

describe('Switch', () => {

  it('supports the large size and forwards checked changes', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label='大型开关' size='lg' onCheckedChange={onCheckedChange} />)

    const control = screen.getByRole('switch', { name: '大型开关' })
    await userEvent.click(control)

    expect(control).toBeChecked()
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })
})
