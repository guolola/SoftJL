// Verifies the shared checkbox updates checked state and forwards changes.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './checkbox'

describe('Checkbox', () => {
  it('forwards checked changes', () => {
    const onCheckedChange = vi.fn()
    render(
      <Checkbox aria-label='确认规则' onCheckedChange={onCheckedChange} />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: '确认规则' }))

    expect(screen.getByRole('checkbox', { name: '确认规则' })).toBeChecked()
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })
})
