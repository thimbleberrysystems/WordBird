/**
 * Novel store — renderer-side view of the structure manifest
 * (`.wordbird/structure.json`) behind the binder, plus compile.
 *
 * All mutations round-trip through main (window.electron.novel), which
 * returns the updated structure; the store never mutates the tree locally.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '../i18n'
import { useProjectStore } from './project'
import { useEditorStore } from './editor'
import type {
  INovelStructure,
  INovelUnit,
  INovelCreateUnitPayload,
  INovelUnitUpdate,
  INovelCompileResult
} from '@shared/types/novel'

export type NovelViewMode = 'page' | 'corkboard' | 'outline' | 'timeline'

export const useNovelStore = defineStore('novel', () => {
  const structure = ref<INovelStructure | null>(null)
  /** Manuscript total at today's first load — "written today" baseline. */
  const todayStart = ref<number | null>(null)
  const loading = ref(false)
  const lastError = ref<string | null>(null)
  /** Editor-area view: the prose page, the corkboard, or the outline table. */
  const viewMode = ref<NovelViewMode>('page')

  const projectStore = useProjectStore()

  const root = computed(() => projectStore.currentProjectPath)

  const flavor = computed(() => structure.value?.flavor ?? null)

  const totalWordCount = computed(() => {
    let total = 0
    const walk = (units: INovelUnit[]): void => {
      for (const unit of units) {
        if (unit.children) walk(unit.children)
        else if (unit.wordCount) total += unit.wordCount
      }
    }
    if (structure.value) walk(structure.value.units)
    return total
  })

  const applyResult = (result: {
    ok: boolean
    structure?: INovelStructure
    todayStart?: number
    error?: string
  }): boolean => {
    if (result.ok && result.structure) {
      structure.value = result.structure
      if (typeof result.todayStart === 'number') todayStart.value = result.todayStart
      lastError.value = null
      return true
    }
    lastError.value = result.error ?? 'Unknown error'
    return false
  }

  async function refresh(): Promise<void> {
    if (!root.value) {
      structure.value = null
      return
    }
    loading.value = true
    try {
      applyResult(await window.electron.novel.getStructure(root.value))
    } finally {
      loading.value = false
    }
  }

  /**
   * Every structure mutation flows through here: a rejection or a non-ok
   * result surfaces as a toast (never a silent dead-end), and after an
   * exception the tree is re-read so optimistic view state reverts to the
   * on-disk truth. Binder, corkboard, outline, and timeline all inherit
   * this handling for free.
   */
  const mutate = async(
    run: () => Promise<{
      ok: boolean
      structure?: INovelStructure
      todayStart?: number
      error?: string
    }>
  ): Promise<boolean> => {
    try {
      const ok = applyResult(await run())
      if (!ok) {
        ElMessage.error(t('binder.actionFailed', { error: lastError.value ?? '' }))
      }
      return ok
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      ElMessage.error(t('binder.actionFailed', { error: lastError.value }))
      await refresh()
      return false
    }
  }

  async function createUnit(payload: INovelCreateUnitPayload): Promise<boolean> {
    if (!root.value) return false
    const rootPath = root.value
    return mutate(() => window.electron.novel.createUnit(rootPath, payload))
  }

  async function updateUnit(unitId: string, update: INovelUnitUpdate): Promise<boolean> {
    if (!root.value) return false
    const rootPath = root.value
    return mutate(() => window.electron.novel.updateUnit(rootPath, unitId, update))
  }

  async function moveUnit(
    unitId: string,
    newParentId: string | null,
    index: number
  ): Promise<boolean> {
    if (!root.value) return false
    const rootPath = root.value
    return mutate(() => window.electron.novel.moveUnit(rootPath, unitId, newParentId, index))
  }

  async function deleteUnit(unitId: string, deleteFiles: boolean): Promise<boolean> {
    if (!root.value) return false
    const rootPath = root.value
    return mutate(() => window.electron.novel.deleteUnit(rootPath, unitId, deleteFiles))
  }

  async function compile(): Promise<INovelCompileResult | null> {
    if (!root.value) return null
    const name = window.path.basename(root.value) || 'manuscript'
    const outputPath = window.path.join(root.value, 'exports', `${name}.md`)
    return window.electron.novel.compile(root.value, { outputPath })
  }

  function setViewMode(mode: NovelViewMode): void {
    viewMode.value = mode
    if (mode !== 'page') refresh()
    sendSessionContext()
  }

  // Tell Biscuit where the writer is looking (view + open scene) so its
  // help matches the writer's current altitude. Fire-and-forget.
  function sendSessionContext(): void {
    try {
      const editorStore = useEditorStore()
      const pathname = editorStore.currentFile?.pathname
      const unit = pathname && root.value
        ? collectUnits(structure.value?.units ?? []).find(
          (u) => u.path && window.path.join(root.value as string, u.path) === pathname
        )
        : undefined
      window.electron.ai.setSessionContext({
        viewMode: viewMode.value,
        currentUnitId: unit?.id,
        currentFile: pathname ?? undefined
      })
    } catch {
      // Context is advisory — never let it break the UI.
    }
  }

  function collectUnits(units: INovelUnit[]): INovelUnit[] {
    const out: INovelUnit[] = []
    const walk = (list: INovelUnit[]): void => {
      for (const u of list) {
        out.push(u)
        if (u.children) walk(u.children)
      }
    }
    walk(units)
    return out
  }

  /** Open a unit's backing file in the editor (scenes / flat chapters). */
  function openUnit(unit: INovelUnit): void {
    if (!unit.path || !root.value) return
    viewMode.value = 'page'
    const pathname = window.path.join(root.value, unit.path)
    const editorStore = useEditorStore()
    const openedTab = editorStore.tabs.find((f) =>
      window.fileUtils.isSamePathSync(f.pathname, pathname)
    )
    if (openedTab) {
      if (editorStore.currentFile?.pathname !== openedTab.pathname) {
        editorStore.UPDATE_CURRENT_FILE(openedTab)
      }
    } else {
      window.electron.ipcRenderer.send('mt::open-file', pathname, {})
    }
  }

  return {
    structure,
    loading,
    lastError,
    flavor,
    totalWordCount,
    todayStart,
    viewMode,
    setViewMode,
    refresh,
    createUnit,
    updateUnit,
    moveUnit,
    deleteUnit,
    compile,
    openUnit,
    sendSessionContext
  }
})
