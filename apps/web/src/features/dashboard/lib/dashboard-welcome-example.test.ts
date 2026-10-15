// Verifies illustrative welcome data satisfies the real widget contract without mutating the empty account.
import { expect, it } from 'vitest'
import { dashboardSummarySchema } from '@uml-platform/contracts'
import { dashboardFixture } from '../testing/dashboard-fixture'
import { buildDashboardWelcomeExample } from './dashboard-welcome-example'

it('fills all real dashboard widgets with ephemeral samples and leaves account data empty', () => {
  const account = dashboardFixture(0)
  const before = structuredClone(account)
  const example = buildDashboardWelcomeExample(account)
  expect(dashboardSummarySchema.safeParse(example).success).toBe(true)
  expect(example.totals.projects).toBeGreaterThan(0)
  expect(example.monthly.some(month => month.completed > 0)).toBe(true)
  expect(example.artifactDurations.some(item => item.averageDurationMs! > 0)).toBe(true)
  expect(example.totals.successRate).toBeGreaterThan(0)
  expect(example.currentUser).toEqual(account.currentUser)
  expect(account).toEqual(before)
})
