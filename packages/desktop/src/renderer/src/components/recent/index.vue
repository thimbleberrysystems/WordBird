<template>
  <div class="recent-files-projects">
    <div class="centered-group">
      <div class="project-prompt">
        <p class="prompt-text">
          {{ t('recent.noProjectOpen') }}
        </p>
        <div class="centered-group">
          <el-button
            text
            bg
            type="primary"
            @click="openFlavorPicker"
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

    <el-dialog
      v-model="showFlavorPicker"
      :show-close="true"
      :modal="true"
      custom-class="ag-dialog-table"
      width="560px"
      :title="t('recent.chooseFlavor')"
    >
      <div class="flavor-options">
        <button
          v-for="option in flavorOptions"
          :key="option.id"
          class="flavor-card"
          :class="{ selected: selectedFlavor === option.id }"
          @click="selectedFlavor = option.id"
          @dblclick="confirmCreate"
        >
          <span class="flavor-title">{{ option.title }}</span>
          <span class="flavor-desc">{{ option.description }}</span>
        </button>
      </div>

      <!-- How the writer works — optional, changeable any time via Biscuit. -->
      <div class="method-row">
        <label>{{ t('recent.planningStyle') }}</label>
        <el-select
          v-model="selectedPlanning"
          size="small"
        >
          <el-option
            v-for="option in planningOptions"
            :key="option.id"
            :value="option.id"
            :label="option.label"
          />
        </el-select>
      </div>
      <div class="method-row">
        <label>{{ t('recent.structureTemplate') }}</label>
        <el-select
          v-model="selectedStructure"
          size="small"
        >
          <el-option
            v-for="option in structureOptions"
            :key="option.id"
            :value="option.id"
            :label="option.label"
          />
        </el-select>
      </div>
      <p class="method-hint">
        {{ t('recent.methodHint') }}
      </p>

      <template #footer>
        <el-button @click="showFlavorPicker = false">
          {{ t('recent.cancel') }}
        </el-button>
        <el-button
          type="primary"
          @click="confirmCreate"
        >
          {{ t('recent.create') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '@/store/project'
import { t } from '../../i18n'
import type { ProjectFlavor, PlanningStyle, StructureTemplate } from '@shared/types/novel'

const projectStore = useProjectStore()

const showFlavorPicker = ref(false)
const selectedFlavor = ref<ProjectFlavor>('chapters-scenes')
const selectedPlanning = ref<PlanningStyle>('unset')
const selectedStructure = ref<StructureTemplate>('unset')

const planningOptions = computed(() => [
  { id: 'unset' as PlanningStyle, label: t('recent.planningLater') },
  { id: 'outline-first' as PlanningStyle, label: t('recent.planningOutline') },
  { id: 'discovery' as PlanningStyle, label: t('recent.planningDiscovery') },
  { id: 'hybrid' as PlanningStyle, label: t('recent.planningHybrid') }
])

const structureOptions = computed(() => [
  { id: 'unset' as StructureTemplate, label: t('recent.planningLater') },
  { id: 'freeform' as StructureTemplate, label: t('recent.structureFreeform') },
  { id: 'three-act' as StructureTemplate, label: t('recent.structureThreeAct') },
  { id: 'save-the-cat' as StructureTemplate, label: t('recent.structureSaveTheCat') },
  { id: 'heros-journey' as StructureTemplate, label: t('recent.structureHerosJourney') },
  { id: 'seven-point' as StructureTemplate, label: t('recent.structureSevenPoint') },
  { id: 'romancing-the-beat' as StructureTemplate, label: t('recent.structureRomancing') }
])

const flavorOptions = computed(() => [
  {
    id: 'chapters-scenes' as ProjectFlavor,
    title: t('recent.flavorChapters'),
    description: t('recent.flavorChaptersDesc')
  },
  {
    id: 'scene-pool' as ProjectFlavor,
    title: t('recent.flavorScenePool'),
    description: t('recent.flavorScenePoolDesc')
  },
  {
    id: 'flat' as ProjectFlavor,
    title: t('recent.flavorFlat'),
    description: t('recent.flavorFlatDesc')
  }
])

const openFlavorPicker = () => {
  selectedFlavor.value = 'chapters-scenes'
  selectedPlanning.value = 'unset'
  selectedStructure.value = 'unset'
  showFlavorPicker.value = true
}

const confirmCreate = () => {
  showFlavorPicker.value = false
  projectStore.createProject(selectedFlavor.value, selectedPlanning.value, selectedStructure.value)
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

.flavor-options {
  display: flex;
  gap: 12px;
}

.flavor-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 14px;
  border: 1px solid var(--itemBgColor);
  border-radius: 8px;
  background: var(--itemBgColor);
  color: var(--editorColor);
  cursor: pointer;
  text-align: left;
  font: inherit;
  &:hover {
    border-color: var(--themeColor);
  }
  &.selected {
    border-color: var(--themeColor);
    background: var(--floatBgColor);
  }
  & .flavor-title {
    font-weight: 600;
    color: var(--editorColor);
  }
  & .flavor-desc {
    font-size: 12px;
    color: var(--iconColor);
    line-height: 1.5;
  }
}
.method-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  & label {
    width: 180px;
    font-size: 13px;
    color: var(--editorColor);
  }
  & .el-select {
    flex: 1;
  }
}

.method-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--iconColor);
}
</style>
