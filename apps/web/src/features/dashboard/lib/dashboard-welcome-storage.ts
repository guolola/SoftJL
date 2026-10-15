// Remembers a completed welcome per account in this browser; unavailable storage never blocks entry.
const completedInMemory = new Set<string>()

export function dashboardWelcomeKey(userId: string) {
  return `uml-workspace-welcome:v1:${encodeURIComponent(userId)}`
}

export function isDashboardWelcomeConfirmed(userId?: string) {
  if (!userId) return false
  if (completedInMemory.has(userId)) return true
  try {
    const value = window.localStorage.getItem(dashboardWelcomeKey(userId))
    return value === 'true' || value === 'completed'
  } catch { return false }
}

export function needsDashboardWelcome(userId?: string) {
  return Boolean(userId) && !isDashboardWelcomeConfirmed(userId)
}

export function completeDashboardWelcome(userId?: string) {
  if (!userId) return
  completedInMemory.add(userId)
  try { window.localStorage.setItem(dashboardWelcomeKey(userId), 'true') }
  catch { /* The current session still remembers completion when browser storage is unavailable. */ }
}
