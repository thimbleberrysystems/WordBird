/**
 * Mechanical coherence enforcement (L2 of the overseeing layer).
 *
 * Doctrine (L1) asks the supervisor to end multi-write turns with a
 * steward pass; this module makes it a GUARANTEE the writer never has
 * to think about, provider-independently:
 *  - Writes are observed at the ONE choke point every provider's tools
 *    share (AgentToolService.runForModel/execute via the manager's
 *    observer) — LangGraph workers, SDK Task subagents, renderer calls.
 *  - AUTO mode: a turn that wrote 2+ things SINCE THE LAST steward pass
 *    gets ONE bounded follow-up invoke telling the supervisor to run it.
 *    The mark is order-aware: an early steward in a long book run does
 *    not excuse eight scenes written after it.
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

/**
 * The steward's own repair actions. After a steward mark, these must not
 * re-arm enforcement — a steward fixing five metadata gaps is the CURE,
 * not five new changes.
 */
export const STEWARD_FIX_TOOLS = new Set([
  'update_unit_meta',
  'update_summary',
  'propose_bible_update',
  'propose_new_file',
  'record_fact'
])

export interface TurnObservations {
  /** Every write observed this turn, in order (tool + short label). */
  writes: Array<{ tool: string; label: string }>
  /**
   * writes.length at the moment the last steward pass COMPLETED
   * (null = no steward ran this turn).
   */
  stewardMark: number | null
}

export const emptyObservations = (): TurnObservations => ({
  writes: [],
  stewardMark: null
})

export const observeWrite = (
  observations: TurnObservations,
  tool: string,
  label: string
): void => {
  observations.writes.push({ tool, label })
}

export const markSteward = (observations: TurnObservations): void => {
  observations.stewardMark = observations.writes.length
}

/**
 * Writes still owing a coherence pass: everything after the last steward
 * mark, minus the steward's own repair tools once a mark exists.
 */
export const writesSinceSteward = (
  observations: TurnObservations
): Array<{ tool: string; label: string }> => {
  if (observations.stewardMark === null) return [...observations.writes]
  return observations.writes
    .slice(observations.stewardMark)
    .filter((write) => !STEWARD_FIX_TOOLS.has(write.tool))
}

export const shouldEnforceCoherence = (
  observations: TurnObservations,
  mode: AgentPermissionMode
): boolean => mode === 'auto' && writesSinceSteward(observations).length >= 2

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
  const pending = writesSinceSteward(observations)
  deps.emitStatus(
    'Coherence pass',
    `${pending.length} change${pending.length === 1 ? '' : 's'} since the last steward pass — running the sweep`
  )
  return await deps.invokeNext(coherenceInstruction(pending.map((write) => write.label)))
}
