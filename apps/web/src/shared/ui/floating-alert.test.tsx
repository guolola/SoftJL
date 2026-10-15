// Verifies transient alert appearance, timing, and interaction behavior.
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
    ['success', 'success', 'circle-check'],
    ['info', 'info', 'circle-alert'],
    ['warning', 'warning', 'triangle-alert'],
    ['destructive', 'destructive', 'circle-x'],
  ] as const)('uses the alert-01 layout and distinct %s styling', (tone, color, icon) => {
    const timer = vi.spyOn(globalThis, 'setTimeout')
    render(<FloatingAlertProvider><AlertTrigger tone={tone} description='操作已完成' /></FloatingAlertProvider>)

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))
    const alert = screen.getByRole('alert')
    const statusIcon = alert.firstElementChild

    expect(alert).toHaveClass(`border-${color}/45`, `bg-${color}/10`, '*:[svg]:row-span-1')
    expect(alert).not.toHaveClass('*:[svg]:row-span-2')
    expect(statusIcon).toHaveClass(`lucide-${icon}`)
    expect(screen.getByText('操作已完成')).toHaveClass('col-start-2')
    expect(screen.getByRole('button', { name: '关闭提示' })).toBeInTheDocument()
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 2500)
  })

  it('animates entry and keeps an expiring alert mounted through its exit', async () => {
    render(<FloatingAlertProvider><AlertTrigger durationMs={30} /></FloatingAlertProvider>)

    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))
    const item = screen.getByText('保存成功').closest('[data-slot="floating-alert-item"]') as HTMLElement
    expect(item).toHaveStyle({ opacity: '0' })
    expect(item.style.transform).toContain('translateY(-8px)')

    await waitFor(() => expect(screen.queryByText('保存成功')).not.toBeInTheDocument())
  })

  it('sizes stacked alerts independently while allowing long text to wrap within the viewport', () => {
    render(<FloatingAlertProvider><div>content</div></FloatingAlertProvider>)

    act(() => {
      floatingAlert.success('已复制')
      floatingAlert.warning('请检查项目配置后重试', { description: 'https://example.com/' + 'a'.repeat(200) })
    })

    const alerts = screen.getAllByRole('alert')
    for (const alert of alerts) {
      const item = alert.closest('[data-slot="floating-alert-item"]') as HTMLElement
      expect(item).toHaveClass('w-fit', 'max-w-full', 'min-w-0')
      expect(item).not.toHaveClass('w-full')
      expect(item.parentElement).toHaveClass('items-center')
      expect(alert).toHaveClass('[overflow-wrap:anywhere]')
    }
    expect(screen.getByText('已复制')).toBeInTheDocument()
    expect(screen.getByText('请检查项目配置后重试')).toBeInTheDocument()
  })

  it('centers the status icon and close button alongside a message without a description', () => {
    render(<FloatingAlertProvider><AlertTrigger /></FloatingAlertProvider>)
    fireEvent.click(screen.getByRole('button', { name: '显示提示' }))

    expect(screen.getByRole('alert')).toHaveClass('items-center')
    expect(screen.getByRole('button', { name: '关闭提示' }).parentElement).toHaveClass('top-1/2', '-translate-y-1/2')
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
    const item = screen.getByText('保存成功').closest('[data-slot="floating-alert-item"]') as HTMLElement
    expect(item.style.transform).not.toContain('translateY(-8px)')

    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }))
    await waitFor(() => expect(screen.queryByText('保存成功')).not.toBeInTheDocument())
  })
})
