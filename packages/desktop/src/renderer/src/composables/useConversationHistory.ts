/**
 * Conversation history for the Biscuit panel.
 *
 * Owns the renderer-local conversation list (persisted in localStorage),
 * the durable per-project transcript mirror under `.wordbird/transcripts/`
 * (searchable by the agents via search_manuscript), and transcript export.
 *
 * The component keeps ownership of the live `aiMessages` ref and of any
 * per-run state; `onSwitch` is invoked whenever the active conversation
 * changes so that state can be cleared in one place.
 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '../store/project'
import { conversationKeys } from '../util/conversationKeys'
import { t } from '../i18n'
import type { ILangGraphMessage } from '@shared/types/langgraph'

export interface ErrorInfo {
  title: string
  explanation: string
  showSettings?: boolean
}

export interface ChatEntry extends ILangGraphMessage {
  errorInfo?: ErrorInfo
}

export interface StoredConversation {
  id: string
  title: string
  messages: ChatEntry[]
  updatedAt: number
}

// sessionStorage is per-window: a reload keeps it, File → New Window and a
// fresh app launch start without it. That distinction drives initialize().
const WINDOW_KEY = 'biscuit-window-conversation'

export interface ConversationHistory {
  conversations: Ref<StoredConversation[]>
  currentId: Ref<string>
  historyVisible: Ref<boolean>
  sortedConversations: ComputedRef<StoredConversation[]>
  initialize: () => void
  /** Reset the main-side thread once, iff this window started fresh. */
  claimFreshThreadIfNeeded: () => Promise<void>
  saveCurrent: () => void
  newConversation: () => Promise<void>
  loadConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  exportTranscript: () => Promise<void>
}

export const useConversationHistory = (options: {
  aiMessages: Ref<ChatEntry[]>
  isBusy: () => boolean
  /** Clear per-run component state (agents, approvals, usage…). */
  onSwitch: () => void
  /** Runs after a conversation is loaded into aiMessages (e.g. scroll). */
  afterLoad?: () => Promise<void> | void
}): ConversationHistory => {
  const { aiMessages, isBusy, onSwitch, afterLoad } = options

  const conversations = ref<StoredConversation[]>([])
  const currentId = ref<string>('')
  const historyVisible = ref(false)

  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt)
  )

  /** Storage keys for the CURRENTLY open project (re-read on every access,
   * so switching projects switches lists). */
  const keys = (): { history: string; current: string } =>
    conversationKeys(useProjectStore().currentProjectPath)

  const loadHistory = (): void => {
    try {
      const raw = localStorage.getItem(keys().history)
      conversations.value = raw ? (JSON.parse(raw) as StoredConversation[]) : []
    } catch {
      conversations.value = []
    }
    currentId.value = localStorage.getItem(keys().current) || ''
  }

  // Fresh windows must not silently continue the durable thread another
  // window (or session) was using — reset it lazily on the first send.
  let needsFreshThread = false

  /**
   * Reloads restore this window's own conversation (claimed in
   * sessionStorage); a brand-new window or app launch starts with a clean
   * chat — earlier conversations stay one click away in the history list.
   */
  const initialize = (): void => {
    loadHistory()
    const claimed = sessionStorage.getItem(WINDOW_KEY)
    if (claimed === null) {
      currentId.value = ''
      aiMessages.value = []
      needsFreshThread = true
    } else {
      currentId.value = claimed
      const current = conversations.value.find((c) => c.id === claimed)
      if (current) aiMessages.value = JSON.parse(JSON.stringify(current.messages)) as ChatEntry[]
    }
    sessionStorage.setItem(WINDOW_KEY, currentId.value)
  }

  const claimFreshThreadIfNeeded = async(): Promise<void> => {
    if (!needsFreshThread) return
    needsFreshThread = false
    try {
      await window.electron.ai.resetThread()
    } catch {
      // Not connected yet — the thread will be fresh on connect anyway.
    }
  }

  const persistHistory = (): void => {
    const { history, current } = keys()
    localStorage.setItem(history, JSON.stringify(conversations.value))
    localStorage.setItem(current, currentId.value)
    sessionStorage.setItem(WINDOW_KEY, currentId.value)
  }

  const deriveTitle = (messages: ChatEntry[]): string => {
    const firstUser = messages.find((m) => m.role === 'user')
    const text = firstUser?.content?.trim() || 'New conversation'
    return text.length > 40 ? text.slice(0, 40) + '…' : text
  }

  // Save the live transcript into the current conversation entry (creating
  // one on the first message). Called whenever aiMessages changes.
  const saveCurrent = (): void => {
    if (aiMessages.value.length === 0) return
    if (!currentId.value) currentId.value = `conv-${Date.now()}`
    const snapshot = JSON.parse(JSON.stringify(aiMessages.value)) as ChatEntry[]
    const existing = conversations.value.find((c) => c.id === currentId.value)
    if (existing) {
      existing.messages = snapshot
      existing.title = deriveTitle(snapshot)
      existing.updatedAt = Date.now()
    } else {
      conversations.value.push({
        id: currentId.value,
        title: deriveTitle(snapshot),
        messages: snapshot,
        updatedAt: Date.now()
      })
    }
    persistHistory()
    scheduleTranscriptWrite(snapshot)
  }

  // Durable transcripts: every conversation is mirrored into the project at
  // .wordbird/transcripts/<id>.md — snapshot-versioned and, crucially,
  // searchable by the agents (search_manuscript reaches .wordbird except
  // agent-state), so decisions made in past chats stay discoverable.
  let transcriptTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleTranscriptWrite = (snapshot: ChatEntry[]): void => {
    if (transcriptTimer) clearTimeout(transcriptTimer)
    transcriptTimer = setTimeout(() => {
      transcriptTimer = null
      writeTranscript(snapshot)
    }, 2000)
  }

  const writeTranscript = async(snapshot: ChatEntry[]): Promise<void> => {
    const root = useProjectStore().currentProjectPath
    if (!root || !currentId.value) return
    const lines: string[] = [`# ${deriveTitle(snapshot)}`, '']
    for (const message of snapshot) {
      if (message.role === 'error' || message.role === 'stopped') continue
      const who = message.role === 'user' ? 'Writer' : 'Biscuit'
      lines.push(`## ${who}`, '', message.content, '')
    }
    const target = window.path.join(root, '.wordbird', 'transcripts', `${currentId.value}.md`)
    try {
      await window.fileUtils.outputFile(target, lines.join('\n'))
    } catch {
      // Transcript mirroring is best-effort; the localStorage copy remains.
    }
  }

  // Persist the transcript as it grows (assistant replies, errors, etc.).
  watch(aiMessages, saveCurrent, { deep: true })

  const newConversation = async(): Promise<void> => {
    // Switching threads mid-run would interleave two conversations in the
    // durable thread — stop the run first, explicitly.
    if (isBusy()) {
      ElMessage.info(t('biscuit.stopFirst'))
      return
    }
    saveCurrent()
    needsFreshThread = false
    try {
      await window.electron.ai.resetThread()
    } catch {
      // Not connected — clear the local transcript anyway.
    }
    aiMessages.value = []
    currentId.value = ''
    onSwitch()
    persistHistory()
  }

  const loadConversation = async(id: string): Promise<void> => {
    historyVisible.value = false
    if (id === currentId.value) return
    if (isBusy()) {
      ElMessage.info(t('biscuit.stopFirst'))
      return
    }
    saveCurrent()
    const conv = conversations.value.find((c) => c.id === id)
    if (!conv) return
    // Start a fresh main-process thread; the transcript is replayed as
    // context on the next send.
    needsFreshThread = false
    try {
      await window.electron.ai.resetThread()
    } catch {
      // ignore — not connected
    }
    aiMessages.value = JSON.parse(JSON.stringify(conv.messages)) as ChatEntry[]
    currentId.value = id
    onSwitch()
    persistHistory()
    await afterLoad?.()
  }

  const deleteConversation = async(id: string): Promise<void> => {
    const conv = conversations.value.find((c) => c.id === id)
    try {
      await ElMessageBox.confirm(
        t('biscuit.deleteConversationConfirm', { title: conv?.title ?? '' }),
        { type: 'warning', confirmButtonText: t('biscuit.deleteTip') }
      )
    } catch {
      return // writer cancelled
    }
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (id === currentId.value) {
      aiMessages.value = []
      currentId.value = ''
    }
    persistHistory()
  }

  const exportTranscript = async(): Promise<void> => {
    historyVisible.value = false
    const lines: string[] = [`# Biscuit — ${new Date().toISOString().slice(0, 10)}`, '']
    for (const message of aiMessages.value) {
      const who =
        message.role === 'user' ? 'Writer' : message.role === 'error' ? 'Error' : 'Biscuit'
      lines.push(`## ${who}`, '', message.content, '')
    }
    const content = lines.join('\n')
    const root = useProjectStore().currentProjectPath
    if (root) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const target = window.path.join(root, 'notes', 'transcripts', `chat-${stamp}.md`)
      try {
        await window.fileUtils.outputFile(target, content)
        ElMessage.success(t('biscuit.exported', { path: target }))
        return
      } catch {
        // fall through to clipboard
      }
    }
    window.electron.clipboard.writeText(content)
    ElMessage.success(t('biscuit.exportedClipboard'))
  }

  // Switching projects switches conversation lists. Without this the panel
  // would keep showing the previous project's chats until the window
  // reloaded — the visible half of the leak this keying fixes.
  watch(
    () => useProjectStore().currentProjectPath,
    (root, previousRoot) => {
      if (root === previousRoot) return
      saveCurrent()
      loadHistory()
      currentId.value = ''
      aiMessages.value = []
      needsFreshThread = true
      onSwitch()
    }
  )

  return {
    conversations,
    currentId,
    historyVisible,
    sortedConversations,
    initialize,
    claimFreshThreadIfNeeded,
    saveCurrent,
    newConversation,
    loadConversation,
    deleteConversation,
    exportTranscript
  }
}
