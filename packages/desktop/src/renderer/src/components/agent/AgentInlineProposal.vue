<template>
  <div
    v-if="visibleProposals.length > 0"
    class="agent-inline-proposals"
    aria-label="Agent edit proposals"
  >
    <!-- Compact header with summary and actions -->
    <div class="agent-inline-proposal__header">
      <div class="agent-inline-proposal__summary">
        <span class="agent-inline-proposal__icon">✏️</span>
        <div class="agent-inline-proposal__info">
          <strong>{{ visibleProposals.length }} pending edit{{ visibleProposals.length > 1 ? 's' : '' }}</strong>
          <span
            v-if="visibleProposals[0].start && visibleProposals[0].end"
            class="agent-inline-proposal__range"
          >
            in {{ visibleProposals[0].filePath }}
          </span>
        </div>
      </div>
      <div class="agent-inline-proposal__actions">
        <el-button
          type="success"
          size="small"
          :loading="isApplying"
          @click="applyAllEdits"
        >
          Apply All
        </el-button>
        <el-button
          type="danger"
          size="small"
          @click="rejectAllEdits"
        >
          Reject All
        </el-button>
        <el-button
          type="text"
          size="small"
          @click="toggleDiffView"
        >
          {{ showDiffView ? 'Hide' : 'Show' }} Diff
        </el-button>
      </div>
    </div>

    <!-- Optional detailed diff view -->
    <div
      v-if="showDiffView"
      class="agent-inline-proposal__details"
    >
      <div
        v-for="proposal in visibleProposals"
        :key="proposal.id"
        class="agent-inline-proposal"
      >
        <div
          v-if="proposal.reason"
          class="agent-inline-proposal__reason"
        >
          {{ proposal.reason }}
        </div>
        <AgentDiffView
          :old-content="proposal.oldContent"
          :new-content="proposal.newContent"
          compact
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AgentDiffView from './AgentDiffView.vue'
import { useAgentStore, type AgentEditReview } from '@/store/agent'
import { applyAgentEdit, rejectAgentEdit } from '@/services/agentEdit'

const agentStore = useAgentStore()
const { pendingEdits, isApplying } = storeToRefs(agentStore)

const showDiffView = ref(true)

const visibleProposals = computed<AgentEditReview[]>(() =>
  pendingEdits.value.filter((edit) => edit.status === 'pending')
)

function toggleDiffView (): void {
  showDiffView.value = !showDiffView.value
}

async function applyAllEdits (): Promise<void> {
  isApplying.value = true
  try {
    // Apply edits in reverse order to maintain line numbers
    for (const edit of [...visibleProposals.value].reverse()) {
      await applyAgentEdit(edit)
    }
    // Clear diff state after applying
    agentStore.clearPendingEdits()
  } finally {
    isApplying.value = false
  }
}

async function rejectAllEdits (): Promise<void> {
  // Reject edits in reverse order
  for (const edit of [...visibleProposals.value].reverse()) {
    await rejectAgentEdit(edit.id)
  }
  // Clear diff state after rejecting
  agentStore.clearPendingEdits()
}
</script>

<style scoped>
.agent-inline-proposals {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(100, 150, 200, 0.3);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(60, 120, 200, 0.08), rgba(80, 140, 220, 0.05));
  box-shadow: 0 4px 12px rgba(60, 120, 200, 0.15);
  margin-bottom: 8px;
}

.agent-inline-proposal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.agent-inline-proposal__summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.agent-inline-proposal__icon {
  font-size: 16px;
  opacity: 0.8;
}

.agent-inline-proposal__info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.agent-inline-proposal__info strong {
  color: var(--editorColor02);
  font-size: 13px;
}

.agent-inline-proposal__range {
  color: rgba(127, 127, 127, 0.8);
  font-size: 12px;
}

.agent-inline-proposal__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.agent-inline-proposal__details {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(127, 127, 127, 0.15);
}

.agent-inline-proposal {
  width: 100%;
}

.agent-inline-proposal__reason {
  margin-bottom: 6px;
  color: rgba(127, 127, 127, 0.9);
  font-size: 12px;
  font-style: italic;
  padding: 4px 8px;
  background: rgba(127, 127, 127, 0.05);
  border-radius: 4px;
}
</style>
