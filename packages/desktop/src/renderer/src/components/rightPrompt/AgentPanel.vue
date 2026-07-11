<template>
  <div
    v-if="agents.length > 0"
    class="agent-panel"
  >
    <div class="agent-panel__title">
      {{ t('biscuit.agentsTitle') }}
    </div>

    <div
      v-for="agent in agents"
      :key="agent.agentId"
      class="agent-row"
      :title="agent.task"
    >
      <span
        class="agent-dot"
        :class="`agent-dot--${agent.status}`"
      />
      <span class="agent-name">{{ roleName(agent.role) }}</span>
      <span class="agent-meta">
        <template v-if="agent.toolCalls > 0">{{ agent.toolCalls }}🔧 · </template>{{ elapsed(agent) }}
      </span>
      <button
        v-if="agent.status === 'running'"
        class="agent-cancel"
        :title="t('biscuit.cancelAgent')"
        @click="$emit('cancel', agent.agentId)"
      >
        ✕
      </button>
      <button
        v-else-if="agent.status === 'failed' || agent.status === 'cancelled'"
        class="agent-retry"
        :title="t('biscuit.retryAgent')"
        @click="$emit('retry', agent.task)"
      >
        ↻
      </button>
    </div>

    <details
      v-if="activity.length > 0"
      class="agent-log"
    >
      <summary>{{ t('biscuit.activityLog') }}</summary>
      <div
        v-for="item in activity"
        :key="item.id"
        class="log-line"
        :title="item.detail"
      >
        {{ item.label }}<span
          v-if="item.detail"
          class="log-detail"
        > — {{ item.detail }}</span>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { AGENT_ROLE_NAMES } from './agentRoleNames'
import { t } from '../../i18n'
import type { IAgentStatus, IAgentActivityEvent, AgentRole } from '@shared/types/langgraph'

defineProps<{
  agents: IAgentStatus[]
  activity: IAgentActivityEvent[]
}>()

defineEmits<{
  (e: 'cancel', agentId: string): void
  (e: 'retry', task: string): void
}>()

const roleName = (role: AgentRole): string => AGENT_ROLE_NAMES[role] ?? role

// 1s ticker so running agents show live elapsed time.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const elapsed = (agent: IAgentStatus): string => {
  const end = agent.endedAt ?? now.value
  const seconds = Math.max(0, Math.round((end - agent.startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`
}
</script>

<style scoped>
.agent-panel {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  margin: 0 4px;
  border: 1px solid var(--itemBgColor, rgba(128, 128, 128, 0.2));
  border-radius: 8px;
  background: var(--floatBgColor, transparent);
}

.agent-panel__title {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--iconColor, #909399);
  margin-bottom: 2px;
}

.agent-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--editorColor, #303133);
}

.agent-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.agent-dot--running {
  background: var(--themeColor, #409eff);
  animation: agent-pulse 1.2s infinite ease-in-out;
}

.agent-dot--done {
  background: #67c23a;
}

.agent-dot--failed {
  background: #f56c6c;
}

.agent-dot--cancelled {
  background: var(--iconColor, #909399);
}

@keyframes agent-pulse {
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
}

.agent-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-meta {
  font-size: 0.68rem;
  color: var(--iconColor, #909399);
  flex-shrink: 0;
}

.agent-retry {
  font: inherit;
  font-size: 0.78rem;
  border: none;
  background: transparent;
  color: var(--iconColor, #909399);
  cursor: pointer;
  padding: 0 3px;
  flex-shrink: 0;
  &:hover {
    color: var(--themeColor, #409eff);
  }
}

.agent-cancel {
  font: inherit;
  font-size: 0.72rem;
  border: none;
  background: transparent;
  color: var(--iconColor, #909399);
  cursor: pointer;
  padding: 0 3px;
  flex-shrink: 0;
  &:hover {
    color: #f56c6c;
  }
}

.agent-log {
  margin-top: 4px;
  font-size: 0.68rem;
  color: var(--iconColor, #909399);
  & summary {
    cursor: pointer;
    user-select: none;
    &:hover {
      color: var(--themeColor, #409eff);
    }
  }
}

.log-line {
  padding: 1px 0 1px 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-detail {
  opacity: 0.7;
}
</style>
