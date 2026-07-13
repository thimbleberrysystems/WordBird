/**
 * IPC surface for the novel structure manifest (`mt::novel:*`).
 *
 * Every handler validates that the supplied root is a real WordBird
 * project (contains `.wordbird/project.json`) before touching disk, so a
 * compromised renderer cannot use these channels as arbitrary fs access.
 */

import { ipcMain } from 'electron'
import path from 'path'
import log from 'electron-log'
import { isValidProjectPath } from '../filesystem/markdown'
import {
  structureService,
  totalWords,
  updateDailyWordStats,
  readDailyWordHistory
} from '../services/novel/StructureService'
import { snapshotService } from '../services/novel/SnapshotService'
import { continuityService } from '../services/novel/ContinuityService'
import { revisionService } from '../services/novel/RevisionService'
import type {
  INovelStructure,
  INovelCreateUnitPayload,
  INovelUnitUpdate,
  INovelCompileOptions,
  INovelStructureResult,
  INovelCompileResult,
  ISnapshotListResult,
  ISnapshotActionResult,
  IContinuityListResult,
  IRevisionListResult,
  ProjectFlavor
} from '../../shared/types/novel'

const guardRoot = (root: string): string | null => {
  if (typeof root !== 'string' || !root) return null
  const normalized = path.resolve(root)
  return isValidProjectPath(normalized) ? normalized : null
}

const fail = (error: string): INovelStructureResult => ({ ok: false, error })

const withStructure = async(
  root: string,
  action: (root: string, structure: INovelStructure) => Promise<void>
): Promise<INovelStructureResult> => {
  const safeRoot = guardRoot(root)
  if (!safeRoot) return fail('Not a valid WordBird project')
  try {
    const structure = await structureService.loadReconciled(safeRoot)
    await action(safeRoot, structure)
    const todayStart = await updateDailyWordStats(safeRoot, totalWords(structure.units))
    return { ok: true, structure, todayStart }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('[novel] IPC action failed:', error)
    return fail(message)
  }
}

export const registerNovelHandlers = (): void => {
  ipcMain.handle(
    'mt::novel:get-structure',
    async(_e, root: string): Promise<INovelStructureResult> => {
      return withStructure(root, async() => {})
    }
  )

  ipcMain.handle(
    'mt::novel:init-structure',
    async(_e, root: string, flavor: ProjectFlavor): Promise<INovelStructureResult> => {
      const safeRoot = guardRoot(root)
      if (!safeRoot) return fail('Not a valid WordBird project')
      try {
        const structure = await structureService.scan(safeRoot, flavor)
        await structureService.save(safeRoot, structure)
        return { ok: true, structure }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('[novel] init-structure failed:', error)
        return fail(message)
      }
    }
  )

  ipcMain.handle(
    'mt::novel:create-unit',
    async(_e, root: string, payload: INovelCreateUnitPayload): Promise<INovelStructureResult> => {
      return withStructure(root, async(safeRoot, structure) => {
        await structureService.createUnit(safeRoot, structure, payload)
      })
    }
  )

  ipcMain.handle(
    'mt::novel:update-unit',
    async(
      _e,
      root: string,
      unitId: string,
      update: INovelUnitUpdate
    ): Promise<INovelStructureResult> => {
      return withStructure(root, async(safeRoot, structure) => {
        await structureService.updateUnit(safeRoot, structure, unitId, update)
      })
    }
  )

  ipcMain.handle(
    'mt::novel:move-unit',
    async(
      _e,
      root: string,
      unitId: string,
      newParentId: string | null,
      index: number
    ): Promise<INovelStructureResult> => {
      return withStructure(root, async(safeRoot, structure) => {
        await structureService.moveUnit(safeRoot, structure, unitId, newParentId, index)
      })
    }
  )

  ipcMain.handle(
    'mt::novel:delete-unit',
    async(
      _e,
      root: string,
      unitId: string,
      deleteFiles: boolean
    ): Promise<INovelStructureResult> => {
      return withStructure(root, async(safeRoot, structure) => {
        await structureService.deleteUnit(safeRoot, structure, unitId, deleteFiles)
      })
    }
  )

  ipcMain.handle(
    'mt::novel:snapshot',
    async(_e, root: string, message: string): Promise<ISnapshotActionResult> => {
      const safeRoot = guardRoot(root)
      if (!safeRoot) return { ok: false, error: 'Not a valid WordBird project' }
      try {
        const id = await snapshotService.snapshot(safeRoot, message)
        return { ok: true, id: id ?? undefined }
      } catch (error) {
        const message_ = error instanceof Error ? error.message : String(error)
        log.error('[novel] snapshot failed:', error)
        return { ok: false, error: message_ }
      }
    }
  )

  ipcMain.handle(
    'mt::novel:snapshots',
    async(_e, root: string, limit?: number): Promise<ISnapshotListResult> => {
      const safeRoot = guardRoot(root)
      if (!safeRoot) return { ok: false, error: 'Not a valid WordBird project' }
      try {
        const snapshots = await snapshotService.list(safeRoot, limit)
        return { ok: true, snapshots }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('[novel] snapshots list failed:', error)
        return { ok: false, error: message }
      }
    }
  )

  ipcMain.handle(
    'mt::novel:restore-snapshot',
    async(_e, root: string, snapshotId: string): Promise<ISnapshotActionResult> => {
      const safeRoot = guardRoot(root)
      if (!safeRoot) return { ok: false, error: 'Not a valid WordBird project' }
      try {
        const id = await snapshotService.restore(safeRoot, snapshotId)
        // The next agent turn must know the ground shifted under it.
        const { contextBuilder } = await import('../services/ai/ContextBuilder')
        contextBuilder.recordProjectEvent(
          safeRoot,
          `The writer REWOUND the project to snapshot ${snapshotId.slice(0, 8)} from the ` +
          'History panel — all remembered file contents are stale.'
        )
        return { ok: true, id: id ?? undefined }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('[novel] restore-snapshot failed:', error)
        return { ok: false, error: message }
      }
    }
  )

  ipcMain.handle(
    'mt::novel:list-revisions',
    async(_e, root: string): Promise<IRevisionListResult> => {
      const safeRoot = guardRoot(root)
      if (!safeRoot) return { ok: false, error: 'Not a valid WordBird project' }
      try {
        return { ok: true, revisions: await revisionService.list(safeRoot) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, error: message }
      }
    }
  )

  ipcMain.handle(
    'mt::novel:continuity-issues',
    async(_e, root: string): Promise<IContinuityListResult> => {
      const safeRoot = guardRoot(root)
      if (!safeRoot) return { ok: false, error: 'Not a valid WordBird project' }
      try {
        return { ok: true, issues: await continuityService.list(safeRoot) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, error: message }
      }
    }
  )

  ipcMain.handle(
    'mt::novel:resolve-issue',
    async(_e, root: string, issueId: string): Promise<{ ok: boolean; error?: string }> => {
      const safeRoot = guardRoot(root)
      if (!safeRoot) return { ok: false, error: 'Not a valid WordBird project' }
      try {
        const resolved = await continuityService.resolve(safeRoot, issueId)
        return resolved ? { ok: true } : { ok: false, error: 'Issue not found' }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, error: message }
      }
    }
  )

  // Written-per-day history for the binder's analytics sparkline.
  ipcMain.handle(
    'mt::novel:word-stats',
    async(_e, root: string): Promise<Array<{ date: string; written: number }>> => {
      const safeRoot = guardRoot(root)
      if (!safeRoot) return []
      try {
        return await readDailyWordHistory(safeRoot)
      } catch {
        return []
      }
    }
  )

  // The deterministic entity index behind the Entities sidebar view.
  ipcMain.handle('mt::novel:entity-index', async(_e, root: string) => {
    const safeRoot = guardRoot(root)
    if (!safeRoot) return { builtAt: 0, signature: '', entities: [] }
    try {
      const { getEntityIndex } = await import('../services/novel/EntityIndex')
      return await getEntityIndex(safeRoot)
    } catch (error) {
      log.error('[novel] entity index failed:', error)
      return { builtAt: 0, signature: '', entities: [] }
    }
  })

  ipcMain.handle(
    'mt::novel:compile',
    async(_e, root: string, options?: INovelCompileOptions): Promise<INovelCompileResult> => {
      const safeRoot = guardRoot(root)
      if (!safeRoot) return { ok: false, error: 'Not a valid WordBird project' }
      try {
        const structure = await structureService.loadReconciled(safeRoot)
        // Only allow writing compile output inside the project.
        let outputPath = options?.outputPath
        if (outputPath) {
          const resolved = path.resolve(outputPath)
          const rel = path.relative(safeRoot, resolved)
          if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
            outputPath = path.join(safeRoot, 'exports', path.basename(resolved))
          } else {
            outputPath = resolved
          }
        }
        return await structureService.compile(safeRoot, structure, { ...options, outputPath })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('[novel] compile failed:', error)
        return { ok: false, error: message }
      }
    }
  )
}
