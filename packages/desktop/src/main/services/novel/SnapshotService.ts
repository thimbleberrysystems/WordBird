/**
 * SnapshotService — the "mini inbuilt git" behind History/Rewind.
 *
 * Every snapshot is a git commit over the whole project (prose + bible +
 * manifest together, so rewinding restores text and canon coherently),
 * built on isomorphic-git — the same library project creation already
 * uses for `git.init`. The UI never shows git vocabulary; this service
 * speaks in snapshots: take, list, restore.
 *
 * Restore is non-destructive: files from the target snapshot are written
 * into the working tree (HEAD does not move), then committed as a NEW
 * snapshot — history stays linear and nothing is ever lost.
 */

import path from 'path'
import fs from 'fs'
import * as git from 'isomorphic-git'
import log from 'electron-log'
import type { ISnapshotInfo } from '../../../shared/types/novel'

const AUTO_PREFIX = '[auto] '

const AUTHOR = { name: 'WordBird', email: 'wordbird@local' }

export class SnapshotService {
  private async _ensureRepo(dir: string): Promise<void> {
    if (!fs.existsSync(path.join(dir, '.git'))) {
      await git.init({ fs, dir })
    }
  }

  /** Stage every change (adds, edits, deletions). Returns true if anything changed. */
  private async _stageAll(dir: string): Promise<boolean> {
    const matrix = await git.statusMatrix({ fs, dir })
    let changed = false
    for (const [filepath, head, workdir, stage] of matrix) {
      if (head === 1 && workdir === 1 && stage === 1) continue // unmodified
      changed = true
      if (workdir === 0) {
        await git.remove({ fs, dir, filepath })
      } else {
        await git.add({ fs, dir, filepath })
      }
    }
    return changed
  }

  /**
   * Take a snapshot. Returns the snapshot id, or null when there was
   * nothing to record (clean working tree).
   */
  async snapshot(dir: string, message: string, auto = false): Promise<string | null> {
    await this._ensureRepo(dir)
    const changed = await this._stageAll(dir)
    if (!changed) return null

    const oid = await git.commit({
      fs,
      dir,
      message: `${auto ? AUTO_PREFIX : ''}${message || 'Snapshot'}`,
      author: AUTHOR
    })
    log.info(`[snapshot] Recorded ${oid.slice(0, 8)}: ${message}`)
    return oid
  }

  async list(dir: string, limit = 100): Promise<ISnapshotInfo[]> {
    await this._ensureRepo(dir)
    try {
      const commits = await git.log({ fs, dir, depth: limit })
      return commits.map((entry) => {
        const raw = entry.commit.message.trim()
        const auto = raw.startsWith(AUTO_PREFIX)
        return {
          id: entry.oid,
          message: auto ? raw.slice(AUTO_PREFIX.length) : raw,
          timestamp: entry.commit.author.timestamp * 1000,
          auto
        }
      })
    } catch {
      // Empty repository (no commits yet).
      return []
    }
  }

  /**
   * Rewind the project to a snapshot. Writes that snapshot's files into
   * the working tree without moving HEAD, then records the result as a
   * new snapshot so the rewind itself can be undone.
   */
  async restore(dir: string, snapshotId: string): Promise<string | null> {
    await this._ensureRepo(dir)

    const target = (await this.list(dir, 500)).find((s) => s.id === snapshotId)
    if (!target) {
      throw new Error(`Snapshot not found: ${snapshotId}`)
    }

    // Preserve any un-snapshotted work first so nothing is lost.
    await this.snapshot(dir, 'Before rewind', true)

    await git.checkout({
      fs,
      dir,
      ref: snapshotId,
      force: true,
      noUpdateHead: true
    })

    return this.snapshot(dir, `Rewound to "${target.message}"`)
  }
}

export const snapshotService = new SnapshotService()
