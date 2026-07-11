<template>
  <div class="history">
    <div class="history-header">
      <span class="history-title">{{ t('history.title') }}</span>
    </div>

    <div class="history-capture">
      <input
        v-model="snapshotName"
        class="capture-input"
        :placeholder="t('history.placeholder')"
        @keyup.enter="takeSnapshot"
      >
      <el-button
        size="small"
        text
        :loading="busy"
        @click="takeSnapshot"
      >
        {{ t('history.take') }}
      </el-button>
    </div>

    <div class="history-list">
      <div
        v-for="snap in snapshots"
        :key="snap.id"
        class="history-item"
      >
        <div class="item-main">
          <span
            class="item-message"
            :title="snap.message"
          >{{ snap.message }}</span>
          <span class="item-meta">
            {{ relativeTime(snap.timestamp) }}
            <span
              v-if="snap.auto"
              class="auto-badge"
            >{{ t('history.auto') }}</span>
          </span>
        </div>
        <el-button
          class="item-restore"
          size="small"
          text
          :title="t('history.restore')"
          @click="restore(snap)"
        >
          <el-icon><RefreshLeft /></el-icon>
        </el-button>
      </div>
      <p
        v-if="snapshots.length === 0"
        class="history-empty"
      >
        {{ t('history.empty') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshLeft } from '@element-plus/icons-vue'
import { useProjectStore } from '@/store/project'
import { useNovelStore } from '@/store/novel'
import { useLayoutStore } from '@/store/layout'
import { t } from '../../i18n'
import type { ISnapshotInfo } from '@shared/types/novel'

const projectStore = useProjectStore()
const novelStore = useNovelStore()
const layoutStore = useLayoutStore()

const snapshots = ref<ISnapshotInfo[]>([])
const snapshotName = ref('')
const busy = ref(false)

const refresh = async (): Promise<void> => {
  const root = projectStore.currentProjectPath
  if (!root) {
    snapshots.value = []
    return
  }
  const result = await window.electron.novel.listSnapshots(root)
  snapshots.value = result.ok && result.snapshots ? result.snapshots : []
}

onMounted(refresh)
watch(() => projectStore.currentProjectPath, refresh)
watch(
  () => layoutStore.rightColumn,
  (column) => {
    if (column === 'history') refresh()
  }
)

const takeSnapshot = async (): Promise<void> => {
  const root = projectStore.currentProjectPath
  if (!root || busy.value) return
  busy.value = true
  try {
    const message = snapshotName.value.trim() || t('history.defaultMessage')
    const result = await window.electron.novel.snapshot(root, message)
    if (!result.ok) {
      ElMessage.error(result.error ?? 'Snapshot failed')
    } else if (!result.id) {
      ElMessage.info(t('history.nothingToSave'))
    } else {
      snapshotName.value = ''
    }
    await refresh()
  } finally {
    busy.value = false
  }
}

const restore = async (snap: ISnapshotInfo): Promise<void> => {
  const root = projectStore.currentProjectPath
  if (!root) return
  try {
    await ElMessageBox.confirm(
      t('history.restoreConfirm', { message: snap.message }),
      t('history.restore'),
      {
        confirmButtonText: t('history.restore'),
        cancelButtonText: t('recent.cancel'),
        type: 'warning'
      }
    )
  } catch {
    return
  }
  busy.value = true
  try {
    const result = await window.electron.novel.restoreSnapshot(root, snap.id)
    if (result.ok) {
      ElMessage.success(t('history.restored', { message: snap.message }))
      await refresh()
      await novelStore.refresh()
    } else {
      ElMessage.error(result.error ?? 'Restore failed')
    }
  } finally {
    busy.value = false
  }
}

const relativeTime = (timestamp: number): string => {
  const diff = timestamp - Date.now()
  const minutes = Math.round(diff / 60000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  return rtf.format(Math.round(hours / 24), 'day')
}
</script>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.history-header {
  padding: 30px 12px 8px 12px;
}

.history-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--sideBarColor));
}

.history-capture {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 0 8px 8px 8px;
  border-bottom: 1px solid var(--itemBgColor);
  & .el-button {
    color: var(--sideBarColor);
    flex-shrink: 0;
  }
  & .el-button:hover {
    color: var(--themeColor);
  }
}

.capture-input {
  flex: 1;
  min-width: 0;
  background: var(--itemBgColor);
  border: none;
  border-radius: 4px;
  color: var(--sideBarColor);
  font-size: 12px;
  padding: 6px 8px;
  outline: none;
  &:focus {
    outline: 1px solid var(--themeColor);
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 4px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 4px;
  &:hover {
    background: var(--itemBgColor);
    & .item-restore {
      opacity: 1;
    }
  }
}

.item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-message {
  font-size: 13px;
  color: var(--sideBarColor);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  font-size: 11px;
  color: var(--iconColor);
  display: flex;
  gap: 6px;
  align-items: center;
}

.auto-badge {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--itemBgColor);
  color: var(--iconColor);
}

.item-restore {
  opacity: 0;
  color: var(--iconColor);
  flex-shrink: 0;
  &:hover {
    color: var(--themeColor);
  }
}

.history-empty {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--iconColor);
}
</style>
