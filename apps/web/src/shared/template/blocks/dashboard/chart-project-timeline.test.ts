import { describe, expect, it } from 'vitest'

import { buildTimelineAxis } from './chart-project-timeline'

describe('project timeline axis', () => {
  it.each([0, 1, 2, 3, 5, 6, 30])('uses distinct day ticks for a %i-day range', span => {
    const start = 20_724
    const { domain, ticks } = buildTimelineAxis([start, start + span])

    expect(new Set(ticks).size).toBe(ticks.length)
    expect(ticks[0]).toBe(domain[0])
    expect(ticks.at(-1)).toBe(domain[1])
    expect(domain[1]).toBeGreaterThan(domain[0])
  })
})
