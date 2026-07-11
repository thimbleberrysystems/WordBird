<template>
  <div class="view-switcher">
    <button
      v-for="option in options"
      :key="option.id"
      class="view-chip"
      :class="{ active: viewMode === option.id }"
      @click="novelStore.setViewMode(option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useNovelStore, type NovelViewMode } from '@/store/novel'
import { t } from '../../i18n'

const novelStore = useNovelStore()
const { viewMode } = storeToRefs(novelStore)

const options: Array<{ id: NovelViewMode; label: string }> = [
  { id: 'page', label: t('views.page') },
  { id: 'corkboard', label: t('views.corkboard') },
  { id: 'outline', label: t('views.outline') }
]
</script>

<style scoped>
.view-switcher {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 12px;
  background: var(--floatBgColor, var(--itemBgColor));
  border: 1px solid var(--itemBgColor);
  z-index: 20;
  opacity: 0.35;
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
