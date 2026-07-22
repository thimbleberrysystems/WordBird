/**
 * FileCheckpointSaver — a MemorySaver that survives app restarts.
 *
 * LangGraph's MemorySaver keeps checkpoints in two nested plain objects
 * (`storage` and `writes`) whose leaf values are serde-serialized
 * Uint8Arrays. This subclass mirrors every mutation to a JSON file
 * (Uint8Array leaves base64-encoded), and rehydrates on construction —
 * giving Biscuit durable, resumable conversation/task threads without a
 * native-module database dependency.
 */

import fs from 'fs'
import log from 'electron-log'
import { MemorySaver } from '@langchain/langgraph'
import type {
  Checkpoint,
  CheckpointMetadata,
  PendingWrite
} from '@langchain/langgraph-checkpoint'
import type { RunnableConfig } from '@langchain/core/runnables'
import { writeFileDurableSync } from '../../filesystem/atomic'

const B64_TAG = '__wordbird_b64__'

type JsonValue = unknown

const encode = (value: JsonValue): JsonValue => {
  // ArrayBuffer.isView is realm-safe (a Uint8Array created by another
  // realm's TextEncoder fails `instanceof Uint8Array` here).
  if (ArrayBuffer.isView(value)) {
    const view = value as Uint8Array
    return {
      [B64_TAG]: Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('base64')
    }
  }
  if (Array.isArray(value)) return value.map(encode)
  if (value && typeof value === 'object') {
    const out: Record<string, JsonValue> = {}
    for (const [k, v] of Object.entries(value)) out[k] = encode(v)
    return out
  }
  return value
}

const decode = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object') {
    const record = value as Record<string, JsonValue>
    if (typeof record[B64_TAG] === 'string') {
      return new Uint8Array(Buffer.from(record[B64_TAG] as string, 'base64'))
    }
    const out: Record<string, JsonValue> = Object.create(null)
    for (const [k, v] of Object.entries(record)) out[k] = decode(v)
    return out
  }
  return value
}

/**
 * Checkpoints kept per thread. Every graph superstep checkpoints, so a
 * novel-length thread would otherwise grow checkpoints.json without bound
 * (tens of MB). Only the newest checkpoint is ever resumed (compaction
 * rewrites threads in place), so a short tail is all that's needed.
 */
const DEFAULT_KEEP_PER_THREAD = 20

export class FileCheckpointSaver extends MemorySaver {
  private _filePath: string
  private _persistTimer: NodeJS.Timeout | null = null
  private _keepPerThread: number

  constructor(filePath: string, keepPerThread = DEFAULT_KEEP_PER_THREAD) {
    super()
    this._filePath = filePath
    this._keepPerThread = Math.max(2, keepPerThread)
    this._load()
  }

  /**
   * Drop all but the newest N checkpoints for the given thread (checkpoint
   * ids are monotonic UUIDs — lexicographic order is chronological). Their
   * pending-writes entries go with them.
   */
  private _pruneThread(threadId: string): void {
    const self = this as unknown as {
      storage: Record<string, Record<string, Record<string, unknown>>>
      writes: Record<string, unknown>
    }
    const namespaces = self.storage[threadId]
    if (!namespaces) return
    for (const ns of Object.keys(namespaces)) {
      const checkpoints = namespaces[ns]
      const ids = Object.keys(checkpoints).sort()
      if (ids.length <= this._keepPerThread) continue
      const stale = ids.slice(0, ids.length - this._keepPerThread)
      for (const id of stale) {
        delete checkpoints[id]
        delete self.writes[JSON.stringify([threadId, ns, id])]
      }
    }
  }

  private _load(): void {
    try {
      if (!fs.existsSync(this._filePath)) return
      const raw = JSON.parse(fs.readFileSync(this._filePath, 'utf8'))
      if (raw && typeof raw === 'object') {
        // Rebuild with null prototypes, matching MemorySaver's internals.
        const self = this as unknown as {
          storage: Record<string, unknown>
          writes: Record<string, unknown>
        }
        self.storage = decode(raw.storage ?? {}) as Record<string, unknown>
        self.writes = decode(raw.writes ?? {}) as Record<string, unknown>
      }
    } catch (error) {
      log.warn('[checkpoint] Failed to load checkpoint store, starting fresh:', error)
    }
  }

  /** Debounced write-behind so bursts of checkpoints hit disk once. */
  private _schedulePersist(): void {
    if (this._persistTimer) return
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null
      this._persistNow()
    }, 250)
  }

  private _persistNow(): void {
    try {
      const self = this as unknown as { storage: unknown; writes: unknown }
      const payload = JSON.stringify({
        version: 1,
        storage: encode(self.storage),
        writes: encode(self.writes)
      })
      // Was a hand-rolled temp+rename: crash-safe, but with no fsync a power
      // loss could still leave the checkpoint store zero-filled.
      writeFileDurableSync(this._filePath, payload)
    } catch (error) {
      log.error('[checkpoint] Failed to persist checkpoint store:', error)
    }
  }

  /** Flush any pending write immediately (call on app quit). */
  flush(): void {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer)
      this._persistTimer = null
    }
    this._persistNow()
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const result = await super.put(config, checkpoint, metadata)
    const threadId = config.configurable?.thread_id
    if (typeof threadId === 'string' && threadId) this._pruneThread(threadId)
    this._schedulePersist()
    return result
  }

  override async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    await super.putWrites(config, writes, taskId)
    this._schedulePersist()
  }

  override async deleteThread(threadId: string): Promise<void> {
    await super.deleteThread(threadId)
    this._schedulePersist()
  }

  /** True when the given thread already has at least one checkpoint. */
  async hasThread(threadId: string): Promise<boolean> {
    const tuple = await this.getTuple({ configurable: { thread_id: threadId } })
    return !!tuple
  }
}
