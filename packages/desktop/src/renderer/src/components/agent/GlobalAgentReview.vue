<template>
  <div
    v-if="pendingCount > 0"
    class="global-agent-review"
    aria-label="Pending AI edits"
  >
    <span class="global-agent-review__label">
      {{ pendingCount }} pending edit{{ pendingCount > 1 ? 's' : '' }}
    </span>
    <div class="global-agent-review__actions">
      <button
        class="global-agent-review__btn global-agent-review__btn--accept"
        @click="applyAll"
      >
        Apply All
      </button>
      <button
        class="global-agent-review__btn global-agent-review__btn--discard"
        @click="discardAll"
      >
        Discard All
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAgentStore } from '@/store/agent'
import bus from '@/bus'

const agentStore = useAgentStore()
const { pendingCount } = storeToRefs(agentStore)

function applyAll (): void {
  bus.emit('agent-apply-all')
}

function discardAll (): void {
  bus.emit('agent-discard-all')
}
</script>

<style scoped>
.global-agent-review {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  margin: 0 8px 8px;
  border: 1px solid rgba(100, 150, 200, 0.3);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(60, 120, 200, 0.1), rgba(80, 140, 220, 0.06));
}

.global-agent-review__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--editorColor, #444);
  flex: 1;
}

.global-agent-review__actions {
  display: flex;
  gap: 14px;
}

.global-agent-review__btn {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.global-agent-review__btn:hover {
  opacity: 0.7;
}

.global-agent-review__btn--accept {
  color: #28a745;
}

.global-agent-review__btn--discard {
  color: var(--editorColor, #888);
}
</style>
