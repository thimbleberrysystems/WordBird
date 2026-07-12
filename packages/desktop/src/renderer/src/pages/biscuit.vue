<template>
  <div class="biscuit-window">
    <right-prompt detached />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import RightPrompt from '@/components/rightPrompt/RightPrompt.vue'
import { useProjectStore } from '@/store/project'
import { addThemeStyle } from '@/util/theme'

/**
 * Detached Biscuit window: full-window chat. The opener passes the live
 * conversation id and project root as query params so this window
 * CONTINUES the conversation (instead of starting fresh like File → New
 * Window does) and keeps transcript mirroring + snapshots working.
 */
const params = new URLSearchParams(window.location.search)
const conversationId = params.get('conv')
const projectRoot = params.get('root')

// Claim the conversation BEFORE RightPrompt initializes its history.
if (conversationId) {
  sessionStorage.setItem('biscuit-window-conversation', conversationId)
}

const projectStore = useProjectStore()
if (projectRoot) {
  projectStore.ADOPT_PROJECT_PATH(projectRoot)
}

// Match the app theme (passed as a query param at open time).
onMounted(() => {
  const initialTheme = params.get('theme')
  if (initialTheme) addThemeStyle(initialTheme)
})
</script>

<style scoped>
.biscuit-window {
  height: 100vh;
  display: flex;
  overflow: hidden;
  background: var(--editorBgColor, #fff);
}

.biscuit-window :deep(.right-prompt) {
  width: 100% !important;
  flex: 1 1 auto !important;
  max-width: none;
  border-left: none;
}
</style>
