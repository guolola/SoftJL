// Verifies project sidebar width changes, persistence, and collapse behavior.
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Sidebar, SidebarProvider, SidebarResizeHandle, SidebarTrigger } from './sidebar'

const label = '拖拽调整项目菜单宽度'

function renderResizableSidebar() {
  return render(
    <SidebarProvider resizable>
      <Sidebar collapsible='icon'><SidebarResizeHandle label={label} /></Sidebar>
      <SidebarTrigger />
    </SidebarProvider>
  )
}

describe('SidebarResizeHandle', () => {
  beforeEach(() => localStorage.removeItem('workspace_sidebar_width'))

  it('resizes within bounds and restores the saved width', () => {
    const view = renderResizableSidebar()
    const wrapper = document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')!
    const handle = screen.getByRole('separator', { name: label })

    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('256px')
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 256 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 360 })
    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('360px')
    expect(handle).toHaveAttribute('aria-valuenow', '360')
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 700 })
    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('480px')
    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(localStorage.getItem('workspace_sidebar_width')).toBe('480')

    view.unmount()
    renderResizableSidebar()
    expect(document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')!.style.getPropertyValue('--sidebar-width')).toBe('480px')
  })

  it('supports keyboard resizing and hides the handle when collapsed', () => {
    renderResizableSidebar()
    const handle = screen.getByRole('separator', { name: label })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(handle).toHaveAttribute('aria-valuenow', '240')
    expect(localStorage.getItem('workspace_sidebar_width')).toBe('240')

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
    expect(screen.queryByRole('separator', { name: label })).not.toBeInTheDocument()
  })

  it('finishes an active drag when the sidebar collapses', () => {
    renderResizableSidebar()
    const handle = screen.getByRole('separator', { name: label })
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 256 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300 })
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))

    expect(screen.queryByRole('separator', { name: label })).not.toBeInTheDocument()
    expect(localStorage.getItem('workspace_sidebar_width')).toBe('300')
    expect(document.body.style.cursor).toBe('')
  })
})
