/**
 * Mechanical coherence enforcement (L2 of the overseeing layer).
 *
 * Doctrine (L1) asks the supervisor to end multi-write turns with a
 * steward pass; this module makes it a GUARANTEE the writer never has
 * to think about, provider-independently (it lives at the manager
 * layer, like driveBookRun):
 *  - AUTO mode: a turn that wrote 2+ things without a steward gets ONE
 *    bounded follow-up invoke telling the supervisor to run the pass.
 *  - APPROVALS mode: prose only lands when the writer accepts, so the
 *    trigger is the acceptance report — 2+ accepted edits prepend the
 *    coherence instruction to the NEXT turn.
 * L3 (the deterministic PROJECT HEALTH brief line) backstops both.
 *
 * Pure module: the manager supplies real deps; unit tests script them.
 */

import type { AgentPermissionMode } from '../../../shared/types/langgraph'

/** Tool events that count as "the project changed". */
export const WRITE_TOOL_EVENT_NAMES = new Set([
  'propose_project_file_edit',
  'propose_text_edit',
  'propose_new_unit',
  'propose_new_file',
  'propose_bible_update',
  'restructure_unit',
  'update_unit_meta',
  'update_summary',
  'move_file',
  'create_folder',
  'delete_unit',
  'delete_file',
  'record_decision'
])

/** Activity that proves a steward-style pass already happened this turn. */
export const STEWARD_SIGNAL_TOOLS = new Set(['project_health'])

export interface TurnObservations {
  /** Labels of write-ish work observed (tool names / touched items). */
  writes: string[]
  /** True when a steward spawned or steward-signal tools ran. */
  stewardRan: boolean
}

export const emptyObservations = (): TurnObservations => ({
  writes: [],
  stewardRan: false
})

export const shouldEnforceCoherence = (
  observations: TurnObservations,
  mode: AgentPermissionMode
): boolean =>
  mode === 'auto' && observations.writes.length >= 2 && !observations.stewardRan

export const coherenceInstruction = (changed: string[]): string => {
  const scope =
    changed.length > 0
      ? `Scope it to exactly what this turn touched: ${[...new Set(changed)].slice(0, 12).join(', ')}.`
      : 'Scope it to what this turn touched.'
  return (
    '[COHERENCE PASS — automated harness enforcement, not the writer] This turn changed ' +
    `the project without a steward pass. Spawn ONE steward now. ${scope} ` +
    'It runs project_health, fixes metadata/summaries directly, proposes missing bible ' +
    'pages, and reports. Dispatch specialists only for real findings. Then STOP — do not ' +
    'start new work.'
  )
}

/**
 * Approvals-mode trigger: parse the EDIT REVIEW note the tracker drains
 * at turn start. 2+ ACCEPTED edits mean the manuscript just absorbed a
 * batch — the turn should OPEN with the coherence pass.
 */
export const acceptancePrepend = (reviewNote: string | null): string | null => {
  if (!reviewNote) return null
  const accepted = /ACCEPTED \(now in the manuscript\): (.+)/.exec(reviewNote)
  if (!accepted) return null
  // Count entries: "a.md (×2), b.md" → 3 accepted edits.
  let count = 0
  for (const part of accepted[1].split(',')) {
    const multi = /×(\d+)/.exec(part)
    count += multi ? Number(multi[1]) : 1
  }
  if (count < 2) return null
  return (
    '[COHERENCE PASS — automated harness enforcement, not the writer] The writer just ' +
    `accepted ${count} edits. BEFORE any new work, spawn one steward over the accepted ` +
    'files (see the review report above): project_health, metadata/summaries, bible ' +
    'coverage. Then continue with the writer\'s message.'
  )
}

export interface CoherencePassDeps {
  /** One bounded follow-up turn; returns the model's reply text. */
  invokeNext: (instruction: string) => Promise<string>
  emitStatus: (label: string, detail?: string) => void
}

/**
 * Run the auto-mode enforcement: at most ONE follow-up per writer turn.
 * Returns the follow-up reply text ('' when no enforcement happened).
 */
export const driveCoherencePass = async(
  observations: TurnObservations,
  mode: AgentPermissionMode,
  deps: CoherencePassDeps
): Promise<string> => {
  if (!shouldEnforceCoherence(observations, mode)) return ''
  deps.emitStatus(
    'Coherence pass',
    `${observations.writes.length} changes this turn — running the steward sweep`
  )
  return await deps.invokeNext(coherenceInstruction(observations.writes))
}
