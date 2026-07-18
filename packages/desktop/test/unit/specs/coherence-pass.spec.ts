/**
 * Mechanical coherence enforcement (L2): the pure module that guarantees
 * a steward pass happens without the writer — auto-mode follow-up after
 * unswept multi-write turns, acceptance-triggered prepend in approvals.
 * Order-aware: an EARLY steward never excuses writes that come after it,
 * and the steward's own repair tools never re-arm enforcement.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  STEWARD_FIX_TOOLS,
  WRITE_TOOL_EVENT_NAMES,
  acceptancePrepend,
  coherenceInstruction,
  driveCoherencePass,
  driveResearchBackstop,
  emptyObservations,
  markSteward,
  observeResearchTool,
  observeWrite,
  shouldEnforceCoherence,
  shouldEnforceResearchSave,
  writesSinceSteward,
  type TurnObservations
} from '../../../src/main/services/ai/coherencePass'

/** Build observations from a script: 'steward' marks, anything else writes. */
const obs = (script: Array<string | [tool: string, label: string]>): TurnObservations => {
  const observations = emptyObservations()
  for (const step of script) {
    if (step === 'steward') markSteward(observations)
    else if (Array.isArray(step)) observeWrite(observations, step[0], step[1])
    else observeWrite(observations, step, step)
  }
  return observations
}

describe('shouldEnforceCoherence (order-aware)', () => {
  it('fires only in auto mode with 2+ writes and no steward', () => {
    expect(shouldEnforceCoherence(obs(['a', 'b']), 'auto')).toBe(true)
    expect(shouldEnforceCoherence(obs(['a']), 'auto')).toBe(false)
    expect(shouldEnforceCoherence(obs(['a', 'b']), 'approvals')).toBe(false)
    expect(shouldEnforceCoherence(obs(['a', 'b']), 'ask')).toBe(false)
    expect(shouldEnforceCoherence(emptyObservations(), 'auto')).toBe(false)
  })

  it('writes BEFORE the steward mark are excused', () => {
    expect(shouldEnforceCoherence(obs(['a', 'b', 'steward']), 'auto')).toBe(false)
  })

  it('writes AFTER the steward mark re-arm enforcement (the book-run case)', () => {
    // Segment 1 wrote + stewarded; segments 2-3 wrote more → pass owed.
    const bookRun = obs(['a', 'b', 'steward', 'c', 'd'])
    expect(shouldEnforceCoherence(bookRun, 'auto')).toBe(true)
    expect(writesSinceSteward(bookRun).map((w) => w.label)).toEqual(['c', 'd'])
  })

  it("the steward's own repair tools never re-arm after its mark", () => {
    const stewardFixing = obs([
      'propose_new_unit',
      'propose_new_unit',
      'steward',
      ['update_unit_meta', 'update_unit_meta u_1'],
      ['update_summary', 'update_summary u_1'],
      ['record_fact', 'record_fact zara']
    ])
    expect(shouldEnforceCoherence(stewardFixing, 'auto')).toBe(false)
    // But real prose writes after the mark still count.
    observeWrite(stewardFixing, 'propose_text_edit', 'propose_text_edit a.md')
    observeWrite(stewardFixing, 'propose_new_unit', 'propose_new_unit ch3')
    expect(shouldEnforceCoherence(stewardFixing, 'auto')).toBe(true)
  })

  it('before any mark, even steward-fix tools count as writes', () => {
    // No steward ran — two metadata writes are still an unswept change.
    const noSteward = obs([
      ['update_unit_meta', 'x'],
      ['update_summary', 'y']
    ])
    expect(shouldEnforceCoherence(noSteward, 'auto')).toBe(true)
    for (const tool of STEWARD_FIX_TOOLS) {
      expect(typeof tool).toBe('string')
    }
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

describe('research-persistence backstop', () => {
  const withResearch = (reads: number, saved: boolean): TurnObservations => {
    const observations = emptyObservations()
    for (let i = 0; i < reads; i++) observeResearchTool(observations, 'wiki_read')
    if (saved) observeResearchTool(observations, 'save_research')
    return observations
  }

  it('fires after real research with no save; stays quiet otherwise', () => {
    expect(shouldEnforceResearchSave(withResearch(3, false))).toBe(true)
    expect(shouldEnforceResearchSave(withResearch(2, false))).toBe(false)
    expect(shouldEnforceResearchSave(withResearch(5, true))).toBe(false)
    expect(shouldEnforceResearchSave(emptyObservations())).toBe(false)
  })

  it('counts every research tool; non-research tools never count', () => {
    const observations = emptyObservations()
    for (const tool of ['web_search', 'web_fetch', 'wiki_search', 'wiki_read']) {
      observeResearchTool(observations, tool)
    }
    observeResearchTool(observations, 'read_unit')
    observeResearchTool(observations, 'list_structure')
    expect(observations.webReads).toBe(4)
  })

  it('runs exactly one follow-up demanding save_research', async() => {
    const invokeNext = vi.fn().mockResolvedValue('Saved: elam-political-history.md')
    const emitStatus = vi.fn()
    const reply = await driveResearchBackstop(withResearch(4, false), { invokeNext, emitStatus })
    expect(reply).toContain('Saved')
    expect(invokeNext).toHaveBeenCalledTimes(1)
    const instruction = String(invokeNext.mock.calls[0][0])
    expect(instruction).toContain('save_research')
    expect(instruction).toContain('automated harness enforcement')
    expect(instruction).toContain('4 web lookups')

    // Already-saved turns get nothing.
    invokeNext.mockClear()
    expect(await driveResearchBackstop(withResearch(4, true), { invokeNext, emitStatus })).toBe('')
    expect(invokeNext).not.toHaveBeenCalled()
  })
})

describe('driveCoherencePass', () => {
  it('runs exactly one follow-up scoped to the writes since the mark', async() => {
    const invokeNext = vi.fn().mockResolvedValue('Steward: synced 2 units.')
    const emitStatus = vi.fn()
    const bookRun = obs([
      ['propose_new_unit', 'propose_new_unit ch1/one'],
      'steward',
      ['propose_new_unit', 'propose_new_unit ch2/two'],
      ['propose_new_unit', 'propose_new_unit ch3/three']
    ])
    const reply = await driveCoherencePass(bookRun, 'auto', { invokeNext, emitStatus })
    expect(reply).toBe('Steward: synced 2 units.')
    expect(invokeNext).toHaveBeenCalledTimes(1)
    const instruction = String(invokeNext.mock.calls[0][0])
    expect(instruction).toContain('COHERENCE PASS')
    // Scope = since the mark only; the pre-steward write is not re-swept.
    expect(instruction).toContain('ch2/two')
    expect(instruction).toContain('ch3/three')
    expect(instruction).not.toContain('ch1/one')
    expect(emitStatus).toHaveBeenCalled()
  })

  it('does nothing when the steward already ran / too few writes / wrong mode', async() => {
    const invokeNext = vi.fn()
    const emitStatus = vi.fn()
    for (const [o, mode] of [
      [obs(['a', 'b', 'steward']), 'auto'],
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
