<template>
  <div class="view-switcher">
    <button
      v-for="option in options"
      :key="option.id"
      class="view-chip"
      :class="{ active: viewMode === option.id }"
      :title="option.tip()"
      @click="novelStore.setViewMode(option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useNovelStore, type NovelViewMode } from '@/store/novel'
import { t } from '../../i18n'

const novelStore = useNovelStore()
const { viewMode } = storeToRefs(novelStore)

const options: Array<{ id: NovelViewMode; label: string; tip: () => string }> = [
  { id: 'page', label: t('views.page'), tip: () => `${t('views.pageTip')} (Ctrl+Shift+1)` },
  { id: 'corkboard', label: t('views.corkboard'), tip: () => `${t('views.corkboardTip')} (Ctrl+Shift+2)` },
  { id: 'outline', label: t('views.outline'), tip: () => `${t('views.outlineTip')} (Ctrl+Shift+3)` },
  { id: 'timeline', label: t('views.timeline'), tip: () => `${t('views.timelineTip')} (Ctrl+Shift+4)` }
]

// Ctrl/Cmd+Shift+1..4 switches views (Ctrl+1.. = tab switching, Ctrl+Alt+1..
// = headings — both taken). Registered only while a project is open, since
// this component mounts only then.
const onKeydown = (event: KeyboardEvent): void => {
  if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return
  const index = ['1', '2', '3', '4'].indexOf(event.key)
  // Some layouts report shifted digits ("!", "@"…) — fall back to the code.
  const codeIndex = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code)
  const pick = index !== -1 ? index : codeIndex
  if (pick === -1) return
  event.preventDefault()
  novelStore.setViewMode(options[pick].id)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.view-switcher {
  /* Positioned by the parent (title bar) — it used to float over the tab
     strip and collided with the tabs once enough files were open. */
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 12px;
  background: var(--floatBgColor, var(--itemBgColor));
  border: 1px solid var(--itemBgColor);
  opacity: 0.75;
  transition: opacity 0.2s;
  &:hover {
    opacity: 1;
  }
}

.view-chip {
  font: inherit;
  font-size: 11px;
  padding: 2px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--iconColor);
  cursor: pointer;
  &:hover {
    color: var(--themeColor);
  }
  &.active {
    background: var(--itemBgColor);
    color: var(--themeColor);
    font-weight: 600;
  }
}
</style>
