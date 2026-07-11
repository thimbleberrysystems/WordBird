<template>
  <div class="continuity">
    <div class="continuity-header">
      <span class="continuity-title">{{ t('continuity.title') }}</span>
      <span
        v-if="openIssues.length > 0"
        class="continuity-count"
      >{{ openIssues.length }}</span>
    </div>

    <div class="issue-list">
      <div
        v-for="issue in openIssues"
        :key="issue.id"
        class="issue-item"
      >
        <div class="issue-top">
          <span
            class="severity-dot"
            :class="issue.severity"
            :title="issue.severity"
          />
          <span class="issue-title">{{ issue.title }}</span>
          <el-button
            class="issue-resolve"
            size="small"
            text
            :title="t('continuity.resolve')"
            @click="resolve(issue)"
          >
            <el-icon><Check /></el-icon>
          </el-button>
        </div>
        <div class="issue-desc">
          {{ issue.description }}
        </div>
        <div
          v-if="issue.relatedPaths.length > 0"
          class="issue-files"
        >
          {{ issue.relatedPaths.join(', ') }}
        </div>
      </div>
      <p
        v-if="openIssues.length === 0"
        class="continuity-empty"
      >
        {{ t('continuity.empty') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { useProjectStore } from '@/store/project'
import { useLayoutStore } from '@/store/layout'
import { t } from '../../i18n'
import type { IContinuityIssue } from '@shared/types/novel'

const projectStore = useProjectStore()
const layoutStore = useLayoutStore()

const issues = ref<IContinuityIssue[]>([])

const openIssues = computed(() =>
  [...issues.value.filter((i) => i.status === 'open')].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 }
    return rank[a.severity] - rank[b.severity]
  })
)

const refresh = async (): Promise<void> => {
  const root = projectStore.currentProjectPath
  if (!root) {
    issues.value = []
    return
  }
  const result = await window.electron.novel.continuityIssues(root)
  issues.value = result.ok && result.issues ? result.issues : []
}

onMounted(refresh)
watch(() => projectStore.currentProjectPath, refresh)
watch(
  () => layoutStore.rightColumn,
  (column) => {
    if (column === 'continuity') refresh()
  }
)

const resolve = async (issue: IContinuityIssue): Promise<void> => {
  const root = projectStore.currentProjectPath
  if (!root) return
  const result = await window.electron.novel.resolveIssue(root, issue.id)
  if (result.ok) {
    await refresh()
  } else {
    ElMessage.error(result.error ?? 'Could not resolve issue')
  }
}
</script>

<style scoped>
.continuity {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.continuity-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 30px 12px 8px 12px;
  border-bottom: 1px solid var(--itemBgColor);
}

.continuity-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--sideBarColor));
}

.continuity-count {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--itemBgColor);
  color: var(--themeColor);
  font-weight: 600;
}

.issue-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.issue-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--itemBgColor);
  &:hover .issue-resolve {
    opacity: 1;
  }
}

.issue-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.severity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  &.high {
    background: #f56c6c;
  }
  &.medium {
    background: #e6a23c;
  }
  &.low {
    background: var(--iconColor);
  }
}

.issue-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--sideBarColor);
}

.issue-resolve {
  opacity: 0;
  color: #67c23a;
  padding: 0 4px;
}

.issue-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--sideBarColor);
  opacity: 0.85;
  white-space: pre-wrap;
}

.issue-files {
  font-size: 10px;
  color: var(--iconColor);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.continuity-empty {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--iconColor);
}
</style>
