// Checks server/client parity before restoring sidebar preferences and responsive layout.
import { act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider, useSidebar } from './sidebar'

function SidebarShell() {
  const { isMobile } = useSidebar()
  return <span>{isMobile ? 'mobile sidebar' : 'desktop sidebar'}</span>
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.removeItem('workspace_sidebar_width')
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 })
})

describe('SidebarProvider hydration', () => {
  it.each([1440, 700])('restores 265px without mismatching server HTML at viewport %i', async (viewport) => {
    localStorage.setItem('workspace_sidebar_width', '265')
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: viewport })
    const component = <SidebarProvider resizable><SidebarShell /></SidebarProvider>
    let html: string
    vi.stubGlobal('window', undefined)
    try {
      html = renderToString(component)
    } finally {
      vi.unstubAllGlobals()
    }
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const wrapper = container.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')!
    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('256px')
    expect(container).toHaveTextContent('desktop sidebar')

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recoverableErrors: unknown[] = []
    let root: Root | undefined
    try {
      await act(async () => {
        root = hydrateRoot(container, component, { onRecoverableError: (error) => recoverableErrors.push(error) })
      })
      expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('265px')
      expect(container).toHaveTextContent(viewport < 768 ? 'mobile sidebar' : 'desktop sidebar')
      expect(recoverableErrors).toEqual([])
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      await act(async () => root?.unmount())
      container.remove()
    }
  })
})
