<template>
  <div class="plan-card">
    <div class="plan-card__title">
      📋 {{ plan.title }}
    </div>
    <!-- eslint-disable vue/no-v-html -- sanitized by DOMPurify in renderChatMarkdown -->
    <div
      class="plan-card__body"
      v-html="renderChatMarkdown(plan.content)"
    />
    <!-- eslint-enable vue/no-v-html -->
    <div class="plan-card__path">
      {{ plan.path }}
    </div>
    <div class="plan-card__actions">
      <el-button
        size="small"
        @click="$emit('dismiss')"
      >
        {{ t('biscuit.planLater') }}
      </el-button>
      <el-button
        size="small"
        @click="$emit('approve', 'approvals')"
      >
        {{ t('biscuit.planApproveAsk') }}
      </el-button>
      <el-button
        size="small"
        type="primary"
        @click="$emit('approve', 'auto')"
      >
        {{ t('biscuit.planApproveAuto') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { renderChatMarkdown } from '../../util/chatMarkdown'
import { t } from '../../i18n'
import type { IPlanProposal } from '@shared/types/langgraph'

defineProps<{ plan: IPlanProposal }>()
defineEmits<{
  (e: 'approve', mode: 'approvals' | 'auto'): void
  (e: 'dismiss'): void
}>()
</script>

<style scoped>
.plan-card {
  border: 1px solid var(--themeColor, #409eff);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--floatBgColor, rgba(64, 158, 255, 0.05));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan-card__title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--themeColor, #409eff);
}

.plan-card__body {
  font-size: 0.8rem;
  max-height: 260px;
  overflow-y: auto;
  color: var(--editorColor, #303133);
  & :deep(p) {
    margin: 0 0 0.5em;
  }
  & :deep(ul),
  & :deep(ol) {
    margin: 0.3em 0 0.6em;
    padding-left: 1.4em;
  }
  & :deep(h1),
  & :deep(h2),
  & :deep(h3) {
    font-size: 0.85rem;
    margin: 0.5em 0 0.3em;
  }
  & :deep(code) {
    font-size: 0.72rem;
    background: var(--itemBgColor, rgba(128, 128, 128, 0.12));
    padding: 1px 4px;
    border-radius: 3px;
  }
}

.plan-card__path {
  font-size: 0.68rem;
  color: var(--iconColor, #909399);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.plan-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
