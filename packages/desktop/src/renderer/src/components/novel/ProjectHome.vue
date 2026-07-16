<template>
  <!-- The center pane for an open project with nothing open: previously
       rendered NOTHING (blank editor area) — the worst first-run moment. -->
  <div class="project-home">
    <empty-state
      icon="🐦"
      :title="projectName"
      :hint="t('empty.projectHomeHint')"
    >
      <div class="home-actions">
        <button
          class="home-action home-action--primary"
          @click="createFirstUnit"
        >
          {{ t('empty.projectHomeCreate') }}
        </button>
        <button
          class="home-action"
          @click="askBiscuit"
        >
          {{ t('empty.projectHomeAsk') }}
        </button>
      </div>
    </empty-state>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNovelStore } from '@/store/novel'
import { useProjectStore } from '@/store/project'
import EmptyState from '../common/EmptyState.vue'
import bus from '../../bus'
import { t } from '../../i18n'

const novelStore = useNovelStore()
const projectStore = useProjectStore()

const projectName = computed(
  () => (projectStore.projectTree as { name?: string } | null)?.name ?? 'WordBird'
)

const createFirstUnit = async (): Promise<void> => {
  const type = novelStore.flavor === 'scene-pool' ? 'scene' : 'chapter'
  await novelStore.createUnit({
    parentId: null,
    type,
    title: t(type === 'scene' ? 'binder.newSceneTitle' : 'binder.newChapterTitle')
  })
}

const askBiscuit = (): void => {
  bus.emit('biscuit-ask', t('empty.projectHomeAskPrompt'))
}
</script>

<style scoped>
.project-home {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.home-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.home-action {
  font: inherit;
  font-size: 13px;
  padding: 6px 16px;
  border-radius: 16px;
  border: 1px solid var(--itemBgColor);
  background: transparent;
  color: var(--editorColor);
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    border-color: var(--themeColor);
    color: var(--themeColor);
  }
}

.home-action--primary {
  border-color: var(--themeColor);
  background: var(--themeColor);
  color: var(--buttonFontColor, #fff);
  &:hover {
    opacity: 0.9;
    color: var(--buttonFontColor, #fff);
  }
}
</style>
