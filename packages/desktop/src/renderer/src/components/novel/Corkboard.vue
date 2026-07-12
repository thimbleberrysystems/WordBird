<template>
  <div class="corkboard">
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
    <p
      v-if="sections.length === 0"
      class="cork-empty"
    >
      {{ t('binder.empty') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useNovelStore } from '@/store/novel'
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
          const scenes = (unit.children ?? []).filter((c) => c.path)
          result.push({
            id: unit.id,
            title: [...trail, unit.title].join(' · '),
            parentId: unit.id,
            scenes
          })
          // Nested containers under a chapter are rare; recurse for safety.
          walk((unit.children ?? []).filter((c) => !c.path), [...trail, unit.title])
        }
      } else if (unit.path) {
        loose.push(unit)
      }
    }
  }
  walk(structure.value?.units ?? [], [])

  if (loose.length > 0) {
    result.push({ id: '__loose__', title: t('views.scenes'), parentId: null, scenes: loose })
  }
  return result
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
</script>

<style scoped>
.corkboard {
  flex: 1;
  overflow-y: auto;
  padding: 40px 32px 32px;
  background: var(--editorBgColor);
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
