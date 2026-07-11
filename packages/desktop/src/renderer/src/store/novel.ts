/**
 * Novel store — renderer-side view of the structure manifest
 * (`.wordbird/structure.json`) behind the binder, plus compile.
 *
 * All mutations round-trip through main (window.electron.novel), which
 * returns the updated structure; the store never mutates the tree locally.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useProjectStore } from './project'
import { useEditorStore } from './editor'
import type {
  INovelStructure,
  INovelUnit,
  INovelCreateUnitPayload,
  INovelUnitUpdate,
  INovelCompileResult
} from '@shared/types/novel'

export type NovelViewMode = 'page' | 'corkboard' | 'outline'

export const useNovelStore = defineStore('novel', () => {
  const structure = ref<INovelStructure | null>(null)
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
    error?: string
  }): boolean => {
    if (result.ok && result.structure) {
      structure.value = result.structure
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

  async function createUnit(payload: INovelCreateUnitPayload): Promise<boolean> {
    if (!root.value) return false
    return applyResult(await window.electron.novel.createUnit(root.value, payload))
  }

  async function updateUnit(unitId: string, update: INovelUnitUpdate): Promise<boolean> {
    if (!root.value) return false
    return applyResult(await window.electron.novel.updateUnit(root.value, unitId, update))
  }

  async function moveUnit(
    unitId: string,
    newParentId: string | null,
    index: number
  ): Promise<boolean> {
    if (!root.value) return false
    return applyResult(
      await window.electron.novel.moveUnit(root.value, unitId, newParentId, index)
    )
  }

  async function deleteUnit(unitId: string, deleteFiles: boolean): Promise<boolean> {
    if (!root.value) return false
    return applyResult(await window.electron.novel.deleteUnit(root.value, unitId, deleteFiles))
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
    viewMode,
    setViewMode,
    refresh,
    createUnit,
    updateUnit,
    moveUnit,
    deleteUnit,
    compile,
    openUnit
  }
})
