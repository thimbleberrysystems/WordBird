<template>
  <div
    v-if="pendingCount > 0"
    class="global-agent-review"
    aria-label="Pending AI edits"
  >
    <div class="review-header">
      <span class="review-label">
        {{ pendingCount }} pending edit{{ pendingCount > 1 ? 's' : '' }}
      </span>
      <div class="review-actions">
        <button
          class="review-btn review-btn--accept"
          @click="applyAll"
        >
          Apply All
        </button>
        <button
          class="review-btn review-btn--discard"
          @click="discardAll"
        >
          Discard All
        </button>
      </div>
    </div>

    <!-- The queue: one card per edit, expandable diff, per-edit controls. -->
    <div class="review-queue">
      <div
        v-for="edit in pendingList"
        :key="edit.id"
        class="review-item"
      >
        <div
          class="item-row"
          @click="toggleExpand(edit.id)"
        >
          <span
            class="item-caret"
            :class="{ open: expandedId === edit.id }"
          >▸</span>
          <span
            class="item-file"
            :title="edit.filePath"
          >{{ basename(edit.filePath) }}</span>
          <span
            v-if="edit.reason"
            class="item-reason"
            :title="edit.reason"
          >{{ edit.reason }}</span>
          <span class="item-controls">
            <button
              class="review-btn review-btn--accept"
              title="Apply this edit"
              @click.stop="applyOne(edit.id)"
            >✓</button>
            <button
              class="review-btn review-btn--discard"
              title="Discard this edit"
              @click.stop="discardOne(edit.id)"
            >✗</button>
          </span>
        </div>
        <agent-diff-view
          v-if="expandedId === edit.id"
          :old-content="edit.oldContent"
          :new-content="edit.newContent"
          compact
          :max-lines="120"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAgentStore } from '@/store/agent'
import AgentDiffView from './AgentDiffView.vue'
import bus from '@/bus'

const agentStore = useAgentStore()
const { pendingCount, pendingEdits } = storeToRefs(agentStore)

const expandedId = ref<string | null>(null)

const pendingList = computed(() =>
  pendingEdits.value.filter((edit) => edit.status === 'pending')
)

const basename = (p: string): string => p.split(/[\\/]/).pop() || p

function toggleExpand (id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}

function applyAll (): void {
  bus.emit('agent-apply-all')
}

function discardAll (): void {
  bus.emit('agent-discard-all')
}

function applyOne (editId: string): void {
  bus.emit('agent-apply-one', editId)
}

function discardOne (editId: string): void {
  bus.emit('agent-discard-one', editId)
}
</script>

<style scoped>
.global-agent-review {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  margin: 0 8px 8px;
  border: 1px solid rgba(100, 150, 200, 0.3);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(60, 120, 200, 0.1), rgba(80, 140, 220, 0.06));
  max-height: 300px;
  overflow-y: auto;
}

.review-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.review-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--editorColor, #444);
  flex: 1;
}

.review-actions {
  display: flex;
  gap: 14px;
}

.review-btn {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.review-btn:hover {
  opacity: 0.7;
}

.review-btn--accept {
  color: #28a745;
}

.review-btn--discard {
  color: var(--editorColor, #888);
}

.review-queue {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.review-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 0;
}

.item-caret {
  color: var(--iconColor, #888);
  font-size: 10px;
  transition: transform 0.15s;
  flex-shrink: 0;
}

.item-caret.open {
  transform: rotate(90deg);
}

.item-file {
  font-weight: 600;
  color: var(--editorColor, #444);
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-reason {
  flex: 1;
  color: var(--iconColor, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.item-controls {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
</style>
