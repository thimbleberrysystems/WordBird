/** The status dot is a control: one click advances the cycle, everywhere. */

import { describe, it, expect } from 'vitest'
import { STATUS_CYCLE, nextStatus } from '../../../src/renderer/src/util/novelStatus'

describe('nextStatus', () => {
  it('cycles idea → draft → revised → final → idea', () => {
    expect(nextStatus('idea')).toBe('draft')
    expect(nextStatus('draft')).toBe('revised')
    expect(nextStatus('revised')).toBe('final')
    expect(nextStatus('final')).toBe('idea')
  })

  it('treats missing/unknown status as idea', () => {
    expect(nextStatus(undefined)).toBe('draft')
    expect(nextStatus(null)).toBe('draft')
    expect(nextStatus('polished')).toBe('draft')
  })

  it('the cycle matches the NovelUnitStatus union', () => {
    expect(STATUS_CYCLE).toEqual(['idea', 'draft', 'revised', 'final'])
  })
})
