<template>
  <div class="agents-panel">
    <div class="agents-header">
      <span class="agents-title">{{ t('biscuit.agentsTitle') }}</span>
      <span
        v-if="runState !== 'idle'"
        class="agents-state"
        :class="`agents-state--${runState}`"
      >{{ runState === 'paused' ? t('biscuit.pausedShort') : t('biscuit.agentsRunning', { count: String(runningCount) }) }}</span>
    </div>

    <div class="agents-body">
      <agent-tree
        :agents="agentList"
        :activity="activity"
        :run-state="runState"
        @cancel="agentsStore.cancelAgent"
        @retry="agentsStore.retryTask"
        @pause-agent="agentsStore.pauseAgent"
        @resume-agent="agentsStore.resumeAgent"
        @pause-all="agentsStore.pauseAll"
        @resume-all="agentsStore.resumeAll"
        @stop-all="agentsStore.stopAll"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAgentsStore } from '@/store/agents'
import AgentTree from '../rightPrompt/AgentTree.vue'
import { t } from '../../i18n'

const agentsStore = useAgentsStore()
const { agentList, activity, runState, runningCount } = storeToRefs(agentsStore)

onMounted(() => {
  agentsStore.init()
})
</script>

<style scoped>
.agents-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.agents-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 30px 12px 8px 12px;
  border-bottom: 1px solid var(--itemBgColor);
}

.agents-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--sideBarColor));
}

.agents-state {
  font-size: 11px;
  color: var(--iconColor);
}

.agents-state--running {
  color: var(--themeColor, var(--wbInfoColor));
}

.agents-state--paused {
  color: var(--wbWarningColor);
}

.agents-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}

/* The tree fills the sidebar rather than a 320px popover. */
.agents-body :deep(.agent-tree) {
  max-height: none;
  font-size: 0.8rem;
}
</style>
