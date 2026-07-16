/**
 * Mechanical coherence enforcement (L2): the pure module that guarantees
 * a steward pass happens without the writer — auto-mode follow-up after
 * unswept multi-write turns, acceptance-triggered prepend in approvals.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  WRITE_TOOL_EVENT_NAMES,
  acceptancePrepend,
  coherenceInstruction,
  driveCoherencePass,
  emptyObservations,
  shouldEnforceCoherence,
  type TurnObservations
} from '../../../src/main/services/ai/coherencePass'

const obs = (writes: string[], stewardRan = false): TurnObservations => ({
  writes,
  stewardRan
})

describe('shouldEnforceCoherence', () => {
  it('fires only in auto mode with 2+ writes and no steward', () => {
    expect(shouldEnforceCoherence(obs(['a', 'b']), 'auto')).toBe(true)
    expect(shouldEnforceCoherence(obs(['a']), 'auto')).toBe(false)
    expect(shouldEnforceCoherence(obs(['a', 'b'], true), 'auto')).toBe(false)
    expect(shouldEnforceCoherence(obs(['a', 'b']), 'approvals')).toBe(false)
    expect(shouldEnforceCoherence(obs(['a', 'b']), 'ask')).toBe(false)
    expect(shouldEnforceCoherence(emptyObservations(), 'auto')).toBe(false)
  })

  it('the write-tool set covers every mutating tool class', () => {
    for (const name of [
      'propose_text_edit',
      'propose_new_unit',
      'update_unit_meta',
      'restructure_unit',
      'record_decision',
      'delete_unit'
    ]) {
      expect(WRITE_TOOL_EVENT_NAMES.has(name), name).toBe(true)
    }
    // Reads never count.
    expect(WRITE_TOOL_EVENT_NAMES.has('read_unit')).toBe(false)
    expect(WRITE_TOOL_EVENT_NAMES.has('project_health')).toBe(false)
  })
})

describe('coherenceInstruction', () => {
  it('names what changed, marks itself as harness (not writer), and bounds the work', () => {
    const text = coherenceInstruction(['propose_new_unit ch2/the-drop', 'update_summary u_9'])
    expect(text).toContain('automated harness enforcement, not the writer')
    expect(text).toContain('propose_new_unit ch2/the-drop')
    expect(text).toContain('Spawn ONE steward')
    expect(text).toContain('Then STOP')
  })

  it('dedupes and caps the scope list', () => {
    const many = Array.from({ length: 30 }, (_, i) => `item-${i % 5}`)
    const text = coherenceInstruction(many)
    expect((text.match(/item-0/g) ?? []).length).toBe(1)
  })
})

describe('acceptancePrepend (approvals-mode trigger)', () => {
  const note = (body: string): string =>
    `[EDIT REVIEW — automated report of the writer's decisions]\n${body}`

  it('2+ accepted edits produce the start-of-turn instruction', () => {
    const result = acceptancePrepend(
      note('ACCEPTED (now in the manuscript): opening.md (×2), the-letter.md')
    )
    expect(result).toContain('accepted 3 edits')
    expect(result).toContain('BEFORE any new work')
  })

  it('single accepts, pure rejections, and no note stay quiet', () => {
    expect(acceptancePrepend(note('ACCEPTED (now in the manuscript): opening.md'))).toBeNull()
    expect(
      acceptancePrepend(note('REJECTED (NOT applied — do not assume this content exists): a.md'))
    ).toBeNull()
    expect(acceptancePrepend(null)).toBeNull()
  })
})

describe('driveCoherencePass', () => {
  it('runs exactly one follow-up when enforcement applies', async() => {
    const invokeNext = vi.fn().mockResolvedValue('Steward: synced 2 units.')
    const emitStatus = vi.fn()
    const reply = await driveCoherencePass(obs(['a', 'b']), 'auto', { invokeNext, emitStatus })
    expect(reply).toBe('Steward: synced 2 units.')
    expect(invokeNext).toHaveBeenCalledTimes(1)
    expect(String(invokeNext.mock.calls[0][0])).toContain('COHERENCE PASS')
    expect(emitStatus).toHaveBeenCalled()
  })

  it('does nothing when the steward already ran / too few writes / wrong mode', async() => {
    const invokeNext = vi.fn()
    const emitStatus = vi.fn()
    for (const [o, mode] of [
      [obs(['a', 'b'], true), 'auto'],
      [obs(['a']), 'auto'],
      [obs(['a', 'b']), 'approvals'],
      [obs(['a', 'b']), 'ask']
    ] as const) {
      const reply = await driveCoherencePass(o, mode, { invokeNext, emitStatus })
      expect(reply).toBe('')
    }
    expect(invokeNext).not.toHaveBeenCalled()
  })
})
