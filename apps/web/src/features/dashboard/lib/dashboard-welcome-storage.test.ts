// Verifies first-visit completion is scoped to the account and resilient to disabled browser storage.
import { describe, expect, it, vi } from 'vitest'
import { completeDashboardWelcome, dashboardWelcomeKey, needsDashboardWelcome } from './dashboard-welcome-storage'

describe('dashboard welcome storage', () => {
  it('requires an account and remembers only the account which completed welcome', () => {
    expect(needsDashboardWelcome()).toBe(false)
    expect(needsDashboardWelcome('welcome-storage-a')).toBe(true)
    completeDashboardWelcome('welcome-storage-a')
    expect(needsDashboardWelcome('welcome-storage-a')).toBe(false)
    expect(needsDashboardWelcome('welcome-storage-b')).toBe(true)
    expect(localStorage.getItem(dashboardWelcomeKey('welcome-storage-a'))).toBe('true')
  })
  it('uses persisted completion on a new page mount', () => {
    localStorage.setItem(dashboardWelcomeKey('welcome-storage-persisted'), 'completed')
    expect(needsDashboardWelcome('welcome-storage-persisted')).toBe(false)
  })
  it('does not block confirmation when storage is unavailable', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable') })
    try {
      expect(needsDashboardWelcome('welcome-storage-private')).toBe(true)
      expect(() => completeDashboardWelcome('welcome-storage-private')).not.toThrow()
      expect(needsDashboardWelcome('welcome-storage-private')).toBe(false)
    } finally { get.mockRestore(); set.mockRestore() }
  })
})
