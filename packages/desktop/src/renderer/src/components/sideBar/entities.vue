<template>
  <div class="entities-panel">
    <div class="entities-header">
      <span class="entities-title">{{ t('entities.title') }}</span>
      <span class="entities-count">{{ entities.length }}</span>
    </div>

    <div class="entities-body">
      <div
        v-for="entity in sorted"
        :key="entity.page"
        class="entity"
      >
        <div
          class="entity-row"
          @click="toggle(entity.page)"
        >
          <span class="entity-chevron">{{ expanded.has(entity.page) ? '▾' : '▸' }}</span>
          <span class="entity-name">{{ entity.name }}</span>
          <span
            v-if="totalMentions(entity) > 0"
            class="entity-mentions"
          >{{ totalMentions(entity) }}</span>
          <span
            v-else
            class="entity-unseen"
          >{{ t('entities.notInProse') }}</span>
        </div>
        <div
          v-if="expanded.has(entity.page)"
          class="entity-detail"
        >
          <div
            v-if="entity.aliases.length > 0"
            class="entity-aliases"
          >
            {{ t('entities.aliases') }}: {{ entity.aliases.join(', ') }}
          </div>
          <div
            v-for="appearance in entity.appearances"
            :key="appearance.unitId"
            class="entity-appearance"
            @click="openScene(appearance.unitId)"
          >
            <span class="appearance-title">{{ appearance.title }}</span>
            <span class="appearance-count">×{{ appearance.count }}</span>
          </div>
          <div
            class="entity-page"
            @click="openBiblePage(entity.page)"
          >
            {{ t('entities.openPage') }}
          </div>
        </div>
      </div>

      <p
        v-if="entities.length === 0"
        class="entities-empty"
      >
        {{ t('entities.empty') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useProjectStore } from '@/store/project'
import { useNovelStore } from '@/store/novel'
import { t } from '../../i18n'

interface EntityEntry {
  name: string
  aliases: string[]
  page: string
  appearances: Array<{ unitId: string; title: string; path: string; count: number }>
}

const projectStore = useProjectStore()
const novelStore = useNovelStore()

const entities = ref<EntityEntry[]>([])
const expanded = ref(new Set<string>())

const sorted = computed(() =>
  [...entities.value].sort((a, b) => totalMentions(b) - totalMentions(a))
)

const totalMentions = (entity: EntityEntry): number =>
  entity.appearances.reduce((sum, a) => sum + a.count, 0)

const toggle = (page: string): void => {
  const next = new Set(expanded.value)
  if (next.has(page)) next.delete(page)
  else next.add(page)
  expanded.value = next
}

const refresh = async (): Promise<void> => {
  const root = projectStore.currentProjectPath
  if (!root) {
    entities.value = []
    return
  }
  try {
    const index = await window.electron.novel.entityIndex(root)
    entities.value = index.entities
  } catch {
    entities.value = []
  }
}

const openScene = (unitId: string): void => {
  const unit = findUnit(unitId)
  if (unit) novelStore.openUnit(unit)
}

const findUnit = (unitId: string) => {
  const walk = (
    units: Array<{ id: string; children?: unknown[] }>
  ): { id: string } | null => {
    for (const unit of units) {
      if (unit.id === unitId) return unit
      const found = unit.children ? walk(unit.children as never) : null
      if (found) return found
    }
    return null
  }
  return walk((novelStore.structure?.units ?? []) as never) as never
}

const openBiblePage = (page: string): void => {
  const root = projectStore.currentProjectPath
  if (!root) return
  window.electron.ipcRenderer.send('mt::open-file', window.path.join(root, page), {})
}

// Agents changing files re-broadcast; keep the index fresh.
let unsubProjectChanged: (() => void) | null = null

onMounted(() => {
  refresh()
  novelStore.refresh()
  unsubProjectChanged = window.electron.ai.onProjectChanged?.(() => refresh()) ?? null
})

onBeforeUnmount(() => {
  unsubProjectChanged?.()
})
</script>

<style scoped>
.entities-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.entities-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 30px 12px 8px 12px;
  border-bottom: 1px solid var(--itemBgColor);
}

.entities-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--sideBarColor));
}

.entities-count {
  font-size: 11px;
  color: var(--iconColor);
}

.entities-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 16px;
}

.entity-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--sideBarColor);
  &:hover {
    background: var(--itemBgColor);
  }
}

.entity-chevron {
  color: var(--iconColor);
  font-size: 10px;
  width: 12px;
}

.entity-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-mentions {
  font-size: 11px;
  color: var(--themeColor, var(--wbInfoColor));
}

.entity-unseen {
  font-size: 10px;
  color: var(--iconColor);
  font-style: italic;
}

.entity-detail {
  margin: 0 0 6px 18px;
  padding: 4px 8px;
  border-left: 2px solid var(--itemBgColor);
  font-size: 12px;
}

.entity-aliases {
  color: var(--iconColor);
  font-size: 11px;
  margin-bottom: 4px;
}

.entity-appearance {
  display: flex;
  justify-content: space-between;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--sideBarColor);
  &:hover {
    background: var(--itemBgColor);
    color: var(--themeColor);
  }
}

.appearance-count {
  color: var(--iconColor);
  font-size: 11px;
}

.entity-page {
  margin-top: 4px;
  color: var(--themeColor, var(--wbInfoColor));
  cursor: pointer;
  font-size: 11px;
  &:hover {
    text-decoration: underline;
  }
}

.entities-empty {
  color: var(--iconColor);
  font-size: 12px;
  text-align: center;
  margin-top: 40px;
  padding: 0 12px;
}
</style>
