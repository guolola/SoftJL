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
    expect(screen.getByText('HL').closest('[data-slot="avatar"]')).toHaveAttribute('data-size', 'sm')

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

  it('tracks pointer movement over fallback children using the avatar bounds', async () => {
    render(<AnimatedTooltip items={[members[0]]} />)
    const fallback = screen.getByText('HL')
    const avatar = fallback.closest('[data-slot="avatar"]') as HTMLElement
    vi.spyOn(avatar, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 200, width: 24, height: 24, right: 124, bottom: 224, x: 100, y: 200, toJSON: () => ({}),
    })
    fireEvent.mouseEnter(screen.getByLabelText('Howard Lloyd, 所有者'))
    fireEvent.mouseMove(fallback, { clientX: 124 })
    const bubble = screen.getByRole('tooltip').firstElementChild as HTMLElement
    await waitFor(() => expect(bubble.style.transform).toMatch(/rotate\([1-9][\d.]*deg\)/))
  })

  it('allows a modal to raise its tooltip portal without changing other tooltip layers', async () => {
    reducedMotion.value = true
    const user = userEvent.setup()
    render(<><AnimatedTooltip items={[members[0]]} tooltipClassName='z-[110]' /><AnimatedTooltip items={[members[1]]} /></>)
    await user.hover(screen.getByLabelText('Howard Lloyd, 所有者'))
    expect(screen.getByRole('tooltip')).toHaveClass('z-[110]')
    expect(screen.getByRole('tooltip')).not.toHaveClass('z-50')
    await user.hover(screen.getByLabelText('Olivia Sparks, 编辑者'))
    await waitFor(() => expect(screen.getAllByRole('tooltip')).toHaveLength(1))
    expect(screen.getByRole('tooltip')).toHaveClass('z-50')
  })

  it('supports focus, Escape and blur with static tooltips when reduced motion is requested', async () => {
    reducedMotion.value = true
    const user = userEvent.setup()
    render(<AnimatedTooltip items={members} />)

    await user.tab()
    const owner = screen.getByLabelText('Howard Lloyd, 所有者')
    expect(owner).toHaveFocus()
    const bubble = screen.getByRole('tooltip').firstElementChild as HTMLElement
    fireEvent.mouseMove(screen.getByText('HL'), { clientX: 140 })
    expect(bubble.style.transform).toBe('none')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    expect(owner).not.toHaveAttribute('aria-describedby')

    await user.tab()
    expect(within(screen.getByRole('tooltip')).getByText('Olivia Sparks')).toBeInTheDocument()
    await user.tab()
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})
