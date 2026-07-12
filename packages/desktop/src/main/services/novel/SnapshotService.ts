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

// Coalescing kicks in this many snapshots past the limit, so the history
// is not rewritten on every single save once the limit is reached.
const COALESCE_SLACK = 50

export class SnapshotService {
  // 0 = unlimited (keep every snapshot forever). Set from preferences.
  private _historyLimit = 1000

  setHistoryLimit(limit: number): void {
    this._historyLimit = Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 1000
  }

  get historyLimit(): number {
    return this._historyLimit
  }

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

    try {
      await this._maybeCoalesce(dir)
    } catch (error) {
      // History compaction is hygiene — never let it break a snapshot.
      log.warn('[snapshot] coalesce skipped:', error)
    }
    return oid
  }

  /**
   * Bounded history: when the snapshot count exceeds the configured limit
   * (plus slack, so we do not rewrite on every save), squash everything
   * older than the newest `limit` snapshots into a single baseline commit,
   * rebuild the chain on top of it, and prune the now-unreachable objects
   * so the space is actually reclaimed. limit 0 = unlimited, never touch.
   */
  private async _maybeCoalesce(dir: string): Promise<void> {
    const limit = this._historyLimit
    if (limit <= 0) return

    // Cheap exceed check before reading full history.
    const probe = await git.log({ fs, dir, depth: limit + COALESCE_SLACK + 1 })
    if (probe.length <= limit + COALESCE_SLACK) return
    await this.coalesce(dir, limit)
  }

  /** Squash all snapshots older than the newest `keep` into one baseline. */
  async coalesce(dir: string, keep: number): Promise<{ squashed: number } | null> {
    await this._ensureRepo(dir)
    const commits = await git.log({ fs, dir }) // newest → oldest
    if (keep < 1 || commits.length <= keep) return null

    const kept = commits.slice(0, keep) // newest → oldest
    const squashed = commits.length - keep
    // Baseline content = the newest SQUASHED snapshot's exact tree, so every
    // kept snapshot stays a distinct rewind point and nothing the writer can
    // still see loses granularity.
    const newestSquashed = commits[keep]

    const now = Math.floor(Date.now() / 1000)
    const stamp = {
      ...AUTHOR,
      timestamp: newestSquashed.commit.author.timestamp ?? now,
      timezoneOffset: 0
    }
    let head = await git.writeCommit({
      fs,
      dir,
      commit: {
        message: `${AUTO_PREFIX}Coalesced ${squashed} earlier snapshots\n`,
        tree: newestSquashed.commit.tree,
        parent: [],
        author: stamp,
        committer: stamp
      }
    })

    // Replay every kept snapshot (oldest → newest) onto the baseline,
    // preserving their trees, messages, and timestamps.
    for (let i = kept.length - 1; i >= 0; i--) {
      const entry = kept[i]
      head = await git.writeCommit({
        fs,
        dir,
        commit: {
          message: entry.commit.message,
          tree: entry.commit.tree,
          parent: [head],
          author: entry.commit.author,
          committer: entry.commit.committer
        }
      })
    }

    const branch =
      (await git.currentBranch({ fs, dir, fullname: true })) ?? 'refs/heads/master'
    await git.writeRef({ fs, dir, ref: branch, value: head, force: true })

    await this._pruneUnreachable(dir, head)
    log.info(`[snapshot] Coalesced ${squashed} snapshots into a baseline (kept ${keep})`)
    return { squashed }
  }

  /** Delete loose objects not reachable from `head` to reclaim space. */
  private async _pruneUnreachable(dir: string, head: string): Promise<void> {
    const reachable = new Set<string>()

    const walkTree = async(oid: string): Promise<void> => {
      if (reachable.has(oid)) return
      reachable.add(oid)
      const { tree } = await git.readTree({ fs, dir, oid })
      for (const entry of tree) {
        if (entry.type === 'tree') {
          await walkTree(entry.oid)
        } else {
          reachable.add(entry.oid)
        }
      }
    }

    let cursor: string | undefined = head
    while (cursor && !reachable.has(cursor)) {
      reachable.add(cursor)
      const { commit } = await git.readCommit({ fs, dir, oid: cursor })
      await walkTree(commit.tree)
      cursor = commit.parent[0]
    }

    const objectsDir = path.join(dir, '.git', 'objects')
    let removed = 0
    for (const shard of fs.readdirSync(objectsDir)) {
      if (shard.length !== 2) continue // skip info/ and pack/
      const shardDir = path.join(objectsDir, shard)
      for (const name of fs.readdirSync(shardDir)) {
        if (!reachable.has(shard + name)) {
          try {
            fs.unlinkSync(path.join(shardDir, name))
            removed += 1
          } catch {
            // Locked or already gone — space reclaim is best-effort.
          }
        }
      }
    }
    if (removed > 0) log.info(`[snapshot] Pruned ${removed} unreachable objects`)
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
