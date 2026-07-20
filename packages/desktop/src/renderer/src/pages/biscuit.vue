<template>
  <div class="biscuit-window">
    <right-prompt detached />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import RightPrompt from '@/components/rightPrompt/RightPrompt.vue'
import { useProjectStore } from '@/store/project'
import { usePreferencesStore } from '@/store/preferences'
import { mirrorAiConnectionState } from '@/services/langgraph'
import { addThemeStyle } from '@/util/theme'
import { initAgentReviewFallback } from '@/services/agentReviewFallback'

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
onMounted(async () => {
  // The detached window has no editor — the fallback ingests proposals
  // and drives review actions disk-only, so the queue works here too.
  initAgentReviewFallback()
  const initialTheme = params.get('theme')
  if (initialTheme) addThemeStyle(initialTheme)

  // This window opens AFTER the provider connected, so the connect
  // broadcast never reached it — pull the current state, keep following
  // transitions, and load preferences (AI configs) so reconnects work here
  // too. Without this the detached chat believed it was disconnected.
  const preferencesStore = usePreferencesStore()
  preferencesStore.ASK_FOR_USER_PREFERENCE()
  await mirrorAiConnectionState(preferencesStore)
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
