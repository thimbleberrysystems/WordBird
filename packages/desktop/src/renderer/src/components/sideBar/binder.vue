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
        :loading="compiling"
        @click="handleCompile"
      >
        {{ t('binder.compile') }}
      </el-button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import BinderNode from './binderNode.vue'
import { useNovelStore } from '@/store/novel'
import { useProjectStore } from '@/store/project'
import { useLayoutStore } from '@/store/layout'
import { t } from '../../i18n'
import type { INovelUnit, NovelUnitType } from '@shared/types/novel'

const novelStore = useNovelStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()

const { structure, flavor, totalWordCount, todayStart } = storeToRefs(novelStore)
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

// Which top-level "add" buttons make sense per flavor.
const showAddPart = computed(() => flavor.value === 'chapters-scenes')
const showAddChapter = computed(
  () => flavor.value === 'chapters-scenes' || flavor.value === 'flat'
)
const showAddScene = computed(() => flavor.value === 'scene-pool')

onMounted(() => {
  novelStore.refresh()
  loadTarget()
})

watch(
  () => projectStore.currentProjectPath,
  () => {
    novelStore.refresh()
    loadTarget()
  }
)

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

const handleCompile = async (): Promise<void> => {
  compiling.value = true
  try {
    const result = await novelStore.compile()
    if (result?.ok) {
      ElMessage.success(t('binder.compiled', { path: result.outputPath ?? '' }))
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
    color: var(--themeColor, #409eff);
  }
}

.binder-total.has-target {
  color: var(--sideBarColor);
}

.binder-today {
  font-size: 11px;
  font-weight: 600;
  color: #67c23a;
}

.binder-today.negative {
  color: #e6a23c;
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
  background: var(--themeColor, #409eff);
  transition: width 0.4s ease;
}

.binder-target-fill.done {
  background: #67c23a;
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
</style>
