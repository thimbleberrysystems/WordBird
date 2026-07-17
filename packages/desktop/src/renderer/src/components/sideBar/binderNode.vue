<template>
  <div class="binder-node">
    <div
      class="binder-row"
      :class="{
        active: isActive,
        'drop-before': dropZone === 'before',
        'drop-after': dropZone === 'after',
        'drop-inside': dropZone === 'inside'
      }"
      :style="{ paddingLeft: `${depth * 14 + 8}px` }"
      draggable="true"
      @click="handleClick"
      @dblclick.stop="startRename"
      @contextmenu.prevent.stop="showRowMenu"
      @dragstart.stop="handleDragStart"
      @dragover.prevent.stop="handleDragOver"
      @dragleave="dropZone = null"
      @drop.prevent.stop="handleDrop"
      @dragend="dropZone = null"
    >
      <el-icon
        v-if="isContainer"
        class="caret"
        :class="{ open: expanded }"
        @click.stop="expanded = !expanded"
      >
        <CaretRight />
      </el-icon>
      <el-icon
        v-if="isContainer"
        class="type-icon"
        :class="unit.type"
        :title="unit.type"
      >
        <Collection v-if="unit.type === 'part'" />
        <Notebook v-else />
      </el-icon>
      <span
        v-else
        class="status-dot status-dot--clickable"
        :class="unit.status || 'idea'"
        :title="t('views.statusCycleTip', { status: unit.status || 'idea' })"
        @click.stop="novelStore.updateUnit(unit.id, { status: nextStatus(unit.status) })"
      />

      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameValue"
        class="rename-input"
        @keyup.enter="confirmRename"
        @keyup.esc="cancelRename"
        @blur="confirmRename"
        @click.stop
      >
      <span
        v-else
        class="title"
        :class="`title--${unit.type}`"
        :title="unit.title"
      >{{ unit.title }}</span>

      <span
        v-if="!renaming && wordCount"
        class="word-count"
      >{{ formattedCount }}</span>

      <span
        v-if="!renaming"
        class="row-actions"
      >
        <el-icon
          v-if="canAddChild"
          class="row-action"
          :title="t('binder.newScene')"
          @click.stop="$emit('add-child', unit)"
        >
          <Plus />
        </el-icon>
        <el-icon
          class="row-action"
          :title="t('binder.delete')"
          @click.stop="$emit('remove', unit)"
        >
          <Close />
        </el-icon>
      </span>
    </div>

    <div
      v-if="isContainer && expanded"
      class="binder-children"
    >
      <binder-node
        v-for="child in unit.children"
        :key="child.id"
        :unit="child"
        :depth="depth + 1"
        :parent-id="unit.id"
        @add-child="$emit('add-child', $event)"
        @remove="$emit('remove', $event)"
        @moved="$emit('moved', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { CaretRight, Plus, Close, Collection, Notebook } from '@element-plus/icons-vue'
import { popupContextMenu } from '../../contextMenu/popupMenu'
import { useNovelStore } from '@/store/novel'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import { t } from '../../i18n'
import { nextStatus } from '@/util/novelStatus'
import type { INovelUnit } from '@shared/types/novel'

defineOptions({ name: 'BinderNode' })

const props = defineProps<{
  unit: INovelUnit
  depth: number
  parentId: string | null
}>()

const emit = defineEmits<{
  (e: 'add-child', unit: INovelUnit): void
  (e: 'remove', unit: INovelUnit): void
  (e: 'moved', payload: { unitId: string; newParentId: string | null; index: number }): void
}>()

const novelStore = useNovelStore()
const editorStore = useEditorStore()
const projectStore = useProjectStore()

const expanded = ref(true)
const renaming = ref(false)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const dropZone = ref<'before' | 'after' | 'inside' | null>(null)

const isContainer = computed(() => !props.unit.path)
const canAddChild = computed(() => isContainer.value)

const wordCount = computed(() => {
  if (props.unit.wordCount) return props.unit.wordCount
  if (!props.unit.children) return 0
  let total = 0
  const walk = (units: INovelUnit[]): void => {
    for (const u of units) {
      if (u.children) walk(u.children)
      else if (u.wordCount) total += u.wordCount
    }
  }
  walk(props.unit.children)
  return total
})

const formattedCount = computed(() =>
  wordCount.value >= 1000 ? `${(wordCount.value / 1000).toFixed(1)}k` : String(wordCount.value)
)

const isActive = computed(() => {
  if (!props.unit.path) return false
  const current = editorStore.currentFile?.pathname
  const root = projectStore.currentProjectPath
  if (!current || !root) return false
  return window.fileUtils.isSamePathSync(current, window.path.join(root, props.unit.path))
})

const handleClick = (): void => {
  if (isContainer.value) {
    expanded.value = !expanded.value
  } else {
    novelStore.openUnit(props.unit)
  }
}

const startRename = (): void => {
  renameValue.value = props.unit.title
  renaming.value = true
  nextTick(() => renameInput.value?.select())
}

const confirmRename = (): void => {
  if (!renaming.value) return
  renaming.value = false
  const title = renameValue.value.trim()
  if (title && title !== props.unit.title) {
    novelStore.updateUnit(props.unit.id, { title })
  }
}

const cancelRename = (): void => {
  renaming.value = false
}

// ---- Right-click menu: everything the hover icons offer, discoverable ----

const showRowMenu = (event: MouseEvent): void => {
  const items = []
  if (!isContainer.value) {
    items.push({
      label: t('binder.open'),
      click: () => novelStore.openUnit(props.unit)
    })
  }
  items.push({
    label: t('binder.rename'),
    click: () => startRename()
  })
  if (canAddChild.value) {
    items.push({
      label: `+ ${props.unit.type === 'part' ? t('binder.chapter') : t('binder.scene')}`,
      click: () => emit('add-child', props.unit)
    })
  }
  items.push(
    { type: 'separator' },
    {
      label: t('binder.delete'),
      click: () => emit('remove', props.unit)
    }
  )
  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}

// ---- Drag & drop reordering ----

const handleDragStart = (event: DragEvent): void => {
  event.dataTransfer?.setData('application/x-wordbird-unit', props.unit.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

const zoneFor = (event: DragEvent): 'before' | 'after' | 'inside' => {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const ratio = (event.clientY - rect.top) / rect.height
  if (isContainer.value) {
    if (ratio < 0.25) return 'before'
    if (ratio > 0.75) return 'after'
    return 'inside'
  }
  return ratio < 0.5 ? 'before' : 'after'
}

const handleDragOver = (event: DragEvent): void => {
  if (!event.dataTransfer?.types.includes('application/x-wordbird-unit')) return
  dropZone.value = zoneFor(event)
}

const handleDrop = (event: DragEvent): void => {
  const draggedId = event.dataTransfer?.getData('application/x-wordbird-unit')
  const zone = dropZone.value
  dropZone.value = null
  if (!draggedId || draggedId === props.unit.id || !zone) return

  if (zone === 'inside') {
    emit('moved', {
      unitId: draggedId,
      newParentId: props.unit.id,
      index: props.unit.children?.length ?? 0
    })
    return
  }

  const siblings = siblingListIds()
  const selfIndex = siblings.indexOf(props.unit.id)
  if (selfIndex === -1) return
  // Dropping next to self relative to a list the dragged item may currently
  // occupy — main-side moveUnit removes first, so adjust for that shift.
  const draggedIndex = siblings.indexOf(draggedId)
  let index = zone === 'before' ? selfIndex : selfIndex + 1
  if (draggedIndex !== -1 && draggedIndex < index) index -= 1
  emit('moved', { unitId: draggedId, newParentId: props.parentId, index })
}

const siblingListIds = (): string[] => {
  const structure = novelStore.structure
  if (!structure) return []
  if (props.parentId === null) return structure.units.map((u) => u.id)
  const findList = (units: INovelUnit[]): string[] | null => {
    for (const u of units) {
      if (u.id === props.parentId) return (u.children ?? []).map((c) => c.id)
      if (u.children) {
        const found = findList(u.children)
        if (found) return found
      }
    }
    return null
  }
  return findList(structure.units) ?? []
}
</script>

<style scoped>
.binder-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding-right: 8px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--sideBarColor);
  font-size: 13px;
  position: relative;
  &:hover {
    background: var(--itemBgColor);
    & .row-actions {
      opacity: 1;
    }
  }
  &.active {
    color: var(--themeColor);
  }
  &.drop-before::before,
  &.drop-after::after {
    content: '';
    position: absolute;
    left: 4px;
    right: 4px;
    height: 2px;
    background: var(--themeColor);
  }
  &.drop-before::before {
    top: -1px;
  }
  &.drop-after::after {
    bottom: -1px;
  }
  &.drop-inside {
    outline: 1px solid var(--themeColor);
    outline-offset: -1px;
  }
}

.caret {
  width: 14px;
  flex-shrink: 0;
  transition: transform 0.15s ease-in-out;
  color: var(--iconColor);
  &.open {
    transform: rotate(90deg);
  }
}

.status-dot--clickable {
  cursor: pointer;
}

.status-dot--clickable:hover {
  transform: scale(1.4);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  &.idea {
    background: var(--iconColor);
    opacity: 0.5;
  }
  &.draft {
    background: var(--wbWarningColor);
  }
  &.revised {
    background: var(--wbInfoColor);
  }
  &.final {
    background: var(--wbSuccessColor);
  }
}

.title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.word-count {
  font-size: 11px;
  color: var(--iconColor);
  flex-shrink: 0;
}

.row-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  flex-shrink: 0;
}

.row-action {
  width: 16px;
  height: 16px;
  color: var(--iconColor);
  &:hover {
    color: var(--themeColor);
  }
}

.rename-input {
  flex: 1;
  min-width: 0;
  background: var(--floatBgColor);
  border: 1px solid var(--themeColor);
  border-radius: 3px;
  color: var(--sideBarColor);
  font-size: 13px;
  padding: 2px 4px;
  outline: none;
}

.type-icon {
  width: 14px;
  flex-shrink: 0;
  color: var(--iconColor);
  &.part {
    color: var(--themeColor);
  }
}

.title--part {
  font-weight: 650;
  letter-spacing: 0.02em;
}
.title--chapter {
  font-weight: 550;
}

</style>
