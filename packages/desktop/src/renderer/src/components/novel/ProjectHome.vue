<template>
  <!-- The center pane for an open project with nothing open: previously
       rendered NOTHING (blank editor area) — the worst first-run moment. -->
  <div class="project-home">
    <empty-state
      icon="🐦"
      :title="projectName"
      :hint="isEmpty ? t('empty.projectHomeHint') : t('empty.projectHomeResumeHint', manuscriptTally)"
    >
      <div class="home-actions">
        <button
          v-if="isEmpty"
          class="home-action home-action--primary"
          @click="createFirstUnit"
        >
          {{ t('empty.projectHomeCreate') }}
        </button>
        <button
          v-else-if="lastScene"
          class="home-action home-action--primary"
          @click="openScene(lastScene)"
        >
          {{ t('empty.projectHomeResume', { title: lastScene.title }) }}
        </button>
        <!-- "Ask Biscuit to set it up" only makes sense before there is
             anything to set up; on a working manuscript Biscuit is one
             click away in the right panel. -->
        <button
          v-if="isEmpty"
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
import type { INovelUnit } from '@shared/types/novel'

const novelStore = useNovelStore()
const projectStore = useProjectStore()

const projectName = computed(
  () => (projectStore.projectTree as { name?: string } | null)?.name ?? 'WordBird'
)

/**
 * This pane shows whenever no file is open — which is NOT the same as an
 * empty project. Closing every tab on a finished novel used to land the
 * writer on "A fresh manuscript. Create your first chapter." So the copy
 * branches on what the binder actually holds, and a populated project gets
 * a way back into the prose instead of an invitation to start over.
 */
const prose = computed<INovelUnit[]>(() => {
  const leaves: INovelUnit[] = []
  const walk = (units: INovelUnit[]): void => {
    for (const unit of units) {
      if (unit.children?.length) walk(unit.children)
      else if (unit.path) leaves.push(unit)
    }
  }
  walk(novelStore.structure?.units ?? [])
  return leaves
})

const isEmpty = computed(() => prose.value.length === 0)

/** Binder order is composition order, so the last leaf is the working edge. */
const lastScene = computed<INovelUnit | null>(
  () => prose.value[prose.value.length - 1] ?? null
)

const manuscriptTally = computed(() => ({
  scenes: prose.value.length,
  words: novelStore.totalWordCount
}))

const openScene = (unit: INovelUnit): void => {
  const root = projectStore.currentProjectPath
  if (!root || !unit.path) return
  window.electron.ipcRenderer.send('mt::open-file', window.path.join(root, unit.path), {})
}

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
