<template>
  <div
    v-if="visible"
    class="selection-actions"
    :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
    @mousedown.prevent
  >
    <template v-if="!customMode">
      <button
        v-for="action in actions"
        :key="action.id"
        class="sel-btn"
        @click="runAction(action)"
      >
        {{ action.label() }}
      </button>
      <button
        class="sel-btn"
        @click="customMode = true"
      >
        {{ t('biscuit.selCustom') }}
      </button>
    </template>
    <template v-else>
      <input
        ref="customInput"
        v-model="customText"
        class="sel-input"
        :placeholder="t('biscuit.selCustomPlaceholder')"
        @keyup.enter="runCustom"
        @keyup.esc="customMode = false"
      >
      <button
        class="sel-btn sel-btn--go"
        @click="runCustom"
      >
        ➤
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import { useLayoutStore } from '@/store/layout'
import { t } from '../../i18n'

const editorStore = useEditorStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()

const visible = ref(false)
const pos = ref({ top: 0, left: 0 })
const customMode = ref(false)
const customText = ref('')
const customInput = ref<HTMLInputElement | null>(null)

let selectedText = ''
let hideTimer: ReturnType<typeof setTimeout> | null = null

interface SelAction {
  id: string
  label: () => string
  instruction: string
}

const actions: SelAction[] = [
  {
    id: 'rewrite',
    label: () => t('biscuit.selRewrite'),
    instruction: 'Rewrite this passage — keep the meaning and events, improve the prose.'
  },
  {
    id: 'expand',
    label: () => t('biscuit.selExpand'),
    instruction: 'Expand this passage with more depth, sensory detail, and interiority, in the same voice.'
  },
  {
    id: 'describe',
    label: () => t('biscuit.selDescribe'),
    instruction: 'Enrich the description in this passage — setting, atmosphere, physical detail — without changing what happens.'
  }
]

const insideEditor = (node: Node | null): boolean => {
  let el = node instanceof Element ? node : node?.parentElement ?? null
  while (el) {
    if (el.id === 'ag-editor-id') return true
    el = el.parentElement
  }
  return false
}

const onSelectionChange = (): void => {
  if (hideTimer) clearTimeout(hideTimer)
  // Debounce so the pill doesn't flicker while dragging a selection.
  hideTimer = setTimeout(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (
      !selection ||
      selection.rangeCount === 0 ||
      text.length < 8 ||
      text.length > 8000 ||
      !insideEditor(selection.anchorNode)
    ) {
      visible.value = false
      customMode.value = false
      return
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    selectedText = text
    pos.value = {
      top: Math.max(8, rect.top - 40),
      left: Math.max(8, rect.left + rect.width / 2 - 90)
    }
    visible.value = true
  }, 250)
}

onMounted(() => {
  document.addEventListener('selectionchange', onSelectionChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
  if (hideTimer) clearTimeout(hideTimer)
})

const relativePath = (): string => {
  const pathname = editorStore.currentFile?.pathname ?? ''
  const root = projectStore.currentProjectPath ?? ''
  if (pathname && root && pathname.startsWith(root)) {
    return pathname.slice(root.length).replace(/^[\\/]/, '')
  }
  return pathname
}

const dispatch = (instruction: string): void => {
  const file = relativePath()
  const message =
    `${instruction}\n\n` +
    `The passage is from ${file || 'the open file'}:\n\n` +
    `"""\n${selectedText}\n"""\n\n` +
    'Propose the change on that file with propose_project_file_edit so I can review the diff. ' +
    'Change only this passage.'
  layoutStore.SET_LAYOUT({ showRightPrompt: true })
  bus.emit('biscuit-ask', message)
  visible.value = false
  customMode.value = false
  customText.value = ''
  window.getSelection()?.removeAllRanges()
}

const runAction = (action: SelAction): void => {
  dispatch(action.instruction)
}

const runCustom = (): void => {
  const instruction = customText.value.trim()
  if (!instruction) return
  dispatch(instruction)
}

// Focus the custom field when it appears.
watch(customMode, (on) => {
  if (on) nextTick(() => customInput.value?.focus())
})
</script>

<style scoped>
.selection-actions {
  position: fixed;
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: var(--floatBgColor, #fff);
  border: 1px solid var(--floatBorderColor, rgba(128, 128, 128, 0.25));
  box-shadow: var(--floatShadow, 0 4px 12px rgba(0, 0, 0, 0.15));
}

.sel-btn {
  font: inherit;
  font-size: 12px;
  padding: 3px 9px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--floatFontColor, var(--editorColor, #333));
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background: var(--floatHoverColor, var(--itemBgColor, rgba(128, 128, 128, 0.1)));
    color: var(--themeColor, #409eff);
  }
}

.sel-btn--go {
  color: var(--themeColor, #409eff);
  font-weight: 600;
}

.sel-input {
  font: inherit;
  font-size: 12px;
  width: 220px;
  padding: 3px 8px;
  border: none;
  border-radius: 6px;
  background: var(--itemBgColor, rgba(128, 128, 128, 0.08));
  color: var(--floatFontColor, var(--editorColor, #333));
  outline: none;
}
</style>
