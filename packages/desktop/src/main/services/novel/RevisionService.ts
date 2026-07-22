/**
 * RevisionService — durable state for sweeping, book-wide revisions
 * ("Marcus no longer exists", "move the war ten years earlier").
 *
 * A revision is: the author's DIRECTIVE (their guidance — who inherits
 * plot functions, delete-vs-rewrite policy, aliases to hunt), an IMPACT
 * MAP (per-unit classification + plan, built by explorer agents and
 * approved by the writer before any edit), and per-unit progress. It
 * lives in `.wordbird/revisions/<id>/` so a revision spanning more units
 * than any single turn's agent budget resumes cleanly across turns and
 * app restarts.
 */

import path from 'path'
import fsPromises from 'fs/promises'
import crypto from 'crypto'
import { snapshotService } from './SnapshotService'
import type {
  IRevision,
  IRevisionImpactEntry,
  RevisionUnitStatus
} from '../../../shared/types/novel'
import { writeFileDurable } from '../../filesystem/atomic'

const revisionsDir = (root: string): string => path.join(root, '.wordbird', 'revisions')
const revisionDir = (root: string, id: string): string => path.join(revisionsDir(root), id)
const metaPath = (root: string, id: string): string =>
  path.join(revisionDir(root, id), 'revision.json')
const directivePath = (root: string, id: string): string =>
  path.join(revisionDir(root, id), 'directive.md')

export class RevisionService {
  async create(root: string, title: string, directive: string): Promise<IRevision> {
    const id = `rev-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    const revision: IRevision = {
      id,
      title,
      status: 'analyzing',
      createdAt: new Date().toISOString(),
      entries: []
    }
    await fsPromises.mkdir(revisionDir(root, id), { recursive: true })
    await writeFileDurable(directivePath(root, id), directive)
    await this._save(root, revision)
    // The whole point of a revision is that it can be undone.
    await snapshotService.snapshot(root, `Before revision: ${title}`, true)
    return revision
  }

  private async _save(root: string, revision: IRevision): Promise<void> {
    await writeFileDurable(metaPath(root, revision.id), JSON.stringify(revision, null, 2))
  }

  async get(root: string, id: string): Promise<{ revision: IRevision; directive: string } | null> {
    try {
      const revision = JSON.parse(
        await fsPromises.readFile(metaPath(root, id), 'utf8')
      ) as IRevision
      let directive = ''
      try {
        directive = await fsPromises.readFile(directivePath(root, id), 'utf8')
      } catch {
        // Directive missing — keep going with metadata only.
      }
      return { revision, directive }
    } catch {
      return null
    }
  }

  async list(root: string): Promise<IRevision[]> {
    let ids: string[]
    try {
      ids = (await fsPromises.readdir(revisionsDir(root), { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      return []
    }
    const revisions: IRevision[] = []
    for (const id of ids.sort()) {
      const loaded = await this.get(root, id)
      if (loaded) revisions.push(loaded.revision)
    }
    return revisions
  }

  /** Revisions still in flight (drives the ACTIVE REVISION brief section). */
  async listActive(root: string): Promise<IRevision[]> {
    return (await this.list(root)).filter(
      (r) => r.status === 'analyzing' || r.status === 'executing'
    )
  }

  /**
   * Merge impact-map entries by unitId: existing entries are updated
   * (classification/evidence/plan refreshed, progress preserved unless
   * re-classified), new ones appended as pending.
   */
  async updateImpactMap(
    root: string,
    id: string,
    entries: Array<Omit<IRevisionImpactEntry, 'status' | 'note'>>
  ): Promise<IRevision> {
    const loaded = await this.get(root, id)
    if (!loaded) throw new Error(`No revision with id ${id}.`)
    const { revision } = loaded
    if (revision.status === 'completed' || revision.status === 'abandoned') {
      throw new Error(`Revision ${id} is ${revision.status} — start a new one.`)
    }

    for (const entry of entries) {
      const existing = revision.entries.find((e) => e.unitId === entry.unitId)
      if (existing) {
        existing.path = entry.path
        existing.classification = entry.classification
        existing.evidence = entry.evidence
        existing.plan = entry.plan
      } else {
        revision.entries.push({ ...entry, status: 'pending' })
      }
    }
    await this._save(root, revision)
    return revision
  }

  async markUnit(
    root: string,
    id: string,
    unitId: string,
    status: RevisionUnitStatus,
    note?: string
  ): Promise<IRevision> {
    const loaded = await this.get(root, id)
    if (!loaded) throw new Error(`No revision with id ${id}.`)
    const { revision } = loaded
    const entry = revision.entries.find((e) => e.unitId === unitId)
    if (!entry) throw new Error(`Unit ${unitId} is not in revision ${id}'s impact map.`)
    entry.status = status
    if (note) entry.note = note
    // First unit worked on moves the revision from analysis to execution.
    if (revision.status === 'analyzing' && (status === 'done' || status === 'skipped')) {
      revision.status = 'executing'
    }
    await this._save(root, revision)
    return revision
  }

  async complete(
    root: string,
    id: string,
    report: string,
    abandoned = false
  ): Promise<IRevision> {
    const loaded = await this.get(root, id)
    if (!loaded) throw new Error(`No revision with id ${id}.`)
    const { revision } = loaded
    revision.status = abandoned ? 'abandoned' : 'completed'
    revision.completedAt = new Date().toISOString()
    revision.report = report
    await this._save(root, revision)
    return revision
  }

  static progress(revision: IRevision): { done: number; total: number; pending: string[] } {
    const done = revision.entries.filter(
      (e) => e.status === 'done' || e.status === 'skipped'
    ).length
    return {
      done,
      total: revision.entries.length,
      pending: revision.entries.filter((e) => e.status === 'pending').map((e) => e.unitId)
    }
  }
}

export const revisionService = new RevisionService()
