/**
 * Writing-goal math (SOTA batch-2): deadline-driven daily quota,
 * deadline-days, and target-input parsing. Pure — the binder's chips/
 * quota render from these.
 */

import { describe, it, expect } from 'vitest'
import { daysUntil, dailyQuota, parseTargetInput } from '../../../src/renderer/src/util/writingGoals'

describe('daysUntil', () => {
  const now = new Date('2026-07-19T12:00:00').getTime()

  it('counts remaining days inclusive of today through the deadline (min 1)', () => {
    // Now = midday the 19th → tomorrow's end-of-day is ~1.5 days out, so
    // the writer effectively has today + tomorrow = 2 days.
    expect(daysUntil('2026-07-20', now)).toBe(2)
    expect(daysUntil('2026-07-29', now)).toBe(11)
    // A deadline today still leaves one day, never zero/negative.
    expect(daysUntil('2026-07-19', now)).toBe(1)
    // A past deadline clamps to 1 (no negative quota).
    expect(daysUntil('2026-07-01', now)).toBe(1)
  })

  it('returns null for an absent or malformed deadline', () => {
    expect(daysUntil('', now)).toBeNull()
    expect(daysUntil('someday', now)).toBeNull()
    expect(daysUntil('2026/07/20', now)).toBeNull()
  })
})

describe('dailyQuota', () => {
  it('divides the remaining words by days left, rounding up', () => {
    expect(dailyQuota(50_000, 20_000, 10)).toBe(3000)
    expect(dailyQuota(50_000, 0, 7)).toBe(7143) // ceil(50000/7)
  })

  it('returns null when the target is met, or there is no target/deadline', () => {
    expect(dailyQuota(50_000, 50_000, 10)).toBeNull()
    expect(dailyQuota(50_000, 60_000, 10)).toBeNull()
    expect(dailyQuota(0, 0, 10)).toBeNull()
    expect(dailyQuota(50_000, 0, null)).toBeNull()
  })
})

describe('parseTargetInput', () => {
  it('parses a bare count', () => {
    expect(parseTargetInput('50000')).toEqual({ target: 50_000, deadline: '' })
    expect(parseTargetInput('  80000  ')).toEqual({ target: 80_000, deadline: '' })
  })

  it('parses "count by DATE"', () => {
    expect(parseTargetInput('50000 by 2026-12-31')).toEqual({
      target: 50_000,
      deadline: '2026-12-31'
    })
    expect(parseTargetInput('50000  BY 2026-12-31')).toEqual({
      target: 50_000,
      deadline: '2026-12-31'
    })
  })

  it('empty / zero target drops any deadline', () => {
    expect(parseTargetInput('')).toEqual({ target: 0, deadline: '' })
    expect(parseTargetInput('0 by 2026-12-31')).toEqual({ target: 0, deadline: '' })
  })
})
