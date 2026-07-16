<template>
  <div class="corkboard">
    <!-- Thread/label filter chips (plot-grid style: view one subplot). -->
    <div
      v-if="threads.length > 0 || labels.length > 0"
      class="cork-filters"
    >
      <select
        v-if="threads.length > 0"
        v-model="activeThread"
        class="filter-select"
        :title="t('views.threadFilterTip')"
      >
        <option value="">
          {{ t('views.allThreads') }}
        </option>
        <option
          v-for="thread in threads"
          :key="thread"
          :value="thread"
        >
          {{ thread }}
        </option>
      </select>
      <select
        v-if="labels.length > 0"
        v-model="activeLabel"
        class="filter-select"
        :title="t('views.labelFilterTip')"
      >
        <option value="">
          {{ t('views.allLabels') }}
        </option>
        <option
          v-for="label in labels"
          :key="label"
          :value="label"
        >
          {{ label }}
        </option>
      </select>
    </div>
    <div
      v-for="section in sections"
      :key="section.id"
      class="cork-section"
    >
      <h3 class="section-title">
        {{ section.title }}
      </h3>
      <div
        class="card-grid"
        @dragover.prevent
        @drop.prevent="dropOnSection(section, $event)"
      >
        <div
          v-for="scene in section.scenes"
          :key="scene.id"
          class="scene-card"
          :class="{ 'drop-target': dropTargetId === scene.id }"
          draggable="true"
          @click="novelStore.openUnit(scene)"
          @dragstart="dragStart(scene, $event)"
          @dragover.prevent.stop="dropTargetId = scene.id"
          @dragleave="dropTargetId = null"
          @drop.prevent.stop="dropOnCard(section, scene, $event)"
          @dragend="dropTargetId = null"
        >
          <div class="card-header">
            <span
              class="status-dot"
              :class="scene.status || 'idea'"
            />
            <span class="card-title">{{ scene.title }}</span>
            <span
              v-if="scene.wordCount"
              class="card-words"
            >{{ scene.wordCount }}</span>
          </div>
          <textarea
            class="card-synopsis"
            :value="scene.synopsis ?? ''"
            :placeholder="t('views.noSynopsis')"
            rows="4"
            @click.stop
            @change="saveSynopsis(scene, $event)"
          />
          <div
            v-if="scene.pov"
            class="card-meta"
          >
            {{ scene.pov }}
          </div>
        </div>
      </div>
    </div>
    <empty-state
      v-if="sections.length === 0"
      icon="🗂"
      :title="t('empty.corkboardTitle')"
      :hint="t('empty.corkboardHint')"
      :action-label="t('empty.corkboardAction')"
      @action="askBiscuitToDraft"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useNovelStore } from '@/store/novel'
import EmptyState from '../common/EmptyState.vue'
import bus from '../../bus'
import { t } from '../../i18n'
import type { INovelUnit } from '@shared/types/novel'

const novelStore = useNovelStore()
const { structure } = storeToRefs(novelStore)

const dropTargetId = ref<string | null>(null)

interface CorkSection {
  id: string
  title: string
  parentId: string | null
  scenes: INovelUnit[]
}

// Thread/label filters (empty = show all). Filtered cards keep their
// section so drag-reorder targets stay meaningful.
const activeThread = ref('')
const activeLabel = ref('')

const allScenes = computed<INovelUnit[]>(() => {
  const out: INovelUnit[] = []
  const walk = (units: INovelUnit[]): void => {
    for (const unit of units) {
      if (unit.path) out.push(unit)
      else if (unit.children) walk(unit.children)
    }
  }
  walk(structure.value?.units ?? [])
  return out
})

const threads = computed<string[]>(() =>
  [...new Set(allScenes.value.map((s) => s.thread).filter((v): v is string => !!v))].sort()
)
const labels = computed<string[]>(() =>
  [...new Set(allScenes.value.map((s) => s.label).filter((v): v is string => !!v))].sort()
)

const matchesFilters = (scene: INovelUnit): boolean =>
  (!activeThread.value || scene.thread === activeThread.value) &&
  (!activeLabel.value || scene.label === activeLabel.value)

// Flatten the structure into sections of scene cards: each container
// chapter becomes a section; loose top-level scenes (scene-pool / flat)
// pool into one section.
const sections = computed<CorkSection[]>(() => {
  const result: CorkSection[] = []
  const loose: INovelUnit[] = []

  const walk = (units: INovelUnit[], trail: string[]): void => {
    for (const unit of units) {
      if (unit.children && unit.children.length >= 0 && !unit.path) {
        if (unit.type === 'part') {
          walk(unit.children ?? [], [...trail, unit.title])
        } else {
          const scenes = (unit.children ?? []).filter((c) => c.path && matchesFilters(c))
          result.push({
            id: unit.id,
            title: [...trail, unit.title].join(' · '),
            parentId: unit.id,
            scenes
          })
          // Nested containers under a chapter are rare; recurse for safety.
          walk((unit.children ?? []).filter((c) => !c.path), [...trail, unit.title])
        }
      } else if (unit.path && matchesFilters(unit)) {
        loose.push(unit)
      }
    }
  }
  walk(structure.value?.units ?? [], [])

  if (loose.length > 0) {
    result.push({ id: '__loose__', title: t('views.scenes'), parentId: null, scenes: loose })
  }
  // While filtering, hide sections that have no matching cards.
  const filtering = !!(activeThread.value || activeLabel.value)
  return filtering ? result.filter((section) => section.scenes.length > 0) : result
})

onMounted(() => {
  novelStore.refresh()
})

const dragStart = (scene: INovelUnit, event: DragEvent): void => {
  event.dataTransfer?.setData('application/x-wordbird-unit', scene.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

const dropOnCard = async (
  section: CorkSection,
  target: INovelUnit,
  event: DragEvent
): Promise<void> => {
  dropTargetId.value = null
  const draggedId = event.dataTransfer?.getData('application/x-wordbird-unit')
  if (!draggedId || draggedId === target.id) return
  const ids = section.scenes.map((s) => s.id)
  let index = ids.indexOf(target.id)
  const draggedIndex = ids.indexOf(draggedId)
  if (draggedIndex !== -1 && draggedIndex < index) index -= 1
  await novelStore.moveUnit(draggedId, section.parentId, Math.max(0, index))
}

const dropOnSection = async (section: CorkSection, event: DragEvent): Promise<void> => {
  const draggedId = event.dataTransfer?.getData('application/x-wordbird-unit')
  if (!draggedId) return
  await novelStore.moveUnit(draggedId, section.parentId, section.scenes.length)
}

const saveSynopsis = (scene: INovelUnit, event: Event): void => {
  const synopsis = (event.target as HTMLTextAreaElement).value
  novelStore.updateUnit(scene.id, { synopsis })
}

const askBiscuitToDraft = (): void => {
  bus.emit('biscuit-ask', t('empty.corkboardPrompt'))
}
</script>

<style scoped>
.corkboard {
  flex: 1;
  overflow-y: auto;
  padding: 40px 32px 32px;
  background: var(--editorBgColor);
}

.cork-filters {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 14px;
}

.filter-select {
  font: inherit;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 10px;
  border: 1px solid var(--itemBgColor);
  background: transparent;
  color: var(--iconColor);
  cursor: pointer;
  outline: none;
  &:hover {
    color: var(--themeColor);
    border-color: var(--themeColor);
  }
}

.cork-section {
  margin-bottom: 28px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--iconColor);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 10px 2px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
  min-height: 40px;
}

.scene-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--itemBgColor);
  background: var(--floatBgColor, var(--itemBgColor));
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
  &:hover {
    border-color: var(--themeColor);
  }
  &.drop-target {
    border-color: var(--themeColor);
    transform: translateX(3px);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
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

.card-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--editorColor);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-words {
  font-size: 10px;
  color: var(--iconColor);
}

.card-synopsis {
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  color: var(--editorColor);
  background: transparent;
  border: none;
  resize: none;
  outline: none;
  opacity: 0.85;
  &::placeholder {
    color: var(--iconColor);
    font-style: italic;
  }
}

.card-meta {
  font-size: 10px;
  color: var(--iconColor);
}

.cork-empty {
  color: var(--iconColor);
  font-size: 13px;
  text-align: center;
  margin-top: 80px;
}
</style>
