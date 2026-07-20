<template>
  <div class="editor-container">
    <side-bar v-if="init" />

    <div class="editor-middle">
      <title-bar
        :project="projectTree"
        :pathname="pathname"
        :filename="filename"
        :active="windowActive"
        :word-count="wordCount"
        :platform="platform"
        :is-saved="isSaved"
      />

      <div
        v-if="!init"
        class="editor-placeholder"
      />
      <div
        v-else
        class="main-workspace"
      >
        <div class="editor-area">
          <recent v-if="showRecentPrompt" />
          <project-home
            v-if="projectTree && novelViewMode === 'page' && !hasCurrentFile"
          />
          <corkboard v-if="projectTree && novelViewMode === 'corkboard'" />
          <outline-view v-else-if="projectTree && novelViewMode === 'outline'" />
          <timeline-view v-else-if="projectTree && novelViewMode === 'timeline'" />
          <editor-with-tabs
            v-if="hasCurrentFile"
            v-show="novelViewMode === 'page'"
            :markdown="markdown"
            :cursor="cursor"
            :muya-index-cursor="muyaIndexCursor"
            :source-code="sourceCode"
            :show-tab-bar="showTabBar"
            :text-direction="textDirection"
            :platform="platform"
          />
          <selection-actions v-if="hasCurrentFile" />
        </div>
        <RightPrompt v-if="showRightPrompt" />
      </div>
      <command-palette />
      <about-dialog />
      <export-setting-dialog />
      <rename />
      <import-modal />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, nextTick, onMounted, ref } from 'vue'
import { useMainStore } from '@/store'
import { storeToRefs } from 'pinia'
import { addStyles, addThemeStyle, addCustomStyle, type AddStylesOptions } from '@/util/theme'
import Recent from '@/components/recent/index.vue'
import EditorWithTabs from '@/components/editorWithTabs/index.vue'
import TitleBar from '@/components/titleBar/index.vue'
import SideBar from '@/components/sideBar/index.vue'
import RightPrompt from '@/components/rightPrompt/RightPrompt.vue'
import AboutDialog from '@/components/about/index.vue'
import CommandPalette from '@/components/commandPalette/index.vue'
import ExportSettingDialog from '@/components/exportSettings/index.vue'
import Rename from '@/components/rename/index.vue'
import ImportModal from '@/components/import/index.vue'
import ProjectHome from '@/components/novel/ProjectHome.vue'
import Corkboard from '@/components/novel/Corkboard.vue'
import OutlineView from '@/components/novel/OutlineView.vue'
import TimelineView from '@/components/novel/TimelineView.vue'
import SelectionActions from '@/components/novel/SelectionActions.vue'
import { initAgentReviewFallback } from '@/services/agentReviewFallback'
import { useNovelStore } from '@/store/novel'
import bus from '@/bus'
import { mirrorAiConnectionState } from '@/services/langgraph'
import { DEFAULT_STYLE } from '@/config'
import { useLayoutStore } from '@/store/layout'
import {
  useSidebarActivityStore,
  PROJECT_CHANGE_VIEWS
} from '@/store/sidebarActivity'
import { useListenForMainStore } from '@/store/listenForMain'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useCommandCenterStore } from '@/store/commandCenter'
import { useProjectStore } from '@/store/project'
import { useAutoUpdatesStore } from '@/store/autoUpdates'
import { useNotificationStore } from '@/store/notification'

const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const sidebarActivityStore = useSidebarActivityStore()
const projectStore = useProjectStore()
const novelStore = useNovelStore()
const listenForMainStore = useListenForMainStore()
const autoUpdateStore = useAutoUpdatesStore()
const commandCenterStore = useCommandCenterStore()
const notificationStore = useNotificationStore()

const timer = ref<ReturnType<typeof setTimeout> | null>(null)

// States from Pinia
const { windowActive, platform, init } = storeToRefs(mainStore)
const { showTabBar, showRightPrompt } = storeToRefs(layoutStore)
const { sourceCode, theme, customCss, textDirection, zoom } = storeToRefs(preferencesStore)
const { projectTree } = storeToRefs(projectStore)
const { currentFile } = storeToRefs(editorStore)
const { viewMode: novelViewMode } = storeToRefs(novelStore)

const pathname = computed(() => currentFile.value?.pathname)
const filename = computed(() => currentFile.value?.filename)
const isSaved = computed(() => currentFile.value?.isSaved)
// `markdown` is read by `<editor-with-tabs>` whose prop is `required: true`.
// In template space we render that subtree only when `hasCurrentFile` is set,
// but vue-tsc can't see through the v-if guard — coalesce to '' so the prop
// type is `string`. The `<editor-with-tabs>` mount is still gated.
const markdown = computed<string>(() => currentFile.value?.markdown ?? '')
const cursor = computed(() => currentFile.value?.cursor)
const wordCount = computed(() => currentFile.value?.wordCount)
// `muyaIndexCursor` is loosely typed as `unknown` on the editor store; the
// downstream prop expects `Object | undefined`. Cast at the boundary.
const muyaIndexCursor = computed<Record<string, unknown> | undefined>(
  () => currentFile.value?.muyaIndexCursor as Record<string, unknown> | undefined
)

const hasCurrentFile = computed<boolean>(() => {
  return currentFile.value?.markdown !== undefined
})

// Show the recent component when there's no current file AND no project open
const showRecentPrompt = computed<boolean>(() => {
  return !hasCurrentFile.value && !projectTree.value
})

// Watchers
watch(theme, (value, oldValue) => {
  if (value !== oldValue) {
    addThemeStyle(value)
  }
})

watch(customCss, (value, oldValue) => {
  if (value !== oldValue) {
    addCustomStyle({
      customCss: value
    })
  }
})

watch(zoom, (zoomValue) => {
  bus.emit('mt::window-zoom', zoomValue)
})

const setupDragDropHandler = (): void => {
  window.addEventListener(
    'dragover',
    (e: DragEvent) => {
      if (!e.dataTransfer || !e.dataTransfer.types.length) return

      if (e.dataTransfer.types.indexOf('Files') >= 0) {
        if (
          e.dataTransfer.items.length === 1 &&
          e.dataTransfer.items[0]!.type.indexOf('image') > -1
        ) {
          // Do nothing
        } else {
          e.preventDefault()
          if (timer.value) {
            clearTimeout(timer.value)
          }
          timer.value = setTimeout(() => {
            bus.emit('importDialog', false)
          }, 300)
          bus.emit('importDialog', true)
        }
        e.dataTransfer.dropEffect = 'copy'
      } else {
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'none'
      }
    },
    false
  )
}
onMounted(async () => {
  // Proposal ingestion + review-action fallback: ALWAYS on at the window
  // level, so proposals render even with no file open (ProjectHome) —
  // the editor's richer handlers take over whenever it mounts.
  initAgentReviewFallback()
  // Detached Biscuit window closed → bring the docked panel back.
  window.electron.ai.onBiscuitReattach(() => {
    layoutStore.SET_LAYOUT({ showRightPrompt: true })
  })
  // An agent (or an accepted edit) changed project files/structure on disk —
  // refresh the binder/views immediately instead of waiting for the watcher.
  window.electron.ai.onProjectChanged?.(() => {
    novelStore.refresh()
    // Flag the views this invalidates so the writer can see WHERE Biscuit's
    // work landed without opening each one. The view they are looking at is
    // never flagged — it refreshed live.
    sidebarActivityStore.mark(PROJECT_CHANGE_VIEWS, layoutStore.rightColumn)
  })
  // Where the writer is looking follows the open file, the tab set, and
  // save-state (unsaved tabs mean disk lags the screen).
  watch(currentFile, () => novelStore.sendSessionContext())
  watch(
    () =>
      editorStore.tabs
        .map((f) => `${f.pathname || f.filename}:${(f as { isSaved?: boolean }).isSaved}`)
        .join('|'),
    () => novelStore.sendSessionContext()
  )

  // Main broadcasts every connection transition — mirror it so the UI and
  // the reconnect guards never drift from reality.
  mirrorAiConnectionState(preferencesStore).catch(() => {
    // The broadcast subscription is already live; a failed initial pull is
    // caught up by the next transition.
  })
  if (window.wordbird?.initialState) {
    preferencesStore.SET_USER_PREFERENCE(window.wordbird.initialState)
  }

  mainStore.LISTEN_WIN_STATUS()
  await commandCenterStore.LISTEN_COMMAND_CENTER_BUS()
  layoutStore.LISTEN_FOR_LAYOUT()
  listenForMainStore.LISTEN_FOR_EDIT()
  preferencesStore.LISTEN_FOR_VIEW()
  listenForMainStore.LISTEN_FOR_SHOW_DIALOG()
  listenForMainStore.LISTEN_FOR_PARAGRAPH_INLINE_STYLE()
  projectStore.LISTEN_FOR_UPDATE_PROJECT()
  projectStore.LISTEN_FOR_LOAD_PROJECT()
  projectStore.LISTEN_FOR_PROJECT_REQUESTS()
  projectStore.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()
  autoUpdateStore.LISTEN_FOR_UPDATE()
  preferencesStore.ASK_FOR_USER_PREFERENCE()
  preferencesStore.LISTEN_TOGGLE_VIEW()
  editorStore.LISTEN_SCREEN_SHOT()
  editorStore.LISTEN_FOR_CLOSE()
  editorStore.LISTEN_FOR_SAVE_AS()
  editorStore.LISTEN_FOR_MOVE_TO()
  editorStore.LISTEN_FOR_SAVE()
  editorStore.LISTEN_FOR_SET_PATHNAME()
  editorStore.LISTEN_FOR_BOOTSTRAP_WINDOW()
  editorStore.LISTEN_FOR_SAVE_CLOSE()
  editorStore.LISTEN_FOR_RENAME()
  editorStore.LISTEN_FOR_SET_LINE_ENDING()
  editorStore.LISTEN_FOR_SET_ENCODING()
  editorStore.LISTEN_FOR_SET_FINAL_NEWLINE()
  editorStore.LISTEN_FOR_NEW_TAB()
  editorStore.LISTEN_FOR_CLOSE_TAB()
  editorStore.LISTEN_FOR_TAB_CYCLE()
  editorStore.LISTEN_FOR_SWITCH_TABS()
  editorStore.LISTEN_FOR_PRINT_SERVICE_CLEARUP()
  editorStore.LISTEN_FOR_EXPORT_SUCCESS()
  editorStore.LISTEN_FOR_FILE_CHANGE()
  editorStore.LISTEN_WINDOW_ZOOM()
  editorStore.LISTEN_FOR_RELOAD_IMAGES()
  editorStore.LISTEN_FOR_CONTEXT_MENU()
  editorStore.LISTEN_FOR_STATE_REPLACE()

  // module: notification
  notificationStore.listenForNotification()

  setupDragDropHandler()

  nextTick(() => {
    // `initialState` from bootstrap carries nullable URL params (string|null);
    // `addStyles` requires non-null `theme` / `codeFontFamily` strings.
    // Coalesce against DEFAULT_STYLE for every nullable field.
    const init = window.wordbird?.initialState
    const style: AddStylesOptions = {
      theme: init?.theme ?? DEFAULT_STYLE.theme,
      codeFontFamily: init?.codeFontFamily ?? DEFAULT_STYLE.codeFontFamily,
      codeFontSize: init?.codeFontSize ?? DEFAULT_STYLE.codeFontSize,
      hideScrollbar: init?.hideScrollbar ?? DEFAULT_STYLE.hideScrollbar
    }
    addStyles(style)
  })
})
</script>

<style scoped>
.editor-placeholder,
.editor-container {
  display: flex;
  flex-direction: row;
  position: absolute;
  width: 100vw;
  height: 100vh;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
.editor-container .hide {
  z-index: -1;
  opacity: 0;
  position: absolute;
  left: -10000px;
}
.editor-placeholder {
  background: var(--editorBgColor);
}
.editor-middle {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100vh;
  position: relative;
  & > .editor {
    flex: 1;
  }
}

.main-workspace {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.editor-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  /* Anchor for the floating novel view switcher. */
  position: relative;
}

.editor-area > .editor-placeholder,
.editor-area > recent,
.editor-area > editor-with-tabs {
  min-width: 0;
}
</style>
