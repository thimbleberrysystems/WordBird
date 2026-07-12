<template>
  <div class="agent-tree">
    <!-- Root: the supervisor. Pausing/killing here affects the whole run. -->
    <div class="tree-row tree-row--root">
      <span
        class="agent-dot"
        :class="rootDotClass"
      />
      <span class="agent-name">Biscuit</span>
      <span class="agent-meta">{{ rootMeta }}</span>
      <template v-if="runState !== 'idle'">
        <button
          v-if="runState === 'running'"
          class="row-btn"
          :title="t('biscuit.pause')"
          @click="$emit('pause-all')"
        >
          ⏸
        </button>
        <button
          v-else
          class="row-btn row-btn--accent"
          :title="t('biscuit.resume')"
          @click="$emit('resume-all')"
        >
          ▶
        </button>
        <button
          class="row-btn row-btn--danger"
          :title="t('biscuit.stopAll')"
          @click="$emit('stop-all')"
        >
          ✕
        </button>
      </template>
    </div>

    <!-- Children: one row per sub-agent, expandable to task + tool use. -->
    <div
      v-for="agent in agents"
      :key="agent.agentId"
      class="tree-child"
    >
      <div class="tree-row">
        <button
          class="chevron"
          :title="t('biscuit.agentDetails')"
          @click="toggle(agent.agentId)"
        >
          {{ expanded.has(agent.agentId) ? '▾' : '▸' }}
        </button>
        <span
          class="agent-dot"
          :class="dotClass(agent)"
        />
        <span
          class="agent-name"
          :title="agent.task"
        >{{ roleName(agent.role) }}</span>
        <span class="agent-meta">
          <template v-if="agent.toolCalls > 0">{{ agent.toolCalls }}🔧 · </template>{{ elapsed(agent) }}
        </span>
        <template v-if="agent.status === 'running'">
          <button
            v-if="!agent.paused"
            class="row-btn"
            :title="t('biscuit.pauseAgent')"
            @click="$emit('pause-agent', agent.agentId)"
          >
            ⏸
          </button>
          <button
            v-else
            class="row-btn row-btn--accent"
            :title="t('biscuit.resumeAgent')"
            @click="$emit('resume-agent', agent.agentId)"
          >
            ▶
          </button>
          <button
            class="row-btn row-btn--danger"
            :title="t('biscuit.cancelAgent')"
            @click="$emit('cancel', agent.agentId)"
          >
            ✕
          </button>
        </template>
        <button
          v-else-if="agent.status === 'failed' || agent.status === 'cancelled'"
          class="row-btn"
          :title="t('biscuit.retryAgent')"
          @click="$emit('retry', agent.task)"
        >
          ↻
        </button>
      </div>

      <div
        v-if="expanded.has(agent.agentId)"
        class="tree-detail"
      >
        <div class="detail-task">
          {{ agent.task }}
        </div>
        <div
          v-for="(tool, i) in agent.recentTools ?? []"
          :key="i"
          class="detail-tool"
        >
          {{ tool }}
        </div>
      </div>
    </div>

    <div
      v-if="agents.length === 0 && runState === 'idle'"
      class="tree-empty"
    >
      {{ t('biscuit.noAgents') }}
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { AGENT_ROLE_NAMES } from './agentRoleNames'
import { t } from '../../i18n'
import type { IAgentStatus, IAgentActivityEvent, AgentRole } from '@shared/types/langgraph'

const props = defineProps<{
  agents: IAgentStatus[]
  activity: IAgentActivityEvent[]
  runState: 'idle' | 'running' | 'paused'
}>()

defineEmits<{
  (e: 'cancel', agentId: string): void
  (e: 'retry', task: string): void
  (e: 'pause-agent', agentId: string): void
  (e: 'resume-agent', agentId: string): void
  (e: 'pause-all'): void
  (e: 'resume-all'): void
  (e: 'stop-all'): void
}>()

const roleName = (role: AgentRole): string => AGENT_ROLE_NAMES[role] ?? role

const expanded = ref(new Set<string>())
const toggle = (agentId: string): void => {
  const next = new Set(expanded.value)
  if (next.has(agentId)) next.delete(agentId)
  else next.add(agentId)
  expanded.value = next
}

const rootDotClass = computed(() => {
  if (props.runState === 'running') return 'agent-dot--running'
  if (props.runState === 'paused') return 'agent-dot--paused'
  return 'agent-dot--idle'
})

const rootMeta = computed(() => {
  const running = props.agents.filter((a) => a.status === 'running').length
  if (props.runState === 'paused') return t('biscuit.pausedShort')
  if (props.runState === 'running') {
    return running > 0 ? t('biscuit.agentsRunning', { count: String(running) }) : t('biscuit.thinkingShort')
  }
  return t('biscuit.idle')
})

const dotClass = (agent: IAgentStatus): string => {
  if (agent.status === 'running' && (agent.paused || props.runState === 'paused')) {
    return 'agent-dot--paused'
  }
  return `agent-dot--${agent.status}`
}

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
.agent-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.75rem;
  color: var(--editorColor, #303133);
  max-height: 320px;
  overflow-y: auto;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.tree-row--root {
  font-weight: 600;
}

.tree-child {
  margin-left: 10px;
  padding-left: 8px;
  border-left: 1px solid var(--itemBgColor, rgba(128, 128, 128, 0.25));
}

.chevron {
  font: inherit;
  font-size: 0.7rem;
  border: none;
  background: transparent;
  color: var(--iconColor, var(--wbMutedColor));
  cursor: pointer;
  padding: 0;
  width: 12px;
  flex-shrink: 0;
}

.agent-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.agent-dot--running {
  background: var(--themeColor, var(--wbInfoColor));
  animation: agent-pulse 1.2s infinite ease-in-out;
}

.agent-dot--paused {
  background: var(--wbWarningColor);
}

.agent-dot--idle {
  background: var(--iconColor, var(--wbMutedColor));
  opacity: 0.5;
}

.agent-dot--done {
  background: var(--wbSuccessColor);
}

.agent-dot--failed {
  background: var(--wbErrorColor);
}

.agent-dot--cancelled {
  background: var(--iconColor, var(--wbMutedColor));
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
  color: var(--iconColor, var(--wbMutedColor));
  flex-shrink: 0;
}

.row-btn {
  font: inherit;
  font-size: 0.72rem;
  border: none;
  background: transparent;
  color: var(--iconColor, var(--wbMutedColor));
  cursor: pointer;
  padding: 0 3px;
  flex-shrink: 0;
  &:hover {
    color: var(--themeColor, var(--wbInfoColor));
  }
}

.row-btn--danger:hover {
  color: var(--wbErrorColor);
}

.row-btn--accent {
  color: var(--wbWarningColor);
}

.tree-detail {
  margin: 0 0 4px 18px;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--itemBgColor, rgba(128, 128, 128, 0.08));
  font-size: 0.7rem;
}

.detail-task {
  color: var(--editorColor, #303133);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 3px;
}

.detail-tool {
  color: var(--iconColor, var(--wbMutedColor));
  padding-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-empty {
  color: var(--iconColor, var(--wbMutedColor));
  padding: 4px 0;
}

.agent-log {
  margin-top: 6px;
  font-size: 0.68rem;
  color: var(--iconColor, var(--wbMutedColor));
  & summary {
    cursor: pointer;
    user-select: none;
    &:hover {
      color: var(--themeColor, var(--wbInfoColor));
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
