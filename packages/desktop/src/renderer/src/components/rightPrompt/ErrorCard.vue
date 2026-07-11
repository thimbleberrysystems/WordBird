<template>
  <div class="error-card">
    <div class="error-card__title">
      <el-icon><WarningFilled /></el-icon>
      {{ title || t('biscuit.errorTitleGeneric') }}
    </div>
    <div class="error-card__explain">
      {{ explanation || t('biscuit.errorExplainGeneric') }}
    </div>
    <details class="error-card__details">
      <summary>{{ t('biscuit.errorDetails') }}</summary>
      <code>{{ content }}</code>
    </details>
    <div
      v-if="showSettings"
      class="error-card__actions"
    >
      <el-button
        size="small"
        type="primary"
        plain
        @click="$emit('open-settings')"
      >
        {{ t('biscuit.openSettings') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { WarningFilled } from '@element-plus/icons-vue'
import { t } from '../../i18n'

defineProps<{
  content: string
  title?: string
  explanation?: string
  showSettings?: boolean
}>()
defineEmits<{ (e: 'open-settings'): void }>()
</script>

<style scoped>
.error-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 4px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(245, 108, 108, 0.35);
  background: rgba(245, 108, 108, 0.07);
}

.error-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #f56c6c;
}

.error-card__explain {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--editorColor, #303133);
}

.error-card__details {
  font-size: 0.7rem;
  color: var(--iconColor, #909399);
  & summary {
    cursor: pointer;
    user-select: none;
    &:hover {
      color: var(--themeColor, #409eff);
    }
  }
  & code {
    display: block;
    margin-top: 4px;
    padding: 6px 8px;
    border-radius: 4px;
    background: var(--itemBgColor, rgba(128, 128, 128, 0.08));
    word-break: break-word;
    white-space: pre-wrap;
    font-size: 0.68rem;
  }
}

.error-card__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
