// Verifies transient alert timing, dismissal, focus, and stack behavior.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FloatingAlertProvider, floatingAlert, showFloatingAlert, useFloatingAlert, type FloatingAlertTone } from './floating-alert'

const reducedMotion = vi.hoisted(() => ({ value: false }))

vi.mock('motion/react', async importOriginal => ({
  ...await importOriginal<typeof import('motion/react')>(),
  useReducedMotion: () => reducedMotion.value,
}))

function AlertTrigger({
  tone = 'success',
  durationMs,
  description,
}: {
  tone?: FloatingAlertTone
  durationMs?: number
  description?: string
}) {
  const { showAlert } = useFloatingAlert()
  return (
    <button type='button' onClick={() => showAlert({ title: '保存成功', tone, durationMs, description })}>
      显示提示
    </button>
  )
}

describe('FloatingAlertProvider', () => {
  beforeEach(() => {
    reducedMotion.value = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    'success', 'info', 'warning', 'destructive',
  ] as const)('exposes a dismissible %s alert with the default expiry', (tone) => {
    const timer = vi.spyOn(globalThis, 'setTimeout')
    render(<FloatingAlertProvider><AlertTrigger tone={tone} description='操作已完成' /></FloatingAlertProvider>)

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))
    expect(screen.getByRole('button', { name: '关闭提示' })).toBeInTheDocument()
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 2500)
  })

  it('removes an alert after its configured expiry', async () => {
    render(<FloatingAlertProvider><AlertTrigger durationMs={30} /></FloatingAlertProvider>)

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))

    await waitFor(() => expect(screen.queryByText('保存成功')).not.toBeInTheDocument())
  })

  it('keeps alerts in a body-level live region instead of a clipped nested dialog', async () => {
    render(<FloatingAlertProvider>
      <div data-slot='dialog-content' data-open='' style={{ overflow: 'hidden', transform: 'translateX(1px)' }}>
        <div data-slot='dialog-content' data-open=''><AlertTrigger /></div>
      </div>
    </FloatingAlertProvider>)
    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))
    const viewport = screen.getByRole('alert').closest('[data-slot="floating-alert-viewport"]')
    expect(viewport?.parentElement).toBe(document.body)
    expect(viewport).toHaveAttribute('aria-live', 'polite')
    expect(viewport?.closest('[data-slot="dialog-content"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('pauses while hovered and animates manual close', async () => {
    render(<FloatingAlertProvider><AlertTrigger tone='destructive' durationMs={40} /></FloatingAlertProvider>)

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))
    const alert = screen.getByRole('alert')
    fireEvent.mouseEnter(alert)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
    expect(screen.getByText('保存成功')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(screen.getByText('保存成功')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('保存成功')).not.toBeInTheDocument())
  })

  it('pauses while its close button is focused', async () => {
    render(<FloatingAlertProvider><AlertTrigger durationMs={40} /></FloatingAlertProvider>)

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))
    const close = screen.getByRole('button', { name: '关闭提示' })
    fireEvent.focus(close)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)) })
    expect(screen.getByText('保存成功')).toBeInTheDocument()

    fireEvent.blur(close)
    await waitFor(() => expect(screen.queryByText('保存成功')).not.toBeInTheDocument())
  })

  it('accepts imperative alerts, replaces matching IDs, and limits the active stack to three', async () => {
    render(<FloatingAlertProvider><div>content</div></FloatingAlertProvider>)

    act(() => {
      showFloatingAlert({ id: 'network', title: '第一次', tone: 'destructive' })
      showFloatingAlert({ id: 'network', title: '第二次', tone: 'destructive' })
      floatingAlert.success('保存完成')
      floatingAlert.warning('需要检查')
      floatingAlert.message('最新消息')
    })

    expect(screen.queryByText('第一次')).not.toBeInTheDocument()
    expect(screen.getByText('最新消息')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(3))
    expect(screen.queryByText('第二次')).not.toBeInTheDocument()
  })

  it('removes movement for reduced-motion users while retaining dismiss behavior', async () => {
    reducedMotion.value = true
    render(<FloatingAlertProvider><AlertTrigger /></FloatingAlertProvider>)

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))

    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    await waitFor(() => expect(screen.queryByText('保存成功')).not.toBeInTheDocument())
  })
})
