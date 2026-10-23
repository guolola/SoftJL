// Covers tooltip-16 member data, pointer tracking, clipping boundaries, and keyboard access.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimatedTooltip } from './motion-tooltip'

const reducedMotion = vi.hoisted(() => ({ value: false }))

vi.mock('motion/react', async (importOriginal) => ({
  ...await importOriginal<typeof import('motion/react')>(),
  useReducedMotion: () => reducedMotion.value,
}))

const members = [
  { id: 'owner', image: null, fallback: 'HL', name: 'Howard Lloyd', designation: '所有者' },
  { id: 'editor', image: null, fallback: 'OS', name: 'Olivia Sparks', designation: '编辑者' },
]

describe('AnimatedTooltip', () => {
  beforeEach(() => {
    reducedMotion.value = false
  })

  it('shows each member’s supplied name and role outside the clipping card', async () => {
    const user = userEvent.setup()
    const { container } = render(<article style={{ overflow: 'hidden' }}><AnimatedTooltip items={members} /></article>)
    expect(screen.getByText('HL')).toBeInTheDocument()
    expect(screen.getByText('OS')).toBeInTheDocument()

    const owner = screen.getByLabelText('Howard Lloyd, 所有者')
    await user.hover(owner)
    const tooltip = screen.getByRole('tooltip')
    expect(within(tooltip).getByText('Howard Lloyd')).toBeInTheDocument()
    expect(within(tooltip).getByText('所有者')).toBeInTheDocument()
    expect(owner).toHaveAttribute('aria-describedby', tooltip.id)
    expect(container).not.toContainElement(tooltip)
    await user.unhover(owner)
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    await user.hover(screen.getByLabelText('Olivia Sparks, 编辑者'))
    expect(within(screen.getByRole('tooltip')).getByText('Olivia Sparks')).toBeInTheDocument()
    expect(within(screen.getByRole('tooltip')).getByText('编辑者')).toBeInTheDocument()
  })

  it('supports focus, Escape and blur with static tooltips when reduced motion is requested', async () => {
    reducedMotion.value = true
    const user = userEvent.setup()
    render(<AnimatedTooltip items={members} />)

    await user.tab()
    const owner = screen.getByLabelText('Howard Lloyd, 所有者')
    expect(owner).toHaveFocus()
    fireEvent.mouseMove(screen.getByText('HL'), { clientX: 140 })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    expect(owner).not.toHaveAttribute('aria-describedby')

    await user.tab()
    expect(within(screen.getByRole('tooltip')).getByText('Olivia Sparks')).toBeInTheDocument()
    await user.tab()
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})
