<template>
  <div class="tree-view">
    <div class="title">
      <!-- Placeholder -->
    </div>

    <!-- Opened tabs -->
    <div
      v-if="openedFilesInSidebar"
      class="opened-files"
    >
      <div class="title">
        <el-icon
          class="icon-arrow"
          :class="{ fold: !showOpenedFiles }"
          :size="12"
          @click.stop="toggleOpenedFiles()"
        >
          <ArrowRight />
        </el-icon>
        <span
          class="default-cursor text-overflow"
          @click.stop="toggleOpenedFiles()"
        >{{
          t('sideBar.tree.openedFiles')
        }}</span>
        <a
          href="javascript:;"
          :title="t('sideBar.tree.saveAll')"
          @click.stop="saveAll(false)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-save-all" />
          </svg>
        </a>
        <a
          href="javascript:;"
          :title="t('sideBar.tree.closeAll')"
          @click.stop="saveAll(true)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-close-all" />
          </svg>
        </a>
      </div>
      <div
        v-show="showOpenedFiles"
        class="opened-files-list"
      >
        <transition-group name="list">
          <opened-file
            v-for="tab of tabs"
            :key="tab.id"
            :file="tab"
          />
        </transition-group>
      </div>
    </div>

    <!-- Project tree view -->
    <div
      v-if="projectTree"
      class="project-tree"
    >
      <div class="title">
        <el-icon
          class="icon-arrow"
          :class="{ fold: !showDirectories }"
          :size="12"
          @click.stop="toggleDirectories()"
        >
          <ArrowRight />
        </el-icon>
        <span
          class="default-cursor text-overflow"
          @click.stop="toggleDirectories()"
        >{{
          projectTree.name
        }}</span>
      </div>
      <div
        v-show="showDirectories"
        class="tree-wrapper"
      >
        <folder
          v-for="folder of bookFolders"
          :key="folder.id"
          :folder="folder"
          :depth="depth"
        />
        <input
          v-show="createCacheDirname === projectTree.pathname"
          ref="input"
          v-model="createName"
          placeholder="Enter .md file name"
          type="text"
          class="new-input"
          :style="{ 'margin-left': `${depth * 5 + 15}px` }"
          @keypress.enter="handleInputEnter"
        >
        <file
          v-for="file of projectTree.files"
          :key="file.id"
          :file="file"
          :depth="depth"
        />
      </div>

      <!-- Biscuit workspace: how the book gets made (plans/, skills/).
           PINNED below the scrolling book tree so a long manuscript can
           never bury it; plans/skills rows always render (virtual when
           the folder is missing) so the capability is discoverable. -->
      <div
        v-show="showDirectories"
        class="workspace-section"
      >
        <div class="workspace-divider" />
        <div
          class="workspace-label"
          :title="t('sideBar.workspaceTip')"
        >
          {{ t('sideBar.workspace') }}
        </div>
        <div class="workspace-scroll">
          <template
            v-for="entry in workspaceEntries"
            :key="entry.name"
          >
            <folder
              v-if="entry.folder"
              :folder="entry.folder"
              :depth="depth"
            />
            <div
              v-else
              class="workspace-virtual"
              :title="t(entry.name === 'plans' ? 'empty.plansHint' : 'empty.skillsHint')"
            >
              <span class="workspace-virtual__name">{{ entry.name }}/</span>
              <span class="workspace-virtual__empty">{{ t('empty.workspaceEmpty') }}</span>
              <button
                class="workspace-virtual__create"
                @click.stop="createWorkspaceFolder(entry.name)"
              >
                +
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- No project open: the old markup for this state was lost — only its
         orphaned CSS survived — leaving a blank panel. -->
    <empty-state
      v-if="!projectTree"
      icon="📁"
      :title="t('empty.noProjectTitle')"
      :hint="t('empty.noProjectHint')"
      :action-label="t('empty.noProjectOpen')"
      @action="openProjectFolder"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import Folder from './treeFolder.vue'
import EmptyState from '../common/EmptyState.vue'
import File from './treeFile.vue'
import OpenedFile from './treeOpenedTab.vue'
import bus from '../../bus'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'
import type { TreeNode, TabDescriptor } from './types'

const { t } = useI18n()

// The book vs the workshop: plans/ and skills/ are Biscuit's workspace,
// shown under a divider so they never mix with manuscript/bible/notes.
const WORKSPACE_DIRS = ['plans', 'skills']

const props = defineProps<{
  // The project store seeds `projectTree` as `null` until a folder is
  // opened; the template renders the "open project" empty-state behind
  // `v-if="projectTree"`. Type the prop nullable to match runtime + the
  // template guard.
  projectTree: TreeNode | null
  openedFiles?: TabDescriptor[]
  tabs?: TabDescriptor[]
}>()

const bookFolders = computed(() =>
  (props.projectTree?.folders ?? []).filter((f) => !WORKSPACE_DIRS.includes(f.name))
)
const workspaceEntries = computed(() =>
  WORKSPACE_DIRS.map((name) => ({
    name,
    folder: (props.projectTree?.folders ?? []).find((f) => f.name === name) ?? null
  }))
)

const createWorkspaceFolder = async (name: string): Promise<void> => {
  const root = props.projectTree?.pathname
  if (!root) return
  try {
    await window.fileUtils.ensureDir(window.path.join(root, name))
  } catch (err) {
    console.error('Create workspace folder failed:', err)
  }
}

const depth = 0
const showDirectories = ref(true)
const showOpenedFiles = ref(true)
const createName = ref('')
const input = ref<HTMLInputElement | null>(null)

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

// Computed properties
const { createCache } = storeToRefs(projectStore)
const { openedFilesInSidebar } = storeToRefs(preferencesStore)

// The createCache state is `{ dirname, type }` while an input is shown, and
// `{}` otherwise. Expose a typed accessor for the template so we don't have
// to thread `as any` through every comparison.
const createCacheDirname = computed<string | undefined>(() => {
  const cache = createCache.value as { dirname?: string }
  return cache.dirname
})

// Methods
const saveAll = (isClose: boolean): void => {
  editorStore.ASK_FOR_SAVE_ALL(isClose)
}

const toggleOpenedFiles = (): void => {
  showOpenedFiles.value = !showOpenedFiles.value
}

const toggleDirectories = (): void => {
  showDirectories.value = !showDirectories.value
}

// From createFileOrDirectoryMixins
const handleInputFocus = (): void => {
  nextTick(() => {
    if (input.value) {
      input.value.focus()
      createName.value = ''
    }
  })
}

const handleInputEnter = (): void => {
  projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

onMounted(() => {
  bus.on('SIDEBAR::show-new-input', handleInputFocus)

  // Hide rename / create inputs on outside clicks. Buttons that open these
  // inputs must use @click.stop so their click never reaches this listener.
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (target && target.tagName !== 'INPUT') {
      projectStore.CHANGE_ACTIVE_ITEM({})
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })

  document.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement | null
    if (target && target.tagName !== 'INPUT') {
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })
})

const openProjectFolder = async (): Promise<void> => {
  try {
    await window.electron.project.load()
  } catch (err) {
    console.error('Open project failed:', err)
  }
}
</script>

<style scoped>
.list-item {
  display: inline-block;
  margin-right: 10px;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.2s;
}
.list-enter, .list-leave-to
  /* .list-leave-active for below version 2.1.8 */ {
  opacity: 0;
  transform: translateX(-50px);
}
.tree-view {
  font-size: 14px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  height: 100%;
}
.tree-view > .title {
  height: 35px;
  line-height: 35px;
  padding: 0 15px;
  display: flex;
  flex-shrink: 0;
  flex-direction: row-reverse;
}

.icon-arrow {
  margin-right: 5px;
  transition: transform 0.25s ease-out;
  transform: rotate(90deg);
  color: var(--sideBarTextColor);
  cursor: pointer;
}

.icon-arrow.fold {
  transform: rotate(0);
}

.opened-files > .title,
.project-tree > .title {
  height: 30px;
  line-height: 30px;
  font-size: 14px;
}

.opened-files .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
}

.opened-files .title > span {
  flex: 1;
}

.opened-files .title > a {
  display: none;
  text-decoration: none;
  color: var(--sideBarColor);
  margin-left: 8px;
}
.opened-files div.title:hover > a,
.opened-files div.title > a:hover {
  display: block;
}

.opened-files div.title:hover > a:hover,
.opened-files div.title > a:hover:hover {
  color: var(--highlightThemeColor);
}
.opened-files {
  display: flex;
  flex-direction: column;
}
.default-cursor {
  cursor: pointer;
}
.opened-files .opened-files-list {
  max-height: 112px;
  overflow: auto;
  flex: 1;
}

.opened-files .opened-files-list::-webkit-scrollbar:vertical {
  width: 8px;
}

.project-tree {
  display: flex;
  flex-direction: column;
  overflow: auto;
  flex: 1;
}

.project-tree > .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
}

.project-tree > .title > span {
  flex: 1;
  user-select: none;
}

.project-tree > .title > a {
  pointer-events: auto;
  cursor: pointer;
  margin-left: 8px;
  color: var(--sideBarIconColor);
  opacity: 0;
}

.project-tree > .title > a:hover {
  color: var(--highlightThemeColor);
}

.project-tree > .title > a.active {
  color: var(--highlightThemeColor);
}

.project-tree > .tree-wrapper {
  overflow: auto;
  flex: 1;
}

.project-tree > .tree-wrapper::-webkit-scrollbar:vertical {
  width: 8px;
}
.project-tree div.title:hover > a {
  opacity: 1;
}

.open-project .centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.open-project .el-button {
  margin-top: 20px;
}
.open-project .el-button.is-text.is-has-bg,
.empty-project .el-button.is-text.is-has-bg {
  background-color: var(--itemBgColor);
  color: var(--themeColor);
  border-color: transparent;
}
.open-project .el-button.is-text.is-has-bg:hover,
.open-project .el-button.is-text.is-has-bg:focus,
.empty-project .el-button.is-text.is-has-bg:hover,
.empty-project .el-button.is-text.is-has-bg:focus {
  background-color: var(--floatHoverColor);
  color: var(--themeColor);
}
.new-input {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--inputBgColor);
  width: calc(100% - 45px);
  border-radius: 3px;
}
.tree-wrapper {
  position: relative;
}

.empty-project > a {
  color: var(--highlightThemeColor);
  text-align: center;
  margin-top: 15px;
  text-decoration: none;
}
.bold {
  font-weight: 600;
}

.workspace-section {
  margin-top: 10px;
}
.workspace-divider {
  height: 1px;
  background: var(--itemBgColor);
  margin: 8px 12px;
}
.workspace-label {
  padding: 0 15px 4px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--editorColor30, var(--editorColor50));
  user-select: none;
}

.project-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.workspace-section {
  flex: 0 0 auto;
}
.workspace-scroll {
  max-height: 30vh;
  overflow-y: auto;
}
.workspace-virtual {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 15px;
  font-size: 13px;
  color: var(--editorColor50);
  & .workspace-virtual__empty {
    font-size: 11px;
    color: var(--editorColor30, var(--editorColor50));
  }
  & .workspace-virtual__create {
    margin-left: auto;
    border: none;
    background: transparent;
    color: var(--iconColor);
    font-size: 14px;
    cursor: pointer;
    opacity: 0.5;
    &:hover {
      opacity: 1;
      color: var(--themeColor);
    }
  }
}
</style>
