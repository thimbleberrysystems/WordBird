<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    class="side-bar"
    :style="[!rightColumn ? { 'min-width': '45px' } : {}, { width: `${finalSideBarWidth}px` }]"
  >
    <!-- Unified Toggle Button (Expand) -->
    <div
      v-if="showExpandIcon"
      class="toggle-biscuit-btn expand"
      :title="t('biscuit.expandTip')"
      @click="handleExpandClick"
    >
      <el-icon><DArrowLeft /></el-icon>
    </div>
    <div class="left-column">
      <ul>
        <li
          v-for="(c, index) of sideBarIcons"
          :key="index"
          :class="{ active: c.id === rightColumn }"
          :title="c.name()"
          @click="handleLeftIconClick(c.id)"
        >
          <component :is="c.icon" />
          <!-- Live dot: agents are working right now (pulsing). -->
          <span
            v-if="c.id === 'agents' && agentsStore.runState !== 'idle'"
            class="agents-live-dot"
            :class="{ paused: agentsStore.runState === 'paused' }"
          />
          <!-- Steady dot: this view's contents changed since you last
               looked (Biscuit edited the project). Never shown on the
               open view, and never competes with the live dot above. -->
          <span
            v-else-if="c.id !== rightColumn && sidebarActivityStore.hasUnseen(c.id)"
            class="view-activity-dot"
            :class="sidebarActivityStore.severityOf(c.id) ?? 'info'"
            :title="activityTip(c.id)"
          />
        </li>
      </ul>
      <div class="left-column-bottom">
        <!-- Wordmark, rotated to spend the rail's idle vertical space. -->
        <span class="brand-vertical">WordBird</span>
        <ul class="bottom">
          <li
            v-for="(c, index) of sideBarBottomIcons"
            :key="index"
            :title="c.name()"
            @click="handleLeftBottomClick(c.id)"
          >
            <component :is="c.icon" />
          </li>
        </ul>
      </div>
    </div>
    <div
      v-show="rightColumn"
      class="right-column"
    >
      <binder v-if="rightColumn === 'binder'" />
      <tree
        v-else-if="rightColumn === 'files'"
        :project-tree="projectTree"
        :opened-files="openedFiles"
        :tabs="tabs"
      />
      <side-bar-search v-else-if="rightColumn === 'search'" />
      <toc v-else-if="rightColumn === 'toc'" />
      <history v-else-if="rightColumn === 'history'" />
      <continuity v-else-if="rightColumn === 'continuity'" />
      <entities-view v-else-if="rightColumn === 'entities'" />
      <agents-view v-else-if="rightColumn === 'agents'" />
    </div>
    <div
      v-show="rightColumn"
      ref="dragBar"
      class="drag-bar"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useSidebarActivityStore } from '@/store/sidebarActivity'
import {
  rebaselineView,
  resetActivityBaselines
} from '@/services/sidebarActivityWatch'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'

import { sideBarIcons, sideBarBottomIcons } from './help'
import { t } from '../../i18n'
import Binder from './binder.vue'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import History from './history.vue'
import Continuity from './continuity.vue'
import AgentsView from './agents.vue'
import EntitiesView from './entities.vue'
import { useAgentsStore } from '@/store/agents'
import { DArrowLeft } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import type { TabDescriptor } from './types'

const layoutStore = useLayoutStore()
const agentsStore = useAgentsStore()
const sidebarActivityStore = useSidebarActivityStore()
agentsStore.init()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const sideBar = ref<HTMLDivElement | null>(null)
const dragBar = ref<HTMLDivElement | null>(null)

const openedFiles = ref<TabDescriptor[]>([])
const sideBarViewWidth = ref(280)

const { rightColumn, showSideBar, sideBarWidth } = storeToRefs(layoutStore)
const { showRightPrompt } = storeToRefs(layoutStore)

const { projectTree } = storeToRefs(projectStore)
const { tabs } = storeToRefs(editorStore)

const finalSideBarWidth = computed<number>(() => {
  if (!showSideBar.value) return 0
  if (rightColumn.value === '') return 45
  return sideBarViewWidth.value < 220 ? 220 : sideBarViewWidth.value
})

onMounted(() => {
  nextTick(() => {
    const dragBarEl = dragBar.value
    if (!dragBarEl) return
    let startX = 0
    let currentSideBarWidth = +sideBarWidth.value
    let startWidth = currentSideBarWidth

    sideBarViewWidth.value = currentSideBarWidth

    const mouseUpHandler = (): void => {
      document.removeEventListener('mousemove', mouseMoveHandler, false)
      document.removeEventListener('mouseup', mouseUpHandler, false)
      layoutStore.CHANGE_SIDE_BAR_WIDTH(currentSideBarWidth < 220 ? 220 : currentSideBarWidth)
    }

    const mouseMoveHandler = (event: MouseEvent): void => {
      const offset = event.clientX - startX
      currentSideBarWidth = startWidth + offset
      sideBarViewWidth.value = currentSideBarWidth
    }

    const mouseDownHandler = (event: MouseEvent): void => {
      startX = event.clientX
      startWidth = +sideBarWidth.value
      document.addEventListener('mousemove', mouseMoveHandler, false)
      document.addEventListener('mouseup', mouseUpHandler, false)
    }

    dragBarEl.addEventListener('mousedown', mouseDownHandler, false)
  })
})

const handleLeftIconClick = (name: string): void => {
  if (rightColumn.value === name) {
    layoutStore.SET_LAYOUT({ rightColumn: '' })
    layoutStore.CHANGE_SIDE_BAR_WIDTH(finalSideBarWidth.value)
  } else {
    const needDispatch = rightColumn.value === ''
    layoutStore.SET_LAYOUT({ rightColumn: name })
    sideBarViewWidth.value = +sideBarWidth.value
    if (needDispatch) {
      layoutStore.CHANGE_SIDE_BAR_WIDTH(finalSideBarWidth.value)
    }
  }
}

// Opening a view means its changes have been seen. Watching rightColumn
// (rather than only the click handler) also covers programmatic switches.
watch(rightColumn, (view) => {
  if (!view) return
  sidebarActivityStore.clear(view)
  // What they are looking at now must not come back as "new".
  rebaselineView(view).catch(() => {})
}, { immediate: true })

// A different project starts with a clean rail and clean baselines.
watch(() => projectStore.currentProjectPath, () => {
  sidebarActivityStore.clearAll()
  resetActivityBaselines()
})

/** Tooltip names WHAT is new, so a red dot is actionable at a glance. */
const activityTip = (viewId: string): string => {
  const severity = sidebarActivityStore.severityOf(viewId)
  if (severity === 'error') return t('sideBar.newIssuesTip')
  if (severity === 'warn') return t('sideBar.newWarningsTip')
  return t('sideBar.newActivityTip')
}

const handleLeftBottomClick = (name: string): void => {
  if (name === 'settings') {
    projectStore.OPEN_SETTING_WINDOW()
  }
}

const showExpandIcon = computed(() => {
  return !showRightPrompt.value
})

const handleExpandClick = () => {
  layoutStore.SET_LAYOUT({ showRightPrompt: true })
}
</script>

<style scoped>
.side-bar {
  display: flex;
  flex-shrink: 0;
  flex-grow: 0;
  width: 280px;
  height: 100vh;
  min-width: 220px;
  position: relative;
  color: var(--sideBarColor);
  user-select: none;
  background: var(--sideBarBgColor);
  border-right: 1px solid var(--itemBgColor);
}

.side-bar .left-column svg {
  color: var(--iconColor);
}

.left-column {
  height: 100%;
  width: 45px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-top: 28px;
  box-sizing: border-box;
}

.left-column > ul {
  opacity: 1;
}

.left-column ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
}

.left-column ul > li {
  position: relative;
  width: 45px;
  height: 45px;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  cursor: pointer;
}

.agents-live-dot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--themeColor, #409eff);
  animation: agents-dot-pulse 1.2s infinite ease-in-out;
}

/* Same spot as the live dot, but STEADY and a touch smaller: "there is
   something new in here", not "work is happening right now". Colour keys
   off severity — red needs a decision, yellow is worth a look, green is
   routine progress. */
.view-activity-dot {
  position: absolute;
  top: 11px;
  right: 11px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  opacity: 0.9;
}

.view-activity-dot.info {
  background: var(--themeColor, #409eff);
}

.view-activity-dot.warn {
  background: #e6a23c;
}

.view-activity-dot.error {
  background: #f56c6c;
}

.agents-live-dot.paused {
  background: var(--wbWarningColor);
  animation: none;
}

@keyframes agents-dot-pulse {
  0% { opacity: 0.35; }
  50% { opacity: 1; }
  100% { opacity: 0.35; }
}

.left-column-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.brand-vertical {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2em;
  /* Etched / letterpress: the glyphs read as pressed into the rail —
     a dark inner edge on one side, a faint raised highlight on the other.
     Shadows run on the x-axis because the text itself is vertical. */
  color: transparent;
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.38),
    rgba(0, 0, 0, 0.22)
  );
  background-clip: text;
  -webkit-background-clip: text;
  text-shadow:
    1px 0 1px rgba(255, 255, 255, 0.18),
    -1px 0 1px rgba(0, 0, 0, 0.28);
  user-select: none;
  white-space: nowrap;
}

/* Dark themes: engrave with darker-than-surface ink and a soft light rim. */
.dark .brand-vertical {
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.55),
    rgba(0, 0, 0, 0.4)
  );
  background-clip: text;
  -webkit-background-clip: text;
  text-shadow:
    1px 0 1px rgba(255, 255, 255, 0.12),
    -1px 0 1px rgba(0, 0, 0, 0.6);
}

.left-column ul > li > svg {
  width: 18px;
  height: 18px;
  color: var(--sideBarIconColor);
  opacity: 1;
  transition: transform 0.25s ease-in-out;
}

.left-column ul > li.active > svg {
  color: var(--themeColor);
}

.side-bar:hover .left-column ul li svg {
  opacity: 1;
}

.right-column {
  flex: 1;
  width: calc(100% - 50px);
  overflow: hidden;
}

.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 3px;
  cursor: col-resize;
}

.drag-bar:hover {
  border-right: 2px solid var(--iconColor);
}
</style>
