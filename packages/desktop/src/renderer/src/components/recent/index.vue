<template>
  <div class="recent-files-projects">
    <div class="centered-group">
      <div class="project-prompt">
        <p class="prompt-text">{{ t('recent.noProjectOpen') }}</p>
        <div class="centered-group">
          <el-button
            text
            bg
            type="primary"
            @click="createProject"
          >
            {{ t('recent.createProject') }}
          </el-button>
          <el-button
            text
            bg
            type="primary"
            @click="loadProject"
          >
            {{ t('recent.loadProject') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useProjectStore } from '@/store/project'
import { t } from '../../i18n'

const projectStore = useProjectStore()

const createProject = () => {
  projectStore.createProject()
}

const loadProject = () => {
  projectStore.loadProject()
}
</script>

<style scoped>
.recent-files-projects {
  background: var(--editorBgColor);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-around;
  & .centered-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--editorColor);
    & .el-button {
      margin-top: 20px;
    }
    & .el-button.is-text.is-has-bg {
      background-color: var(--itemBgColor);
      color: var(--themeColor);
      border-color: transparent;
    }
    & .el-button.is-text.is-has-bg:hover,
    & .el-button.is-text.is-has-bg:focus {
      background-color: var(--floatHoverColor);
      color: var(--themeColor);
    }
  }
}
</style>
