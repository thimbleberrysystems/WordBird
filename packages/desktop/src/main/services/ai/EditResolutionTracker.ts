/**
 * EditResolutionTracker — closes the acceptance feedback loop.
 *
 * Every edit proposal Biscuit emits lands here alongside the review queue in
 * the renderer. When the writer accepts or rejects an edit, the resolution
 * flows back (mt::ai:edit-resolved) and three things become possible:
 *  - the NEXT model turn opens with a review-outcome note, so the AI knows
 *    what actually landed in the manuscript (and what was declined),
 *  - the project brief can show recent review outcomes + edits still waiting,
 *  - the pending queue survives an app restart (rehydrated into the renderer).
 *
 * State is one JSON file under `.wordbird/agent-state/` (excluded from
 * snapshots, like the rest of agent state). Writes are debounced; `flush()`
 * runs on quit alongside checkpoint flushing.
 */

import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import type {
  IAgentEditProposalPayload,
  IAgentEditResolution
} from '../../../shared/types/langgraph'
import { writeFileDurableSync } from '../../filesystem/atomic'

interface PendingEntry {
  payload: IAgentEditProposalPayload
  threadId: string | null
  at: number
  /** Project root active when the proposal was recorded — the apply gate
   * refuses to write a proposal into a DIFFERENT project. */
  projectRoot?: string | null
}

export interface ResolvedEntry {
  id: string
  filePath: string
  accepted: boolean
  at: number
  /** Already surfaced to the model in a turn note. */
  reported: boolean
}

interface TrackerFileState {
  pending: PendingEntry[]
  resolutions: ResolvedEntry[]
}

const FILE_NAME = 'pending-edits.json'
const MAX_RESOLUTIONS = 50
const WRITE_DEBOUNCE_MS = 200

export class EditResolutionTracker {
  private _pending: PendingEntry[] = []
  private _resolutions: ResolvedEntry[] = []
  private _loadedFrom: string | null = null
  private _writeTimer: NodeJS.Timeout | null = null

  constructor(private readonly _dirProvider: () => string) {}

  private _filePath(): string {
    return path.join(this._dirProvider(), FILE_NAME)
  }

  /** Lazily (re)load when the backing file moves with the active project. */
  private _ensureLoaded(): void {
    const file = this._filePath()
    if (this._loadedFrom === file) return
    this._loadedFrom = file
    this._pending = []
    this._resolutions = []
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<TrackerFileState>
      if (Array.isArray(raw.pending)) this._pending = raw.pending as PendingEntry[]
      if (Array.isArray(raw.resolutions)) this._resolutions = raw.resolutions as ResolvedEntry[]
    } catch {
      // Missing/corrupt state file — start clean.
    }
  }

  private _scheduleWrite(): void {
    if (this._writeTimer) clearTimeout(this._writeTimer)
    this._writeTimer = setTimeout(() => {
      this._writeTimer = null
      this.flush()
    }, WRITE_DEBOUNCE_MS)
  }

  flush(): void {
    if (this._writeTimer) {
      clearTimeout(this._writeTimer)
      this._writeTimer = null
    }
    if (this._loadedFrom === null) return
    try {
      fs.mkdirSync(path.dirname(this._filePath()), { recursive: true })
      const state: TrackerFileState = {
        pending: this._pending,
        resolutions: this._resolutions.slice(-MAX_RESOLUTIONS)
      }
      writeFileDurableSync(this._filePath(), JSON.stringify(state))
    } catch (error) {
      log.warn('[EditResolutionTracker] Failed to persist state:', error)
    }
  }

  recordProposal(
    payload: IAgentEditProposalPayload,
    threadId: string | null,
    projectRoot?: string | null
  ): void {
    this._ensureLoaded()
    // Re-emitted proposal ids replace their earlier entry.
    this._pending = this._pending.filter((p) => p.payload.edit.id !== payload.edit.id)
    this._pending.push({ payload, threadId, at: Date.now(), projectRoot: projectRoot ?? null })
    this._scheduleWrite()
  }

  /** The still-pending proposal behind an apply request, or null. */
  getPending(
    id: string
  ): { payload: IAgentEditProposalPayload; projectRoot: string | null } | null {
    this._ensureLoaded()
    const entry = this._pending.find((p) => p.payload.edit.id === id)
    if (!entry) return null
    return { payload: entry.payload, projectRoot: entry.projectRoot ?? null }
  }

  resolve(resolution: IAgentEditResolution): void {
    this._ensureLoaded()
    this._pending = this._pending.filter((p) => p.payload.edit.id !== resolution.id)
    this._resolutions.push({
      id: resolution.id,
      filePath: resolution.filePath,
      accepted: resolution.accepted,
      at: Date.now(),
      reported: false
    })
    if (this._resolutions.length > MAX_RESOLUTIONS) {
      this._resolutions = this._resolutions.slice(-MAX_RESOLUTIONS)
    }
    this._scheduleWrite()
  }

  /** Proposals still awaiting review for the given thread (renderer rehydration). */
  pendingForThread(threadId: string | null): IAgentEditProposalPayload[] {
    this._ensureLoaded()
    return this._pending
      .filter((p) => !threadId || p.threadId === threadId)
      .map((p) => p.payload)
  }

  pendingCount(): number {
    this._ensureLoaded()
    return this._pending.length
  }

  /** Conversation switched / reset — stale proposals must not leak across. */
  clearPending(): void {
    this._ensureLoaded()
    this._pending = []
    this._scheduleWrite()
  }

  /**
   * Render the review-outcome note for the next model turn and mark those
   * resolutions reported. Returns null when there is nothing new to report.
   */
  drainNote(): string | null {
    this._ensureLoaded()
    const fresh = this._resolutions.filter((r) => !r.reported)
    if (fresh.length === 0) return null
    for (const r of fresh) r.reported = true
    this._scheduleWrite()

    const name = (p: string): string => p.split(/[\\/]/).pop() || p
    const summarize = (list: ResolvedEntry[]): string => {
      const byFile = new Map<string, number>()
      for (const r of list) byFile.set(name(r.filePath), (byFile.get(name(r.filePath)) ?? 0) + 1)
      return [...byFile.entries()]
        .map(([file, count]) => (count > 1 ? `${file} (×${count})` : file))
        .join(', ')
    }

    const accepted = fresh.filter((r) => r.accepted)
    const rejected = fresh.filter((r) => !r.accepted)
    const lines = ['[EDIT REVIEW — automated report of the writer\'s decisions]']
    if (accepted.length > 0) {
      lines.push(`ACCEPTED (now in the manuscript): ${summarize(accepted)}`)
    }
    if (rejected.length > 0) {
      lines.push(
        'REJECTED (NOT applied — do not assume this content exists, and do not silently ' +
        `re-propose it): ${summarize(rejected)}`
      )
    }
    return lines.join('\n')
  }

  /** Compact recent-outcomes line for the project brief ('' when quiet). */
  briefSummary(): string {
    this._ensureLoaded()
    const parts: string[] = []
    const recent = this._resolutions.slice(-10)
    const accepted = recent.filter((r) => r.accepted).length
    const rejected = recent.filter((r) => !r.accepted).length
    if (accepted > 0 || rejected > 0) {
      parts.push(`recently ${accepted} accepted / ${rejected} rejected`)
    }
    if (this._pending.length > 0) {
      parts.push(
        `${this._pending.length} edit${this._pending.length === 1 ? '' : 's'} still awaiting ` +
        'the writer\'s review — do NOT assume they are applied'
      )
    }
    return parts.join(' · ')
  }
}
