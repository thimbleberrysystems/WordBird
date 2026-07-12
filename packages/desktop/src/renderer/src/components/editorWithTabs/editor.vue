<template>
  <div
    class="editor-wrapper"
    :class="[{ typewriter: typewriter, focus: focus, source: sourceCode }]"
    :style="{
      lineHeight: lineHeight,
      fontSize: `${fontSize}px`,
      'font-family': editorFontFamily
        ? `${editorFontFamily}, ${defaultFontFamily}`
        : `${defaultFontFamily}`
    }"
    :dir="textDirection"
  >
    <div
      ref="editorRef"
      class="editor-component"
    />
    <div
      v-show="imageViewerVisible"
      class="image-viewer"
    >
      <span
        class="icon-close"
        @click="setImageViewerVisible(false)"
      >
        <CloseIcon />
      </span>
      <div ref="imageViewerRef" />
    </div>
    <el-dialog
      v-model="dialogTableVisible"
      :show-close="isShowClose"
      :modal="true"
      class="ag-insert-table-dialog"
      width="454px"
      center
      dir="ltr"
    >
      <template #title>
        <div class="dialog-title">
          {{ t('editor.insertTable.title') }}
        </div>
      </template>
      <el-form
        :model="tableChecker"
        :inline="true"
      >
        <el-form-item :label="t('editor.insertTable.rows')">
          <el-input-number
            ref="rowInput"
            v-model="tableChecker.rows"
            size="mini"
            controls-position="right"
            :min="1"
            :max="30"
          />
        </el-form-item>
        <el-form-item :label="t('editor.insertTable.columns')">
          <el-input-number
            v-model="tableChecker.columns"
            size="mini"
            controls-position="right"
            :min="1"
            :max="20"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogTableVisible = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button
            type="primary"
            @click="handleDialogTableConfirm"
          >
            {{ t('common.ok') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
    <editor-search v-if="!sourceCode" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import log from 'electron-log'
import Muya from 'muya/lib'
import TablePicker from 'muya/lib/ui/tablePicker'
import QuickInsert from 'muya/lib/ui/quickInsert'
import CodePicker from 'muya/lib/ui/codePicker'
import EmojiPicker from 'muya/lib/ui/emojiPicker'
import ImagePathPicker from 'muya/lib/ui/imagePicker'
import ImageSelector from 'muya/lib/ui/imageSelector'
import ImageToolbar from 'muya/lib/ui/imageToolbar'
import Transformer from 'muya/lib/ui/transformer'
import FormatPicker from 'muya/lib/ui/formatPicker'
import LinkTools from 'muya/lib/ui/linkTools'
import FootnoteTool from 'muya/lib/ui/footnoteTool'
import TableBarTools from 'muya/lib/ui/tableTools'
import FrontMenu from 'muya/lib/ui/frontMenu'
import EditorSearch from '../search/index.vue'
import bus from '@/bus'
import { clearDiffStateInMuya } from '@/services/agentEditorApply'
import { injectInlineDiff, type InlineDiffHandle } from '@/services/agentDiffDom'
import { acceptHunk, discardHunk } from '@/services/agentDiffHunks'
import { useAgentStore } from '@/store/agent'
import { DEFAULT_EDITOR_FONT_FAMILY } from '@/config'
import notice from '@/services/notification'
import Printer from '@/services/printService'
import { SpellcheckerLanguageCommand } from '@/commands'
import { SpellChecker } from '@/spellchecker'
import { isOsx, animatedScrollTo } from '@/util'
import { moveImageToFolder, uploadImage } from '@/util/fileSystem'
import { guessClipboardFilePath } from '@/util/clipboard'
import { getCssForOptions, getHtmlToc, type PdfCssOptions, type HtmlTocOptions } from '@/util/pdf'
import { addCommonStyle, setEditorWidth, setWrapCodeBlocks } from '@/util/theme'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import { applyAgentEditToCurrentFile } from '@/services/agentEditorApply'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import 'muya/themes/default.css'
import '@/assets/themes/codemirror/one-dark.css'
import { Close as CloseIcon } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  applyAllPendingEdits,
  planMultiFileApply,
  editDiskPath
} from '@/services/agentMultiFileApply'

const { t } = useI18n()
const STANDAR_Y = 320

// Muya remains untyped; everything that crosses the editor boundary is `any`
// for now. We keep the spelling near the top of the file so future muya-side
// typings can replace these in one place.
type MuyaInstance = any
type MuyaChange = any
type ElInputNumberInstance = any

const props = defineProps<{
  markdown?: string
  cursor?: unknown
  textDirection: string
  platform?: string
}>()

// Get stores
const preferencesStore = usePreferencesStore()
const editorStore = useEditorStore()
const projectStore = useProjectStore()

// Use storeToRefs to extract reactive properties from the stores
const {
  // Preferences
  preferLooseListItem,
  autoPairBracket,
  autoPairMarkdownSyntax,
  autoPairQuote,
  bulletListMarker,
  orderListDelimiter,
  tabSize,
  listIndentation,
  frontmatterType,
  superSubScript,
  footnote,
  isHtmlEnabled,
  isGitlabCompatibilityEnabled,
  lineHeight,
  fontSize,
  codeFontSize,
  codeFontFamily,
  codeBlockLineNumbers,
  trimUnnecessaryCodeBlockEmptyLines,
  editorFontFamily,
  hideQuickInsertHint,
  hideLinkPopup,
  autoCheck,
  editorLineWidth,
  wrapCodeBlocks,
  imageInsertAction,
  imagePreferRelativeDirectory,
  imageRelativeDirectoryBase,
  imageRelativeDirectoryName,
  imageFolderPath,
  theme,
  sequenceTheme,
  hideScrollbar,
  spellcheckerEnabled,
  spellcheckerNoUnderline,
  spellcheckerLanguage,

  // Edit modes
  typewriter,
  focus,
  sourceCode
} = storeToRefs(preferencesStore)

// Editor store refs
const { currentFile } = storeToRefs(editorStore)

// Project store refs
const { projectTree } = storeToRefs(projectStore)

// Component state
const defaultFontFamily = DEFAULT_EDITOR_FONT_FAMILY
const selectionChange = ref<unknown>(null)
const editor = ref<MuyaInstance>(null)
const isShowClose = ref(false)
const dialogTableVisible = ref(false)
const imageViewerVisible = ref<boolean | null>(null)
const tableChecker = reactive({
  rows: 4,
  columns: 3
})

// Template refs
const editorRef = ref<HTMLDivElement | null>(null)
const imageViewerRef = ref<HTMLDivElement | null>(null)
const rowInput = ref<ElInputNumberInstance>(null)

// Non-reactive variables
let printer: any = null
let spellchecker: any = null
let switchLanguageCommand: any = null
let imageViewer: SimpleImageViewer | null = null
let unsubscribeEditProposal: (() => void) | null = null

// Handle for the injected inline-diff nodes (see services/agentDiffDom.ts,
// verified by agent-diff-dom.spec.ts). null when no diff is shown.
let inlineDiffHandle: InlineDiffHandle | null = null

// Inline-diff review state for the current file. `base` is what is currently in
// the file; `target` is the proposed content. The diff between them is the set
// of pending hunks. Per-hunk accept/discard advance base/target (see
// agentDiffHunks acceptHunk/discardHunk, verified in agent-diff-hunks.spec.ts).
let diffBase = ''
let diffTarget = ''
let diffEditId: string | null = null

const agentStore = useAgentStore()

interface DiffWidgetData {
  oldContent: string
  newContent: string
  reason?: string
  filePath: string
}

async function showInlineDiff (data: DiffWidgetData): Promise<void> {
  diffBase = data.oldContent
  diffTarget = data.newContent
  diffEditId = agentStore.pendingEdits.find(e => e.status === 'pending')?.id ?? null
  await renderInlineDiff(data.reason)
}

async function renderInlineDiff (reason?: string): Promise<void> {
  await nextTick()
  inlineDiffHandle?.remove()
  inlineDiffHandle = null

  const container = editor.value?.container as HTMLElement | undefined
  if (!container) return

  if (diffBase === diffTarget) {
    finishInlineDiff()
    return
  }

  inlineDiffHandle = injectInlineDiff(container, diffBase, diffTarget, {
    reason,
    onAcceptFile: () => { acceptAllHunks() },
    onDiscardFile: () => { discardAllHunks() },
    onAcceptHunk: (i) => { acceptOneHunk(i, reason) },
    onDiscardHunk: (i) => { discardOneHunk(i, reason) }
  })
}

// Write content into the current file's buffer and persist it to disk.
function applyContentToFile (content: string): void {
  if (!editor.value || !currentFile.value) return
  applyAgentEditToCurrentFile(
    {
      edit: {
        id: diffEditId || 'inline-diff',
        filePath: currentFile.value.pathname || currentFile.value.filename || '',
        newContent: content,
        reason: undefined
      },
      oldContent: diffBase,
      originalPath: currentFile.value.pathname || ''
    },
    {
      currentFile: currentFile.value,
      setMarkdown: (markdown: string) => { editor.value?.setMarkdown(markdown) },
      save: () => { editorStore.FILE_SAVE() }
    }
  )
}

async function acceptOneHunk (hunkIndex: number, reason?: string): Promise<void> {
  const next = acceptHunk(diffBase, diffTarget, hunkIndex)
  diffBase = next.base
  diffTarget = next.target
  applyContentToFile(diffBase)
  await renderInlineDiff(reason)
}

async function discardOneHunk (hunkIndex: number, reason?: string): Promise<void> {
  const next = discardHunk(diffBase, diffTarget, hunkIndex)
  diffBase = next.base
  diffTarget = next.target
  // Discard does not touch the file; just re-render the remaining hunks.
  await renderInlineDiff(reason)
}

async function acceptAllHunks (): Promise<void> {
  diffBase = diffTarget
  applyContentToFile(diffBase)
  await renderInlineDiff()
}

async function discardAllHunks (): Promise<void> {
  diffTarget = diffBase
  await renderInlineDiff()
}

function finishInlineDiff (): void {
  inlineDiffHandle?.remove()
  inlineDiffHandle = null
  if (diffEditId) {
    // The file already reflects accepted hunks; mark the proposal resolved.
    agentStore.updateEditStatus(diffEditId, 'applied')
  }
  agentStore.clearPendingEdits()
  if (editor.value) clearDiffStateInMuya(editor.value)
  diffBase = ''
  diffTarget = ''
  diffEditId = null
}

function hideInlineDiff (): void {
  inlineDiffHandle?.remove()
  inlineDiffHandle = null
  diffBase = ''
  diffTarget = ''
  diffEditId = null
}

// Global Apply All / Discard All (bar above the Biscuit prompt). When a diff is
// being reviewed in the editor, route through the same hunk logic; otherwise
// just clear the store so the bar dismisses.
// Book-wide applies are transactional: snapshot the whole project first so
// the writer can rewind the entire batch from History.
async function snapshotBeforeApply (label: string): Promise<void> {
  const root = projectStore.currentProjectPath
  if (!root) return
  try {
    await window.electron.novel.snapshot(root, label)
  } catch {
    // Snapshot is protective, never blocking.
  }
}

// Auto-mode edits arrive in bursts (one proposal per tool call) — coalesce
// a burst into ONE apply-all (and therefore one pre-apply snapshot).
let autoApplyTimer: ReturnType<typeof setTimeout> | null = null
function scheduleAutoApply (): void {
  if (autoApplyTimer) clearTimeout(autoApplyTimer)
  autoApplyTimer = setTimeout(async () => {
    autoApplyTimer = null
    const count = agentStore.pendingCount
    if (count === 0) return
    await handleAgentApplyAll()
    ElMessage.success(t('biscuit.autoApplied', { count: String(count) }))
  }, 400)
}

async function handleAgentApplyAll (): Promise<void> {
  await snapshotBeforeApply('Before applying Biscuit\'s edits')
  // The open file's edit goes through the editor (in-memory + save); every
  // other pending edit is written straight to disk. Routing is verified in
  // agent-multifile-apply.spec.ts.
  const currentPath = currentFile.value?.pathname || currentFile.value?.filename || null
  const result = await applyAllPendingEdits(agentStore.pendingEdits, currentPath, {
    applyCurrent: (edit) => {
      applyContentToFile(edit.newContent)
      hideInlineDiff()
    },
    writeToDisk: (pathname, content) => window.electron.ai.writeFile(pathname, content),
    markApplied: (id) => agentStore.updateEditStatus(id, 'applied')
  })

  if (result.failed.length > 0) {
    const names = result.failed.map(f => f.path.split('/').pop() || f.path || 'unknown').join(', ')
    ElMessage.error(`${result.failed.length} file(s) could not be applied: ${names}`)
  }

  if (!inlineDiffHandle) hideInlineDiff()
  agentStore.clearPendingEdits()
}

function handleAgentDiscardAll (): void {
  if (inlineDiffHandle) {
    discardAllHunks()
  }
  agentStore.clearPendingEdits()
}

// Per-edit review from the queue in the Biscuit panel: the open file's edit
// applies through the editor, any other file is written straight to disk.
async function handleAgentApplyOne (editId: unknown): Promise<void> {
  const edit = agentStore.getPendingEdit(String(editId))
  if (!edit || edit.status !== 'pending') return

  const currentPath = currentFile.value?.pathname || currentFile.value?.filename || null
  const { currentEdit } = planMultiFileApply([edit], currentPath)

  if (currentEdit) {
    applyContentToFile(edit.newContent)
    hideInlineDiff()
  } else {
    const result = await window.electron.ai.writeFile(editDiskPath(edit), edit.newContent)
    if (!result.ok) {
      ElMessage.error(`Could not apply: ${result.error || 'write failed'}`)
      return
    }
  }
  agentStore.updateEditStatus(edit.id, 'applied')
}

function handleAgentDiscardOne (editId: unknown): void {
  const edit = agentStore.getPendingEdit(String(editId))
  if (!edit || edit.status !== 'pending') return
  // If this edit's diff is on screen, take it down too.
  if (inlineDiffHandle && diffEditId === edit.id) {
    hideInlineDiff()
  }
  agentStore.updateEditStatus(edit.id, 'rejected')
}

class SimpleImageViewer {
  container: HTMLElement
  scale: number
  translateX: number
  translateY: number
  isDragging: boolean
  startX: number
  startY: number
  img!: HTMLImageElement
  _onWheel!: (e: WheelEvent) => void
  _onMousedown!: (e: MouseEvent) => void
  _onMousemove!: (e: MouseEvent) => void
  _onMouseup!: () => void

  constructor (container: HTMLElement, { url }: { url: string }) {
    this.container = container
    this.scale = 1
    this.translateX = 0
    this.translateY = 0
    this.isDragging = false
    this.startX = 0
    this.startY = 0
    this._init(url)
  }

  _init (url: string) {
    this.container.innerHTML = ''
    this.img = document.createElement('img')
    this.img.src = url
    this.img.style.cssText =
      'max-width:90vw;max-height:90vh;object-fit:contain;transform-origin:center center;user-select:none;display:block;'
    this.img.draggable = false
    this.container.appendChild(this.img)
    this._bindEvents()
  }

  _updateTransform () {
    this.img.style.transform = `translate(${this.translateX}px,${this.translateY}px) scale(${this.scale})`
  }

  _bindEvents () {
    this._onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      this.scale = Math.max(0.1, Math.min(10, this.scale * factor))
      this._updateTransform()
    }
    this._onMousedown = (e: MouseEvent) => {
      if (e.button !== 0) return
      this.isDragging = true
      this.startX = e.clientX - this.translateX
      this.startY = e.clientY - this.translateY
      this.container.style.cursor = 'grabbing'
      e.preventDefault()
    }
    this._onMousemove = (e: MouseEvent) => {
      if (!this.isDragging) return
      this.translateX = e.clientX - this.startX
      this.translateY = e.clientY - this.startY
      this._updateTransform()
    }
    this._onMouseup = () => {
      this.isDragging = false
      this.container.style.cursor = 'grab'
    }
    this.container.addEventListener('wheel', this._onWheel, { passive: false })
    this.container.addEventListener('mousedown', this._onMousedown)
    document.addEventListener('mousemove', this._onMousemove)
    document.addEventListener('mouseup', this._onMouseup)
  }

  destroy () {
    this.container.removeEventListener('wheel', this._onWheel)
    this.container.removeEventListener('mousedown', this._onMousedown)
    document.removeEventListener('mousemove', this._onMousemove)
    document.removeEventListener('mouseup', this._onMouseup)
    this.container.innerHTML = ''
  }
}

// Watchers
watch(typewriter, (value) => {
  if (value) {
    scrollToCursor()
  }
})

watch(focus, (value) => {
  if (editor.value) {
    editor.value.setFocusMode(value)
  }
})

watch(fontSize, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setFont({ fontSize: value })
  }
})

watch(lineHeight, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setFont({ lineHeight: value })
  }
})

watch(preferLooseListItem, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({
      preferLooseListItem: value
    })
  }
})

watch(tabSize, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setTabSize(value)
  }
})

watch(theme, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    // Agreement：Any black series theme needs to contain dark `word`.
    if (/dark/i.test(value)) {
      editor.value.setOptions(
        {
          mermaidTheme: 'dark',
          vegaTheme: 'dark'
        },
        true
      )
    } else {
      editor.value.setOptions(
        {
          mermaidTheme: 'default',
          vegaTheme: 'latimes'
        },
        true
      )
    }
  }
})

watch(sequenceTheme, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ sequenceTheme: value }, true)
  }
})

watch(listIndentation, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setListIndentation(value)
  }
})

watch(frontmatterType, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ frontmatterType: value })
  }
})

watch(superSubScript, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ superSubScript: value }, true)
  }
})

watch(footnote, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ footnote: value }, true)
  }
})

watch(isHtmlEnabled, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ disableHtml: !value }, true)
  }
})

watch(isGitlabCompatibilityEnabled, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ isGitlabCompatibilityEnabled: value }, true)
  }
})

watch(hideQuickInsertHint, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ hideQuickInsertHint: value })
  }
})

watch(editorLineWidth, (value, oldValue) => {
  if (value !== oldValue) {
    setEditorWidth(value)
  }
})

watch(wrapCodeBlocks, (value, oldValue) => {
  if (value !== oldValue) {
    setWrapCodeBlocks(value)
  }
})

watch(autoPairBracket, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoPairBracket: value })
  }
})

watch(autoPairMarkdownSyntax, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoPairMarkdownSyntax: value })
  }
})

watch(autoPairQuote, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoPairQuote: value })
  }
})

watch(trimUnnecessaryCodeBlockEmptyLines, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ trimUnnecessaryCodeBlockEmptyLines: value })
  }
})

watch(bulletListMarker, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ bulletListMarker: value })
  }
})

watch(orderListDelimiter, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ orderListDelimiter: value })
  }
})

watch(hideLinkPopup, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ hideLinkPopup: value })
  }
})

watch(autoCheck, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoCheck: value })
  }
})

watch(codeFontSize, (value, oldValue) => {
  if (value !== oldValue) {
    addCommonStyle({
      codeFontSize: value,
      codeFontFamily: codeFontFamily.value,
      hideScrollbar: hideScrollbar.value
    })
  }
})

watch(codeBlockLineNumbers, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ codeBlockLineNumbers: value }, true)
  }
})

watch(codeFontFamily, (value, oldValue) => {
  if (value !== oldValue) {
    addCommonStyle({
      codeFontSize: codeFontSize.value,
      codeFontFamily: value,
      hideScrollbar: hideScrollbar.value
    })
  }
})

watch(hideScrollbar, (value, oldValue) => {
  if (value !== oldValue) {
    addCommonStyle({
      codeFontSize: codeFontSize.value,
      codeFontFamily: codeFontFamily.value,
      hideScrollbar: value
    })
  }
})

watch(spellcheckerEnabled, (value, oldValue) => {
  if (value !== oldValue) {
    // Set Muya's spellcheck container attribute.
    editor.value.setOptions({ spellcheckEnabled: value })

    // Disable native spell checker
    if (value) {
      spellchecker.activateSpellchecker(spellcheckerLanguage.value)
    } else {
      spellchecker.deactivateSpellchecker()
    }
  }
})

watch(spellcheckerNoUnderline, (value, oldValue) => {
  if (value !== oldValue) {
    // Set Muya's spellcheck container attribute.
    editor.value.setOptions({ spellcheckEnabled: !value })
  }
})

watch(spellcheckerLanguage, (value, oldValue) => {
  if (value !== oldValue) {
    spellchecker.lang = value
  }
})

watch(currentFile, (value, oldValue) => {
  if (value && value !== oldValue) {
    scrollToCursor(0)
    // Hide float tools if needed.
    if (editor.value) {
      editor.value.hideAllFloatTools()
    }
  }
})

watch(sourceCode, (value, oldValue) => {
  if (value && value !== oldValue) {
    if (editor.value) {
      editor.value.hideAllFloatTools()
    }
  }
})

// Methods
const jumpClick = (linkInfo: { href: string }) => {
  const { href } = linkInfo
  editorStore.FORMAT_LINK_CLICK({ data: { href }, dirname: window.DIRNAME })
}

interface ImagePathSuggestion {
  type: 'directory' | 'file' | string
  file: string
  [key: string]: unknown
}

const imagePathAutoComplete = async (src: string) => {
  const files = (await editorStore.ASK_FOR_IMAGE_AUTO_PATH(src)) as unknown as ImagePathSuggestion[]
  return files.map((f) => {
    const iconClass = f.type === 'directory' ? 'icon-folder' : 'icon-image'
    return Object.assign(f, { iconClass, text: f.file + (f.type === 'directory' ? '/' : '') })
  })
}

const imageAction = async (
  image: string | File,
  id: string | null,
  alt: string = ''
): Promise<string> => {
  // TODO(Refactor): Refactor this method.
  if (!currentFile.value) return ''
  const { filename, pathname: currentPathname } = currentFile.value

  // Figure out the current working directory.
  // Save an image relative to the file, otherwise use the project root when available.
  const isTabSavedOnDisk = !!currentPathname
  let relativeBasePath: string | null = isTabSavedOnDisk
    ? window.path.dirname(currentPathname)
    : null
  if (isTabSavedOnDisk && imageRelativeDirectoryBase.value !== 'file' && projectTree.value) {
    const { pathname: rootPath } = projectTree.value as { pathname?: string }
    if (rootPath && window.fileUtils.isChildOfDirectory(rootPath, currentPathname)) {
      // Save assets relative to root directory.
      relativeBasePath = rootPath
    }
  }

  const getResolvedImagePath = (imagePath: string) => {
    const replacement = isTabSavedOnDisk
      ? filename.replace(/\.[^/.]+$/, '') // Filename w/o extension
      : ''
    return imagePath.replace(/\${filename}/g, replacement)
  }

  const resolvedGlobalImageFolderPath = getResolvedImagePath(imageFolderPath.value)
  const resolvedImageRelativeDirectoryName = getResolvedImagePath(imageRelativeDirectoryName.value) // assets/
  const resolvedImageRelativeFullDirectoryPath = relativeBasePath
    ? window.path.join(relativeBasePath, resolvedImageRelativeDirectoryName)
    : null // /root/dir/assets
  let destImagePath = ''
  switch (imageInsertAction.value) {
    case 'upload': {
      try {
        // Pass the full preferences state object to avoid dereferencing non-existent .value
        destImagePath = (await uploadImage(
          currentPathname,
          image,
          preferencesStore.$state as unknown as import('@/util/fileSystem').UploadImagePreferences
        )) as string
      } catch (err) {
        notice.notify({
          title: 'Upload Image',
          type: 'warning',
          message: err as string
        })
        destImagePath = (await moveImageToFolder(
          currentPathname,
          image,
          resolvedGlobalImageFolderPath
        )) as string
      }
      break
    }
    case 'folder': {
      if (isTabSavedOnDisk && imagePreferRelativeDirectory.value) {
        // `image` may be a path string (paste/drag/image-selector) — pass
        // `currentPathname` so moveImageToFolder can resolve relative paths
        // via `path.dirname(pathname)` instead of crashing on `dirname(null)`.
        destImagePath = (await moveImageToFolder(
          currentPathname,
          image,
          resolvedImageRelativeFullDirectoryPath as string,
          true,
          currentPathname
        )) as string
      } else {
        destImagePath = (await moveImageToFolder(
          currentPathname,
          image,
          resolvedGlobalImageFolderPath
        )) as string
      }
      break
    }
    case 'path': {
      if (typeof image === 'string') {
        // Input is a local path.
        destImagePath = image
      } else {
        // Save and move image to image folder if input is binary.

        // Respect user preferences if tab exists on disk.
        if (isTabSavedOnDisk && imagePreferRelativeDirectory.value) {
          destImagePath = (await moveImageToFolder(
            null as unknown as string,
            image,
            resolvedImageRelativeFullDirectoryPath as string,
            true,
            currentPathname
          )) as string
        } else {
          destImagePath = (await moveImageToFolder(
            currentPathname,
            image,
            resolvedGlobalImageFolderPath
          )) as string
        }
      }
      break
    }
  }

  if (id && sourceCode.value) {
    bus.emit('image-action', {
      id,
      result: destImagePath,
      alt
    })
  }
  return destImagePath
}

const imagePathPicker = () => {
  return editorStore.ASK_FOR_IMAGE_PATH()
}

const keyup = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    setImageViewerVisible(false)
  }
}

const setImageViewerVisible = (status: boolean) => {
  imageViewerVisible.value = status
  if (!status && imageViewer) {
    imageViewer.destroy()
    imageViewer = null
  }
}

const switchSpellcheckLanguage = (languageCode: unknown) => {
  const { isEnabled } = spellchecker

  // This method is also called from bus, so validate state before continuing.
  if (!isEnabled) {
    throw new Error(t('editor.spellcheck.disabledError'))
  }

  spellchecker
    .switchLanguage(languageCode)
    .then((langCode: string | null | undefined) => {
      if (!langCode) {
        // Unable to switch language due to missing dictionary. The spell checker is now in an invalid state.
        notice.notify({
          title: t('editor.spellcheck.title'),
          type: 'warning',
          message: t('editor.spellcheck.languageMissing', { languageCode: languageCode as string })
        })
      }
    })
    .catch((error: unknown) => {
      log.error(
        t('editor.spellcheck.errorSwitchingLanguage', { languageCode: languageCode as string })
      )
      log.error(error)

      const errMsg = (error as { message?: string } | null | undefined)?.message ?? String(error)
      notice.notify({
        title: t('editor.spellcheck.title'),
        type: 'error',
        message: t('editor.spellcheck.switchError', {
          languageCode: languageCode as string,
          error: errMsg
        })
      })
    })
}

const handleInvalidateImageCache = () => {
  if (editor.value) {
    editor.value.invalidateImageCache()
  }
}

const openSpellcheckerLanguageCommand = () => {
  if (!isOsx) {
    bus.emit('show-command-palette', switchLanguageCommand)
  }
}

const replaceMisspelling = (payload: unknown) => {
  const { word, replacement } = payload as { word: string; replacement: string }
  if (editor.value) {
    editor.value._replaceCurrentWordInlineUnsafe(word, replacement)
  }
}

const handleUndo = () => {
  if (editor.value) {
    editor.value.undo()
  }
}

const handleRedo = () => {
  if (editor.value) {
    editor.value.redo()
  }
}

const handleSelectAll = () => {
  if (sourceCode.value) {
    return
  }

  if (editor.value && (editor.value.hasFocus() || editor.value.contentState.selectedTableCells)) {
    editor.value.selectAll()
  } else {
    const activeElement = document.activeElement as HTMLElement | null
    const nodeName = activeElement?.nodeName
    if (nodeName === 'INPUT' || nodeName === 'TEXTAREA') {
      const selectable = activeElement as HTMLInputElement | HTMLTextAreaElement | null
      if (selectable && typeof selectable.select === 'function') {
        selectable.select()
      }
    }
  }
}

// Custom copyAsRich copyAsHtml pasteAsPlainText
const handleCopyPaste = (type: unknown) => {
  if (editor.value) {
    editor.value[type as string]()
  }
}

const insertImage = (src: unknown) => {
  if (!sourceCode.value) {
    editor.value && editor.value.insertImage({ src })
  }
}

const handleSearch = (payload: unknown) => {
  const { value, opt } = payload as { value: string; opt: unknown }
  const searchMatches = editor.value.search(value, opt)
  editorStore.SEARCH(searchMatches)
  scrollToHighlight()
}

const handReplace = (payload: unknown) => {
  const { value, opt } = payload as { value: string; opt: unknown }
  const searchMatches = editor.value.replace(value, opt)
  editorStore.SEARCH(searchMatches)
}

const handleUploadedImage = (url: unknown, deletionUrl?: unknown) => {
  insertImage(url)
  editorStore.SHOW_IMAGE_DELETION_URL(deletionUrl as string)
}

const scrollToCursor = (duration = 300) => {
  nextTick(() => {
    const { container } = editor.value
    if (!container) return
    const { y } = editor.value.getSelection().cursorCoords
    animatedScrollTo(container, container.scrollTop + y - STANDAR_Y, duration)
  })
}

const scrollToCords = (y: number) => {
  const { container } = editor.value
  // Depending on how much the user previously scrolled, sometimes the container has not fully rendered all elements.
  // Hence, container.scrollHeight < [saved scrollTop]
  // What we need to do is to temporarily add a padding to the container so that we can actually set the scrollTop without getting clamped.

  const maxScrollHeight = container.scrollHeight - container.clientHeight // max scroll height is actually calculated as such
  if (y > maxScrollHeight) {
    const editorId = container.firstElementChild
    editorId.style.paddingBottom = `${y - maxScrollHeight + 100}px` // 100px is the default ag-editor-id padding
    // attach a resize observer so we know when to remove the padding when it is of the "correct" height
    resizeObserverForEditor.observe(editorId)
  }
  requestAnimationFrame(() => {
    if (!container) return
    // wait for the padding to be applied (if any)
    container.style.visibility = 'visible'
    container.style.pointerEvents = 'auto'
    container.scrollTop = y
  })
}

const scrollToHighlight = () => {
  return scrollToElement('.ag-highlight')
}

const scrollToHeader = (slug: unknown) => {
  return scrollToElement(`#${slug}`)
}

const scrollToElement = (selector: string) => {
  // Scroll to search highlight word
  const { container } = editor.value
  const anchor = document.querySelector(selector)
  if (anchor) {
    const { y } = anchor.getBoundingClientRect()
    const DURATION = 300
    animatedScrollTo(container, container.scrollTop + y - STANDAR_Y, DURATION)
  }
}

const handleFindAction = (action: unknown) => {
  const searchMatches = editor.value.find(action)
  editorStore.SEARCH(searchMatches)
  scrollToHighlight()
}

interface ExportOptions {
  type: string
  header?: unknown
  footer?: unknown
  headerFooterStyled?: unknown
  htmlTitle?: string
  pageSize?: unknown
  pageSizeWidth?: unknown
  pageSizeHeight?: unknown
  isLandscape?: unknown
  [key: string]: unknown
}

const handleExport = async (options: unknown) => {
  const opts = options as ExportOptions
  const { type, header, footer, headerFooterStyled, htmlTitle } = opts

  if (!/^pdf|print|styledHtml$/.test(type)) {
    throw new Error(`Invalid type to export: "${type}".`)
  }

  const extraCss = await getCssForOptions(opts as unknown as PdfCssOptions)
  const htmlToc = getHtmlToc(editor.value.getTOC(), opts as unknown as HtmlTocOptions)

  switch (type) {
    case 'styledHtml': {
      try {
        const content = await editor.value.exportStyledHTML({
          title: htmlTitle || '',
          printOptimization: false,
          extraCss,
          toc: htmlToc
        })
        editorStore.EXPORT({ type, content })
      } catch (err) {
        log.error('Failed to export document:', err)
        notice.notify({
          title: t('editor.export.failed', { type: htmlTitle || 'html' }),
          type: 'error',
          message:
            (err as { message?: string } | null | undefined)?.message ?? t('editor.export.error')
        })
      }
      break
    }
    case 'pdf': {
      // NOTE: We need to set page size via Electron.
      try {
        const { pageSize, pageSizeWidth, pageSizeHeight, isLandscape } = opts
        const pageOptions = {
          pageSize,
          pageSizeWidth,
          pageSizeHeight,
          isLandscape
        }

        const html = await editor.value.exportStyledHTML({
          title: '',
          printOptimization: true,
          extraCss,
          toc: htmlToc,
          header,
          footer,
          headerFooterStyled
        })
        printer.renderMarkdown(html, true)
        editorStore.EXPORT({ type, pageOptions })
      } catch (err) {
        log.error('Failed to export document:', err)
        notice.notify({
          title: t('editor.export.failed', { type: 'PDF' }),
          type: 'error',
          message: t('editor.export.errorExporting', { type: htmlTitle || 'PDF' })
        })
        handlePrintServiceClearup()
      }
      break
    }
    case 'print': {
      // NOTE: Print doesn't support page size or orientation.
      try {
        const html = await editor.value.exportStyledHTML({
          title: '',
          printOptimization: true,
          extraCss,
          toc: htmlToc,
          header,
          footer,
          headerFooterStyled
        })
        printer.renderMarkdown(html, true)
        editorStore.PRINT_RESPONSE()
      } catch (err) {
        log.error('Failed to export document:', err)
        notice.notify({
          title: t('editor.print.failed'),
          type: 'error',
          message: t('editor.print.error', { title: htmlTitle || '' })
        })
        handlePrintServiceClearup()
      }
      break
    }
  }
}

const handlePrintServiceClearup = () => {
  printer.clearup()
}

const handleEditParagraph = (type: unknown) => {
  if (type === 'table') {
    tableChecker.rows = 4
    tableChecker.columns = 3
    dialogTableVisible.value = true
    nextTick(() => {
      rowInput.value?.focus()
    })
  } else if (editor.value) {
    editor.value.updateParagraph(type)
  }
}

// handle `duplicate`, `delete`, `create paragraph below`
const handleParagraph = (type: unknown) => {
  if (editor.value) {
    switch (type) {
      case 'duplicate': {
        return editor.value.duplicate()
      }
      case 'createParagraph': {
        return editor.value.insertParagraph('after', '', true)
      }
      case 'deleteParagraph': {
        return editor.value.deleteParagraph()
      }
      default:
        console.error(`unknow paragraph edit type: ${type}`)
    }
  }
}

const handleInlineFormat = (type: unknown) => {
  editor.value && editor.value.format(type)
}

const handleDialogTableConfirm = () => {
  dialogTableVisible.value = false
  editor.value && editor.value.createTable(tableChecker)
}

interface FileLoadedPayload {
  markdown?: string
  cursor?: unknown
}

// listen for `open-single-file` event, it will call this method only when open a new file.
const setMarkdownToEditor = (payload: unknown) => {
  const { markdown: newMarkdown, cursor: newCursor } = (payload ?? {}) as FileLoadedPayload
  if (editor.value) {
    editor.value.clearHistory()
    if (newCursor) {
      editor.value.setMarkdown(newMarkdown, newCursor, true)
    } else {
      editor.value.setMarkdown(newMarkdown)
    }
  }
}

interface FileChangePayload {
  markdown?: string
  cursor?: unknown
  renderCursor?: boolean
  history?: unknown
  scrollTop?: number
  muyaIndexCursor?: unknown
  blocks?: unknown
}

// listen for markdown change form source mode or change tabs etc
const handleFileChange = (payload: unknown) => {
  const {
    markdown: newMarkdown,
    cursor: newCursor,
    renderCursor,
    history,
    scrollTop,
    muyaIndexCursor,
    blocks = undefined
  } = (payload ?? {}) as FileChangePayload
  const { container } = editor.value

  if (editor.value) {
    if (history) {
      editor.value.setHistory(history)
    }

    if (typeof newMarkdown === 'string') {
      editor.value.setMarkdown(newMarkdown, newCursor, renderCursor, muyaIndexCursor, blocks)
    } else if (newCursor) {
      editor.value.setCursor(newCursor)
    }

    if (typeof scrollTop === 'number') {
      container.style.visibility = 'hidden'
      container.style.pointerEvents = 'none'
      scrollToCords(scrollTop)
    } else {
      container.style.visibility = 'visible'
      container.style.pointerEvents = 'auto'
      scrollToCursor(0)
    }
  }
}

const handleInsertParagraph = (location: unknown) => {
  editor.value && editor.value.insertParagraph(location)
}

const blurEditor = () => {
  editor.value?.blur(false, true)
}

const focusEditor = () => {
  editor.value?.focus()
}

const handleScreenShot = () => {
  if (editor.value) {
    document.execCommand('paste')
  }
}

// Handle agent edit application through Muya
const handleApplyAgentEdit = (request: {
  edit: {
    id: string
    filePath: string
    start?: number
    end?: number
    newContent: string
    reason?: string
  }
  oldContent: string
  originalPath: string
}) => {
  if (!editor.value || !currentFile.value) return

  const applied = applyAgentEditToCurrentFile(request, {
    currentFile: currentFile.value,
    setMarkdown: (markdown: string) => {
      editor.value?.setMarkdown(markdown)
    },
    save: () => {
      editorStore.FILE_SAVE()
    }
  })

  if (!applied) return

  clearDiffStateInMuya(editor.value)
  hideInlineDiff()
}

const handleResetPaddingBottom = () => {
  const { container } = editor.value
  const firstChild = container.firstElementChild as HTMLElement | null
  if (!firstChild) return
  const newScollableHeightWithoutPadding =
    container.scrollHeight - container.clientHeight - parseFloat(firstChild.style.paddingBottom)

  if (currentFile.value && newScollableHeightWithoutPadding > currentFile.value.scrollTop) {
    container.style.paddingBottom = ''
    resizeObserverForEditor.unobserve(firstChild) // unobserve #ag-editor-id since we have removed the padding
  }
}

const handleLanguageChanged = () => {
  if (editor.value) {
    editor.value.setOptions({ t })
  }
}
const resizeObserverForEditor = new ResizeObserver(handleResetPaddingBottom)

onMounted(() => {
  printer = new Printer()
  const ele = editorRef.value

  // use muya UI plugins
  Muya.use(TablePicker)
  Muya.use(QuickInsert)
  Muya.use(CodePicker)
  Muya.use(EmojiPicker)
  Muya.use(ImagePathPicker)
  Muya.use(ImageSelector)
  Muya.use(Transformer)
  Muya.use(ImageToolbar)
  Muya.use(FormatPicker)
  Muya.use(FrontMenu)
  Muya.use(LinkTools, {
    jumpClick
  })
  Muya.use(FootnoteTool)
  Muya.use(TableBarTools)

  const options: Record<string, unknown> = {
    focusMode: focus.value,
    markdown: props.markdown,
    preferLooseListItem: preferLooseListItem.value,
    autoPairBracket: autoPairBracket.value,
    autoPairMarkdownSyntax: autoPairMarkdownSyntax.value,
    trimUnnecessaryCodeBlockEmptyLines: trimUnnecessaryCodeBlockEmptyLines.value,
    autoPairQuote: autoPairQuote.value,
    bulletListMarker: bulletListMarker.value,
    orderListDelimiter: orderListDelimiter.value,
    tabSize: tabSize.value,
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    codeBlockLineNumbers: codeBlockLineNumbers.value,
    listIndentation: listIndentation.value,
    frontmatterType: frontmatterType.value,
    superSubScript: superSubScript.value,
    footnote: footnote.value,
    disableHtml: !isHtmlEnabled.value,
    isGitlabCompatibilityEnabled: isGitlabCompatibilityEnabled.value,
    hideQuickInsertHint: hideQuickInsertHint.value,
    hideLinkPopup: hideLinkPopup.value,
    autoCheck: autoCheck.value,
    sequenceTheme: sequenceTheme.value,
    spellcheckEnabled: spellcheckerEnabled.value,
    imageAction,
    imagePathPicker,
    clipboardFilePath: guessClipboardFilePath,
    imagePathAutoComplete,
    t // Add the translation function
  }

  if (/dark/i.test(theme.value)) {
    Object.assign(options, {
      mermaidTheme: 'dark',
      vegaTheme: 'dark'
    })
  } else {
    Object.assign(options, {
      mermaidTheme: 'default',
      vegaTheme: 'latimes'
    })
  }

  editor.value = new Muya(ele, options)

  const { container } = editor.value

  // Listen for language changes and update Muya's translation function
  bus.on('language-changed', handleLanguageChanged)

  // Create spell check wrapper and enable spell checking if preferred.
  spellchecker = new SpellChecker(spellcheckerEnabled.value, spellcheckerLanguage.value)

  // Register command palette entry for switching spellchecker language.
  switchLanguageCommand = new SpellcheckerLanguageCommand(spellchecker)
  setTimeout(() => bus.emit('cmd::register-command', switchLanguageCommand), 100)

  if (typewriter.value) {
    scrollToCursor()
  }

  // listen for bus events.
  bus.on('file-loaded', setMarkdownToEditor)
  bus.on('invalidate-image-cache', handleInvalidateImageCache)
  bus.on('undo', handleUndo)
  bus.on('redo', handleRedo)
  bus.on('selectAll', handleSelectAll)
  bus.on('export', handleExport)
  bus.on('print-service-clearup', handlePrintServiceClearup)
  bus.on('paragraph', handleEditParagraph)
  bus.on('format', handleInlineFormat)
  bus.on('searchValue', handleSearch)
  bus.on('replaceValue', handReplace)
  bus.on('find-action', handleFindAction)
  bus.on('insert-image', insertImage)
  bus.on('image-uploaded', handleUploadedImage)
  bus.on('file-changed', handleFileChange)
  bus.on('editor-blur', blurEditor)
  bus.on('editor-focus', focusEditor)
  bus.on('copyAsRich', handleCopyPaste)
  bus.on('copyAsHtml', handleCopyPaste)
  bus.on('pasteAsPlainText', handleCopyPaste)
  bus.on('duplicate', handleParagraph)
  bus.on('createParagraph', handleParagraph)
  bus.on('deleteParagraph', handleParagraph)
  bus.on('insertParagraph', handleInsertParagraph)
  bus.on('scroll-to-header', scrollToHeader)
  bus.on('screenshot-captured', handleScreenShot)
  bus.on('switch-spellchecker-language', switchSpellcheckLanguage)
  bus.on('open-command-spellchecker-switch-language', openSpellcheckerLanguageCommand)
  bus.on('replace-misspelling', replaceMisspelling)
  bus.on('apply-agent-edit', handleApplyAgentEdit as any)
  // Global Apply All / Discard All from the bar above the Biscuit prompt
  bus.on('agent-apply-all', handleAgentApplyAll)
  bus.on('agent-apply-one', handleAgentApplyOne)
  bus.on('agent-discard-one', handleAgentDiscardOne)
  bus.on('agent-discard-all', handleAgentDiscardAll)

  // Listen for AI edit proposals from main process
  unsubscribeEditProposal = window.electron.ai.onEditProposal((proposal) => {
    if (!editor.value || !currentFile.value) return

    agentStore.addPendingEdit(proposal.edit, proposal.oldContent, proposal.originalPath)

    // Auto / full-auto: the writer chose speed over per-edit review — apply
    // automatically. Safety comes from the snapshot handleAgentApplyAll
    // takes before writing, so the whole batch is one Rewind away. Ask and
    // plan modes keep the review gate.
    const mode = localStorage.getItem('biscuit-mode')
    if (mode === 'auto') {
      scheduleAutoApply()
      return
    }

    const proposalPath = proposal.edit.filePath || ''
    const currentPath = currentFile.value.filename || currentFile.value.pathname || ''

    const pathsMatch =
      proposalPath === currentPath ||
      proposalPath.endsWith('/' + currentPath) ||
      currentPath.endsWith('/' + proposalPath) ||
      proposalPath.split('/').pop() === currentPath.split('/').pop()

    if (!pathsMatch) return

    // The inline diff is fully self-contained: it hides the changed blocks and
    // renders a line-level unified hunk in their place. No Muya block coloring.
    showInlineDiff({
      oldContent: proposal.oldContent,
      newContent: proposal.edit.newContent,
      reason: proposal.edit.reason,
      filePath: proposal.edit.filePath
    })
  })

  editor.value.on('change', (changes: MuyaChange) => {
    // There is a chance that this event is fired AFTER the tab is switched. If we purely rely on this.currentFile later on
    // it can cause invalid updates. Hence, we need the id to identify changes as part of each tab
    if (!currentFile.value) return
    const { id } = currentFile.value
    if (id) {
      editorStore.LISTEN_FOR_CONTENT_CHANGE(
        Object.assign(changes, { id, blocks: editor.value.contentState.getBlocks() })
      )
    }
  })

  editor.value.on('scroll', (scrollEvent: { scrollTop: number }) => {
    if (currentFile.value) {
      editorStore.updateScrollPosition(currentFile.value.id, scrollEvent.scrollTop)
    }
  })

  editor.value.on('heading-copy-link', ({ key }: { key: string }) => {
    editorStore.copyGithubSlug(key)
  })

  editor.value.on(
    'format-click',
    ({ event, formatType, data }: { event: MouseEvent; formatType: string; data: unknown }) => {
      const ctrlOrMeta = (isOsx && event.metaKey) || (!isOsx && event.ctrlKey)
      if (formatType === 'link' && ctrlOrMeta) {
        editorStore.FORMAT_LINK_CLICK({
          data: data as { href: string; [key: string]: unknown },
          dirname: window.DIRNAME
        })
      } else if (formatType === 'image' && ctrlOrMeta) {
        if (imageViewer) {
          imageViewer.destroy()
        }
        if (imageViewerRef.value) {
          imageViewer = new SimpleImageViewer(imageViewerRef.value, { url: data as string })
          setImageViewerVisible(true)
        }
      }
    }
  )

  editor.value.on('preview-image', ({ data }: { data: string }) => {
    if (imageViewer) {
      imageViewer.destroy()
    }
    if (imageViewerRef.value) {
      imageViewer = new SimpleImageViewer(imageViewerRef.value, { url: data })
      setImageViewerVisible(true)
    }
  })

  editor.value.on('selectionChange', (changes: MuyaChange) => {
    const { y } = changes.cursorCoords as { y: number }
    if (typewriter.value) {
      const startPosition = container.scrollTop
      const toPosition = startPosition + y - STANDAR_Y

      // Prevent micro shakes and unnecessary scrolling.
      if (Math.abs(startPosition - toPosition) > 2) {
        animatedScrollTo(container, toPosition, 100)
      }
    }

    // Used to fix #628: auto scroll cursor to visible if the cursor is too low.
    if (container.clientHeight - y < 100) {
      // editableHeight is the lowest cursor position(till to top) that editor allowed.
      const editableHeight = container.clientHeight - 100
      animatedScrollTo(container, container.scrollTop + (y - editableHeight), 0)
    }

    selectionChange.value = changes
    editorStore.SELECTION_CHANGE(changes)
  })

  editor.value.on('selectionFormats', (formats: MuyaChange) => {
    editorStore.SELECTION_FORMATS(formats)
  })

  document.addEventListener('keyup', keyup)

  setWrapCodeBlocks(wrapCodeBlocks.value)
  setEditorWidth(editorLineWidth.value)
})

onBeforeUnmount(() => {
  bus.off('file-loaded', setMarkdownToEditor)
  bus.off('invalidate-image-cache', handleInvalidateImageCache)
  bus.off('undo', handleUndo)
  bus.off('redo', handleRedo)
  bus.off('selectAll', handleSelectAll)
  bus.off('export', handleExport)
  bus.off('print-service-clearup', handlePrintServiceClearup)
  bus.off('paragraph', handleEditParagraph)
  bus.off('format', handleInlineFormat)
  bus.off('searchValue', handleSearch)
  bus.off('replaceValue', handReplace)
  bus.off('find-action', handleFindAction)
  bus.off('insert-image', insertImage)
  bus.off('image-uploaded', handleUploadedImage)
  bus.off('file-changed', handleFileChange)
  bus.off('editor-blur', blurEditor)
  bus.off('editor-focus', focusEditor)
  bus.off('copyAsRich', handleCopyPaste)
  bus.off('copyAsHtml', handleCopyPaste)
  bus.off('pasteAsPlainText', handleCopyPaste)
  bus.off('duplicate', handleParagraph)
  bus.off('createParagraph', handleParagraph)
  bus.off('deleteParagraph', handleParagraph)
  bus.off('insertParagraph', handleInsertParagraph)
  bus.off('scroll-to-header', scrollToHeader)
  bus.off('screenshot-captured', handleScreenShot)
  bus.off('switch-spellchecker-language', switchSpellcheckLanguage)
  bus.off('open-command-spellchecker-switch-language', openSpellcheckerLanguageCommand)
  bus.off('replace-misspelling', replaceMisspelling)
  bus.off('apply-agent-edit', handleApplyAgentEdit as any)
  bus.off('agent-apply-all', handleAgentApplyAll)
  bus.off('agent-apply-one', handleAgentApplyOne)
  bus.off('agent-discard-one', handleAgentDiscardOne)
  bus.off('agent-discard-all', handleAgentDiscardAll)
  bus.off('language-changed', handleLanguageChanged)

  // Remove AI edit proposal listener
  if (unsubscribeEditProposal) {
    unsubscribeEditProposal()
    unsubscribeEditProposal = null
  }
  hideInlineDiff()

  document.removeEventListener('keyup', keyup)
  if (editor.value) {
    editor.value.off('change')
    editor.value.off('scroll')
    editor.value.off('heading-copy-link')
    editor.value.off('format-click')
    editor.value.off('selectionChange')
    editor.value.off('selectionFormats')
  }

  resizeObserverForEditor.disconnect()

  if (imageViewer) {
    imageViewer.destroy()
    imageViewer = null
  }

  if (editor.value) {
    editor.value.destroy()
    editor.value = null
  }
})
</script>

<style>
/* ... existing style ... */
.editor-wrapper {
  height: 100%;
  position: relative;
  flex: 1;
  color: var(--editorColor);
}

.ag-insert-table-dialog {
  & .el-form--inline {
    display: flex;
    flex-wrap: nowrap;
    justify-content: space-between;
    align-items: center;
  }
  & .el-form--inline .el-form-item {
    margin-right: 0;
  }
  & .el-input-number {
    width: 100px;
    min-width: 0;
  }
  & .el-button {
    font-size: 13px;
    width: 70px;
  }
}

.editor-wrapper.source {
  position: absolute;
  z-index: -1;
  top: 0;
  left: 0;
  overflow: hidden;
}

.editor-component {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  cursor: default;
  overflow-anchor: none !important;
}

.typewriter .editor-component {
  padding-top: calc(50vh - 136px);
  padding-bottom: calc(50vh - 54px);
}

.image-viewer {
  position: fixed;
  backdrop-filter: blur(5px);
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 11;
  & .icon-close {
    z-index: 1000;
    width: 30px;
    height: 30px;
    position: absolute;
    top: 50px;
    left: 50px;
    display: block;
    color: #efefef;
    & svg {
      width: 100%;
      height: 100%;
    }
  }
}

.image-viewer > div {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  overflow: hidden;
}

/* ── Inline diff injected into Muya's contenteditable as void nodes ─────────
   .wb-diff-codelens and .wb-diff-hunk use contentEditable="false" so Muya
   treats them as opaque blocks and leaves them unedited.                    */

/* CodeLens bar — sits in document flow just above the diff hunk */
.wb-diff-codelens {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 0 4px;
  user-select: none;
  border-bottom: 1px solid var(--lineColor, rgba(0, 0, 0, 0.08));
  margin-bottom: 2px;
}

.wb-diff-codelens__label {
  font-family: var(--editorFontFamily, inherit);
  font-size: 12px;
  font-style: italic;
  color: var(--editorColor, #666);
  opacity: 0.65;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-diff-codelens__actions {
  display: flex;
  gap: 14px;
  margin-left: auto;
}

/* Shared text-style buttons for both the file-level header and per-hunk header */
.wb-diff-btn {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--editorFontFamily, inherit);
  cursor: pointer;
  color: var(--themeColor, #0078d4);
  line-height: 1.5;
}

.wb-diff-btn:hover { opacity: 0.7; }

.wb-diff-btn--discard {
  color: var(--editorColor, #888);
}

/* Unified diff hunk — replaces the hidden original blocks. Renders the change
   line-by-line: red − for removed, green + for added, muted for context. */
.wb-diff-hunk {
  margin: 4px 0;
  user-select: none;
  font-family: var(--editorFontFamily, inherit);
  font-size: inherit;
  line-height: inherit;
  border: 1px solid var(--lineColor, rgba(0, 0, 0, 0.1));
  border-radius: 4px;
  overflow: hidden;
}

/* Per-hunk header — the "Change N" label and its own Accept / Discard */
.wb-diff-hunk__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px;
  background: var(--floatHoverColor, rgba(0, 0, 0, 0.04));
  border-bottom: 1px solid var(--lineColor, rgba(0, 0, 0, 0.08));
}

.wb-diff-hunk__tag {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.55;
  color: var(--editorColor, #666);
}

.wb-diff-hunk__actions {
  display: flex;
  gap: 12px;
  margin-left: auto;
}

/* The original Muya blocks being replaced are hidden while the diff is shown */
.wb-diff-hidden {
  display: none !important;
}

/* Individual diff line rows */
.wb-diff-line {
  display: flex;
  align-items: baseline;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 1.5em;
}

.wb-diff-line__gutter {
  width: 22px;
  min-width: 22px;
  text-align: center;
  flex-shrink: 0;
  font-weight: 700;
  user-select: none;
  opacity: 0.8;
}

.wb-diff-line__text {
  flex: 1;
  padding-right: 8px;
}

.wb-diff-line--removed {
  background: rgba(229, 83, 75, 0.14);
}
.wb-diff-line--removed .wb-diff-line__gutter { color: #e0544c; }
.wb-diff-line--removed .wb-diff-line__text {
  color: var(--editorColor, #333);
  text-decoration: line-through;
  text-decoration-color: rgba(229, 83, 75, 0.5);
}

.wb-diff-line--added {
  background: rgba(40, 167, 69, 0.14);
}
.wb-diff-line--added .wb-diff-line__gutter { color: #28a745; }
.wb-diff-line--added .wb-diff-line__text   { color: var(--editorColor, #222); }

.wb-diff-line--equal {
  opacity: 0.5;
}
.wb-diff-line--equal .wb-diff-line__text { color: var(--editorColor, #555); }

.wb-diff-line--collapsed {
  justify-content: center;
  color: var(--editorColor, #999);
  opacity: 0.5;
  font-size: 11px;
  letter-spacing: 2px;
  min-height: 1.2em;
}
</style>
