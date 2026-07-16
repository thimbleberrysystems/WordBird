<template>
  <div class="timeline-view">
    <div class="timeline-toolbar">
      <button
        class="order-chip"
        :class="{ active: order === 'narrative' }"
        @click="order = 'narrative'"
      >
        {{ t('views.narrativeOrder') }}
      </button>
      <button
        class="order-chip"
        :class="{ active: order === 'chronological' }"
        @click="order = 'chronological'"
      >
        {{ t('views.chronologicalOrder') }}
      </button>
      <!-- Thread lanes (Dabble-plot-grid style): filter to one subplot. -->
      <select
        v-if="threads.length > 0"
        v-model="activeThread"
        class="thread-select"
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
    </div>

    <div class="timeline-track">
      <div
        v-for="scene in orderedScenes"
        :key="scene.id"
        class="timeline-entry"
      >
        <div class="entry-when">
          <input
            class="when-input"
            :value="scene.when ?? ''"
            :placeholder="t('views.whenPlaceholder')"
            @change="saveWhen(scene, $event)"
          >
        </div>
        <div class="entry-node">
          <span
            class="entry-dot"
            :class="scene.status || 'idea'"
          />
          <span class="entry-line" />
        </div>
        <div
          class="entry-card"
          @click="novelStore.openUnit(scene)"
          @contextmenu.prevent="showCardMenu($event, scene)"
        >
          <div class="entry-title">
            {{ scene.title }}
          </div>
          <div class="entry-meta">
            <span v-if="scene.pov">{{ scene.pov }}</span>
            <span v-if="scene.location">· {{ scene.location }}</span>
            <span
              v-if="scene.thread"
              class="entry-thread"
            >{{ scene.thread }}</span>
          </div>
          <div
            v-if="scene.synopsis"
            class="entry-synopsis"
          >
            {{ scene.synopsis }}
          </div>
        </div>
      </div>
      <empty-state
        v-if="orderedScenes.length === 0"
        icon="🕰"
        :title="t('empty.timelineTitle')"
        :hint="t('empty.timelineHint')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import EmptyState from '../common/EmptyState.vue'
import { popupContextMenu } from '../../contextMenu/popupMenu'
import { useNovelStore } from '@/store/novel'
import { t } from '../../i18n'
import type { INovelUnit } from '@shared/types/novel'

const novelStore = useNovelStore()
const { structure } = storeToRefs(novelStore)

const order = ref<'narrative' | 'chronological'>('narrative')
const activeThread = ref('')

const scenes = computed<INovelUnit[]>(() => {
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

/** Distinct subplot/thread lanes present in the manuscript. */
const threads = computed<string[]>(() =>
  [...new Set(scenes.value.map((s) => s.thread).filter((v): v is string => !!v))].sort()
)

// Chronological is a best-effort lexicographic sort on the free-text
// `when` field (ISO dates and "Day 12"-style labels both sort usefully);
// scenes without a `when` keep narrative order at the end. An active
// thread lane narrows the track to that subplot.
const orderedScenes = computed<INovelUnit[]>(() => {
  const inLane = activeThread.value
    ? scenes.value.filter((s) => s.thread === activeThread.value)
    : scenes.value
  if (order.value === 'narrative') return inLane
  const dated = inLane.filter((s) => s.when)
  const undated = inLane.filter((s) => !s.when)
  const sorted = [...dated].sort((a, b) =>
    String(a.when).localeCompare(String(b.when), undefined, { numeric: true })
  )
  return [...sorted, ...undated]
})

onMounted(() => {
  novelStore.refresh()
})

const saveWhen = (scene: INovelUnit, event: Event): void => {
  const when = (event.target as HTMLInputElement).value
  novelStore.updateUnit(scene.id, { when })
}

const showCardMenu = (event: MouseEvent, unit: INovelUnit): void => {
  popupContextMenu(
    [{ label: t('binder.open'), click: () => novelStore.openUnit(unit) }],
    { x: event.clientX, y: event.clientY }
  )
}
</script>

<style scoped>
.timeline-view {
  flex: 1;
  overflow-y: auto;
  padding: 40px 32px 32px;
  background: var(--editorBgColor);
}

.timeline-toolbar {
  display: flex;
  gap: 6px;
  margin-bottom: 18px;
  justify-content: center;
}

.order-chip {
  font: inherit;
  font-size: 11px;
  padding: 3px 12px;
  border-radius: 10px;
  border: 1px solid var(--itemBgColor);
  background: transparent;
  color: var(--iconColor);
  cursor: pointer;
  &:hover {
    color: var(--themeColor);
    border-color: var(--themeColor);
  }
  &.active {
    color: var(--themeColor);
    border-color: var(--themeColor);
    background: var(--itemBgColor);
    font-weight: 600;
  }
}

.timeline-track {
  max-width: 720px;
  margin: 0 auto;
}

.timeline-entry {
  display: grid;
  grid-template-columns: 120px 24px 1fr;
  gap: 10px;
  align-items: stretch;
}

.entry-when {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding-top: 8px;
}

.when-input {
  width: 100%;
  font: inherit;
  font-size: 11px;
  text-align: right;
  color: var(--iconColor);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 4px;
  outline: none;
  &:hover {
    border-color: var(--itemBgColor);
  }
  &:focus {
    border-color: var(--themeColor);
    color: var(--editorColor);
  }
  &::placeholder {
    color: var(--iconColor);
    opacity: 0.5;
    font-style: italic;
  }
}

.entry-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 12px;
}

.entry-dot {
  width: 10px;
  height: 10px;
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

.entry-line {
  flex: 1;
  width: 2px;
  background: var(--itemBgColor);
  margin-top: 2px;
}

.timeline-entry:last-child .entry-line {
  display: none;
}

.entry-card {
  margin-bottom: 14px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--itemBgColor);
  background: var(--floatBgColor, var(--itemBgColor));
  cursor: pointer;
  &:hover {
    border-color: var(--themeColor);
  }
}

.entry-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--editorColor);
}

.entry-meta {
  font-size: 11px;
  color: var(--iconColor);
  display: flex;
  gap: 4px;
}

.entry-thread {
  margin-left: auto;
  padding: 0 8px;
  border-radius: 8px;
  background: var(--itemBgColor);
  color: var(--themeColor, var(--wbInfoColor));
  font-size: 10px;
  line-height: 16px;
}

.thread-select {
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

.entry-synopsis {
  font-size: 12px;
  color: var(--editorColor);
  opacity: 0.8;
  margin-top: 4px;
  line-height: 1.45;
}

.timeline-empty {
  color: var(--iconColor);
  font-size: 13px;
  text-align: center;
  margin-top: 80px;
}
</style>
