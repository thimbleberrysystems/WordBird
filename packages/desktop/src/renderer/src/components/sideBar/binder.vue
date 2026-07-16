<template>
  <div class="binder">
    <div class="binder-header">
      <span class="binder-title">{{ t('binder.title') }}</span>
      <span
        v-if="todayWords !== 0"
        class="binder-today"
        :class="{ negative: todayWords < 0 }"
        :title="t('binder.todayTip')"
      >{{ todayLabel }}</span>
      <span
        class="binder-total"
        :class="{ 'has-target': wordTarget > 0 }"
        :title="t('binder.setTargetTip')"
        @click="editTarget"
      >{{ totalLabel }}</span>
    </div>
    <!-- 14-day writing history (hover a bar for the day's words). -->
    <div
      v-if="history.some((d) => d.written > 0)"
      class="binder-history"
      :title="t('binder.historyTip', { streak: String(streak) })"
    >
      <div
        v-for="day in history"
        :key="day.date"
        class="history-bar"
        :style="{ height: `${historyBarHeight(day.written)}px` }"
        :title="`${day.date}: ${day.written}`"
      />
    </div>
    <!-- Scrivener-style manuscript target: thin progress bar under the header -->
    <div
      v-if="wordTarget > 0"
      class="binder-target-bar"
      :title="targetTip"
    >
      <div
        class="binder-target-fill"
        :class="{ done: targetRatio >= 1 }"
        :style="{ width: `${Math.min(100, targetRatio * 100)}%` }"
      />
    </div>

    <div class="binder-toolbar">
      <el-button
        v-if="showAddPart"
        size="small"
        text
        @click="addTopLevel('part')"
      >
        + {{ t('binder.part') }}
      </el-button>
      <el-button
        v-if="showAddChapter"
        size="small"
        text
        @click="addTopLevel('chapter')"
      >
        + {{ t('binder.chapter') }}
      </el-button>
      <el-button
        v-if="showAddScene"
        size="small"
        text
        @click="addTopLevel('scene')"
      >
        + {{ t('binder.scene') }}
      </el-button>
      <el-button
        size="small"
        text
        :loading="savingAll"
        :title="t('binder.saveTip')"
        @click="handleSaveAll"
      >
        {{ t('binder.save') }}
      </el-button>
      <el-dropdown
        trigger="click"
        @command="(format: string) => handleCompile(format as 'md' | 'epub' | 'docx')"
      >
        <el-button
          size="small"
          text
          :loading="compiling"
        >
          {{ t('binder.compile') }}
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="md">
              {{ t('binder.compileMd') }}
            </el-dropdown-item>
            <el-dropdown-item command="epub">
              {{ t('binder.compileEpub') }}
            </el-dropdown-item>
            <el-dropdown-item command="docx">
              {{ t('binder.compileDocx') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div
      class="binder-tree"
      @dragover.prevent
      @drop.prevent="handleRootDrop"
    >
      <binder-node
        v-for="unit in structure?.units ?? []"
        :key="unit.id"
        :unit="unit"
        :depth="0"
        :parent-id="null"
        @add-child="handleAddChild"
        @remove="handleRemove"
        @moved="handleMoved"
      />
      <p
        v-if="structure && structure.units.length === 0"
        class="binder-empty"
      >
        {{ t('binder.empty') }}
      </p>
    </div>

    <!-- Plans: Biscuit's (writer-co-owned) working plans in plans/ — the
         binder is where writers live, so plans must be visible here, not
         only in the raw Files view. -->
    <div
      v-if="planFiles.length > 0"
      class="binder-plans"
    >
      <div
        class="plans-header"
        @click="plansExpanded = !plansExpanded"
      >
        <span
          class="plans-caret"
          :class="{ open: plansExpanded }"
        >▸</span>
        {{ t('binder.plans') }}
        <span class="plans-count">{{ planFiles.length }}</span>
      </div>
      <ul v-show="plansExpanded">
        <li
          v-for="plan in planFiles"
          :key="plan.pathname"
          :title="plan.pathname"
          @click="openPlanFile(plan.pathname)"
        >
          {{ plan.name }}
        </li>
      </ul>
    </div>

    <!-- Skills: writer-authored techniques. Pin = ride every model turn. -->
    <div
      v-if="skillFiles.length > 0"
      class="binder-plans binder-skills"
    >
      <div
        class="plans-header"
        @click="skillsExpanded = !skillsExpanded"
      >
        <span
          class="plans-caret"
          :class="{ open: skillsExpanded }"
        >▸</span>
        {{ t('binder.skills') }}
        <span class="plans-count">{{ pinnedSkills.length }}/{{ MAX_PINS }} · {{ skillFiles.length }}</span>
      </div>
      <ul v-show="skillsExpanded">
        <li
          v-for="skill in skillFiles"
          :key="skill.pathname"
          :title="skill.pathname"
          @click="openPlanFile(skill.pathname)"
        >
          <span class="skill-name">{{ skill.name }}</span>
          <span
            v-if="usedSkills.has(skill.name)"
            class="skill-used-dot"
            :title="t('binder.skillUsedTip')"
          />
          <button
            class="skill-pin"
            :class="{ pinned: pinnedSkills.includes(skill.name) }"
            :title="t('binder.pinTip', { max: String(MAX_PINS) })"
            @click.stop="togglePin(skill.name)"
          >
            {{ pinnedSkills.includes(skill.name) ? '📌' : '📍' }}
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import BinderNode from './binderNode.vue'
import { useNovelStore } from '@/store/novel'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import { useLayoutStore } from '@/store/layout'
import { t } from '../../i18n'
import type { INovelUnit, NovelUnitType } from '@shared/types/novel'

const novelStore = useNovelStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()

const { structure, flavor, totalWordCount, todayStart } = storeToRefs(novelStore)

// ---- Plans section (derived live from the watched project tree) ----
const plansExpanded = ref(true)
const planFiles = computed<Array<{ name: string; pathname: string }>>(() => {
  const tree = projectStore.projectTree as {
    folders?: Array<{ name: string; files?: Array<{ name: string; pathname: string }> }>
  } | null
  const plansDir = tree?.folders?.find((f) => f.name === 'plans')
  return (plansDir?.files ?? [])
    .filter((f) => /\.(md|markdown|txt)$/i.test(f.name))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
})

// ---- Skills: list + pin state + "Biscuit used it" glyph ----
const MAX_PINS = 3
const skillsExpanded = ref(true)
const pinnedSkills = ref<string[]>([])
const usedSkills = ref(new Set<string>())

const skillFiles = computed<Array<{ name: string; pathname: string }>>(() => {
  const tree = projectStore.projectTree as {
    folders?: Array<{ name: string; files?: Array<{ name: string; pathname: string }> }>
  } | null
  const dir = tree?.folders?.find((f) => f.name === 'skills')
  return (dir?.files ?? [])
    .filter((f) => /\.(md|markdown)$/i.test(f.name))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
})

const refreshPins = async (): Promise<void> => {
  const root = projectStore.currentProjectPath
  if (!root) return
  try {
    const { pinned } = await window.electron.novel.pinnedSkills(root)
    pinnedSkills.value = pinned
  } catch {
    pinnedSkills.value = []
  }
}

const togglePin = async (file: string): Promise<void> => {
  const root = projectStore.currentProjectPath
  if (!root) return
  const wantPinned = !pinnedSkills.value.includes(file)
  const result = await window.electron.novel.pinSkill(root, file, wantPinned)
  if (!result.ok && result.error) {
    ElMessage.warning(result.error)
  }
  pinnedSkills.value = result.pinned
}

watch(() => projectStore.currentProjectPath, refreshPins, { immediate: true })

// Passive "Biscuit reached for it" dot: watch the agent activity feed for
// use_skill events this session.
const agentActivityHandler = (event: unknown): void => {
  const e = event as { label?: string; detail?: string } | null
  if (!e?.label?.includes('use_skill') && !(e?.detail ?? '').includes('use_skill')) return
  const text = `${e?.label ?? ''} ${e?.detail ?? ''}`
  for (const skill of skillFiles.value) {
    const stem = skill.name.replace(/\.(md|markdown)$/i, '')
    if (text.includes(stem) || text.includes(skill.name)) {
      usedSkills.value = new Set([...usedSkills.value, skill.name])
    }
  }
}
onMounted(() => {
  window.electron.ai.onActivity?.(agentActivityHandler)
})

const openPlanFile = (pathname: string): void => {
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
const compiling = ref(false)

// ---- Manuscript word target (per project, writer-set) ----
const targetKey = computed(() => `wordbird-target:${projectStore.currentProjectPath ?? ''}`)
const wordTarget = ref(0)

const loadTarget = (): void => {
  wordTarget.value = Number(localStorage.getItem(targetKey.value)) || 0
}

// ---- Words written today (baseline recorded main-side per local day) ----
const todayWords = computed(() =>
  todayStart.value === null ? 0 : totalWordCount.value - todayStart.value
)

const todayLabel = computed(() =>
  `${todayWords.value > 0 ? '+' : ''}${fmtCount(todayWords.value)}`
)

const targetRatio = computed(() =>
  wordTarget.value > 0 ? totalWordCount.value / wordTarget.value : 0
)

const fmtCount = (count: number): string =>
  count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)

const totalLabel = computed(() => {
  if (wordTarget.value > 0) {
    return `${fmtCount(totalWordCount.value)} / ${fmtCount(wordTarget.value)} ${t('binder.words')}`
  }
  return `${fmtCount(totalWordCount.value)} ${t('binder.words')}`
})

const targetTip = computed(() =>
  t('binder.targetTip', { percent: String(Math.round(targetRatio.value * 100)) })
)

const editTarget = async (): Promise<void> => {
  let value: string
  try {
    const result = await ElMessageBox.prompt(t('binder.targetPrompt'), t('binder.targetTitle'), {
      inputValue: wordTarget.value > 0 ? String(wordTarget.value) : '',
      inputPattern: /^\d*$/,
      inputErrorMessage: t('binder.targetInvalid')
    })
    value = result.value
  } catch {
    return // cancelled
  }
  const parsed = Number(value) || 0
  wordTarget.value = parsed
  if (parsed > 0) {
    localStorage.setItem(targetKey.value, String(parsed))
  } else {
    localStorage.removeItem(targetKey.value)
  }
}

// ---- 14-day writing history (from main's .wordbird/stats.json) ----
const history = ref<Array<{ date: string; written: number }>>([])

const loadHistory = async (): Promise<void> => {
  const root = projectStore.currentProjectPath
  if (!root) {
    history.value = []
    return
  }
  try {
    history.value = (await window.electron.novel.wordStats(root)).slice(-14)
  } catch {
    history.value = []
  }
}

const historyBarHeight = (written: number): number => {
  const max = Math.max(...history.value.map((d) => d.written), 1)
  return written > 0 ? Math.max(2, Math.round((written / max) * 18)) : 1
}

/** Consecutive days (ending today) with words written. */
const streak = computed(() => {
  let count = 0
  for (let i = history.value.length - 1; i >= 0; i--) {
    if (history.value[i].written > 0) count += 1
    else break
  }
  return count
})

// Which top-level "add" buttons make sense per flavor.
const showAddPart = computed(() => flavor.value === 'chapters-scenes')
const showAddChapter = computed(
  () => flavor.value === 'chapters-scenes' || flavor.value === 'flat'
)
const showAddScene = computed(() => flavor.value === 'scene-pool')

onMounted(() => {
  novelStore.refresh()
  loadTarget()
  loadHistory()
})

watch(
  () => projectStore.currentProjectPath,
  () => {
    novelStore.refresh()
    loadTarget()
    loadHistory()
  }
)
// The history bars move with today's writing.
watch(totalWordCount, () => loadHistory())

// Word counts move as the writer saves — refresh whenever the binder
// becomes the visible sidebar view.
watch(
  () => layoutStore.rightColumn,
  (column) => {
    if (column === 'binder') novelStore.refresh()
  }
)

const addTopLevel = async (type: NovelUnitType): Promise<void> => {
  await novelStore.createUnit({
    parentId: null,
    type,
    title: t(`binder.new${type.charAt(0).toUpperCase()}${type.slice(1)}Title`)
  })
}

const handleAddChild = async (parent: INovelUnit): Promise<void> => {
  // Parts contain chapters; chapters contain scenes.
  const childType: NovelUnitType = parent.type === 'part' ? 'chapter' : 'scene'
  await novelStore.createUnit({
    parentId: parent.id,
    type: childType,
    title: t(
      childType === 'chapter' ? 'binder.newChapterTitle' : 'binder.newSceneTitle'
    )
  })
}

const handleRemove = async (unit: INovelUnit): Promise<void> => {
  try {
    await ElMessageBox.confirm(
      t('binder.deleteConfirm', { title: unit.title }),
      t('binder.delete'),
      {
        confirmButtonText: t('binder.delete'),
        cancelButtonText: t('recent.cancel'),
        type: 'warning'
      }
    )
  } catch {
    return
  }
  const ok = await novelStore.deleteUnit(unit.id, true)
  if (!ok && novelStore.lastError) {
    ElMessage.error(novelStore.lastError)
  }
}

const handleMoved = async (payload: {
  unitId: string
  newParentId: string | null
  index: number
}): Promise<void> => {
  const ok = await novelStore.moveUnit(payload.unitId, payload.newParentId, payload.index)
  if (!ok && novelStore.lastError) {
    ElMessage.error(novelStore.lastError)
  }
}

const handleRootDrop = async (event: DragEvent): Promise<void> => {
  const draggedId = event.dataTransfer?.getData('application/x-wordbird-unit')
  if (!draggedId || !structure.value) return
  // Dropping on empty tree space appends at the end of the top level.
  await handleMoved({
    unitId: draggedId,
    newParentId: null,
    index: structure.value.units.length
  })
}

// Project-level save: flush every dirty tab to disk (each save records its
// own auto snapshot), then take one explicit snapshot so this moment is
// marked in History even when nothing was dirty.
const savingAll = ref(false)
const handleSaveAll = async (): Promise<void> => {
  if (savingAll.value) return
  savingAll.value = true
  try {
    useEditorStore().ASK_FOR_SAVE_ALL(false)
    // Saves land asynchronously via main — give them a beat before the
    // explicit snapshot so it captures the flushed state.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const root = projectStore.currentProjectPath
    if (root) {
      await window.electron.novel.snapshot(root, t('binder.saveSnapshotMessage'))
    }
    ElMessage.success(t('binder.saved'))
    novelStore.refresh()
  } catch {
    // Saving is main's job; the snapshot is best-effort.
  } finally {
    savingAll.value = false
  }
}

const handleCompile = async (format: 'md' | 'epub' | 'docx' = 'md'): Promise<void> => {
  compiling.value = true
  try {
    const result = await novelStore.compile(format)
    if (result?.ok) {
      ElMessage.success(t('binder.compiled', { path: result.outputPath ?? '' }))
      if (format === 'md' && result.outputPath) {
        // Open the compiled book so File → Export (PDF/HTML/print) is one
        // step away. EPUB/DOCX are binary — reveal them instead.
        window.electron.ipcRenderer.send('mt::open-file', result.outputPath, {})
      } else if (result.outputPath) {
        window.electron.shell.showItemInFolder(result.outputPath)
      }
    } else {
      ElMessage.error(result?.error ?? 'Compile failed')
    }
  } finally {
    compiling.value = false
  }
}
</script>

<style scoped>
.binder {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.binder-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 30px 12px 8px 12px;
}

.binder-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--sideBarColor));
}

.binder-total {
  font-size: 11px;
  color: var(--iconColor);
  cursor: pointer;
  &:hover {
    color: var(--themeColor, var(--wbInfoColor));
  }
}

.binder-total.has-target {
  color: var(--sideBarColor);
}

.binder-today {
  font-size: 11px;
  font-weight: 600;
  color: var(--wbSuccessColor);
}

.binder-today.negative {
  color: var(--wbWarningColor);
}

.binder-history {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 20px;
  padding: 0 12px 4px;
}

.history-bar {
  flex: 1;
  min-width: 3px;
  border-radius: 1px;
  background: var(--themeColor, var(--wbInfoColor));
  opacity: 0.55;
}

.binder-target-bar {
  height: 3px;
  margin: 0 8px 6px;
  border-radius: 2px;
  background: var(--itemBgColor, rgba(128, 128, 128, 0.2));
  overflow: hidden;
}

.binder-target-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--themeColor, var(--wbInfoColor));
  transition: width 0.4s ease;
}

.binder-target-fill.done {
  background: var(--wbSuccessColor);
}

.binder-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0 8px 8px 8px;
  border-bottom: 1px solid var(--itemBgColor);
  & .el-button {
    color: var(--sideBarColor);
    padding: 4px 6px;
    margin: 0;
  }
  & .el-button:hover {
    color: var(--themeColor);
  }
}

.binder-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px 4px;
}

.binder-empty {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--iconColor);
}

.binder-plans {
  border-top: 1px solid var(--itemBgColor);
  padding: 6px 0 10px;
  font-size: 13px;

  & .plans-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    color: var(--editorColor50);
    cursor: pointer;
    user-select: none;
    &:hover {
      color: var(--editorColor);
    }
  }
  & .plans-caret {
    display: inline-block;
    transition: transform 0.15s;
    &.open {
      transform: rotate(90deg);
    }
  }
  & .plans-count {
    margin-left: auto;
    font-size: 11px;
    color: var(--editorColor30);
  }
  & ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  & li {
    padding: 3px 12px 3px 30px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    color: var(--editorColor80, var(--editorColor));
    &:hover {
      background: var(--floatHoverColor, var(--itemBgColor));
    }
  }
}

.binder-skills li {
  display: flex;
  align-items: center;
  gap: 6px;
  & .skill-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1 1 auto;
  }
  & .skill-used-dot {
    flex: 0 0 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--themeColor);
    opacity: 0.7;
  }
  & .skill-pin {
    flex: 0 0 auto;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.35;
    padding: 0 2px;
    &:hover {
      opacity: 1;
    }
    &.pinned {
      opacity: 1;
    }
  }
}
</style>
