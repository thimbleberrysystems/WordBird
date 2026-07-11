<template>
  <aside
    class="right-prompt"
    role="complementary"
    aria-label="Biscuit chat panel"
    :style="rightPromptStyle"
  >
    <div
      class="resizer"
      @mousedown="startResizing"
    />

    <!-- Unified Toggle Button (Collapse) -->
    <div
      class="toggle-biscuit-btn collapse"
      :title="t('biscuit.collapseTip')"
      @click="togglePanel"
    >
      <el-icon><DArrowRight /></el-icon>
    </div>

    <header class="prompt-header">
      <div class="prompt-title">
        Biscuit
      </div>
      <div class="header-actions">
        <el-popover
          v-model:visible="historyVisible"
          placement="bottom-end"
          :width="260"
          trigger="click"
          popper-class="biscuit-history-popover"
        >
          <template #reference>
            <button
              class="header-action"
              :title="t('biscuit.historyTip')"
            >
              <el-icon><ChatLineSquare /></el-icon>
            </button>
          </template>
          <div class="history-list">
            <div class="history-list__title">
              {{ t('biscuit.conversations') }}
            </div>
            <button
              class="history-export"
              :disabled="aiMessages.length === 0"
              @click="exportTranscript"
            >
              {{ t('biscuit.exportTranscript') }}
            </button>
            <div
              v-for="conv in sortedConversations"
              :key="conv.id"
              class="history-row"
              :class="{ current: conv.id === currentId }"
              @click="loadConversation(conv.id)"
            >
              <span class="history-row__label">{{ conv.title }}</span>
              <el-icon
                class="history-row__delete"
                :title="t('biscuit.deleteTip')"
                @click.stop="deleteConversation(conv.id)"
              >
                <Delete />
              </el-icon>
            </div>
            <div
              v-if="sortedConversations.length === 0"
              class="history-empty"
            >
              {{ t('biscuit.noConversations') }}
            </div>
          </div>
        </el-popover>

        <el-tooltip
          :content="t('biscuit.newChatTip')"
          placement="bottom"
        >
          <button
            class="header-action new-chat-btn"
            @click="newConversation"
          >
            <el-icon><Plus /></el-icon>
            <span>{{ t('biscuit.newChat') }}</span>
          </button>
        </el-tooltip>
      </div>
    </header>

    <section
      ref="promptBody"
      class="prompt-body"
    >
      <template
        v-for="(message, index) in aiMessages"
        :key="index"
      >
        <!-- Errors get a structured, explained card — not a raw dump. -->
        <error-card
          v-if="message.role === 'error'"
          :content="message.content"
          :title="message.errorInfo?.title"
          :explanation="message.errorInfo?.explanation"
          :show-settings="message.errorInfo?.showSettings"
          @open-settings="openAiSettings"
        />

        <!-- Assistant replies are markdown — render a sanitized subset. -->
        <div
          v-else-if="message.role === 'assistant' || message.role === 'ai'"
          :class="['message', `message--${message.role}`]"
        >
          <!-- eslint-disable-next-line vue/no-v-html -- sanitized by DOMPurify in renderChatMarkdown -->
          <div
            class="message__text message__text--md"
            @click="handleMarkdownClick"
            v-html="renderChatMarkdown(message.content)"
          />
        </div>

        <div
          v-else
          :class="['message', `message--${message.role}`]"
        >
          <div class="message__text">
            {{ message.content }}
          </div>
        </div>
      </template>

      <!-- Plan approval card (Claude-Code-style plan mode) -->
      <plan-card
        v-if="pendingPlan"
        :plan="pendingPlan"
        @approve="approvePlan"
        @dismiss="dismissPlan"
      />

      <!-- Approval request card (ask mode) -->
      <div
        v-if="pendingApproval"
        class="approval-card"
      >
        <div class="approval-title">
          {{ t('biscuit.approvalTitle') }}
        </div>
        <div class="approval-summary">
          {{ pendingApproval.summary }}
        </div>
        <div class="approval-actions">
          <el-button
            size="small"
            @click="respondApproval(false)"
          >
            {{ t('biscuit.decline') }}
          </el-button>
          <el-button
            size="small"
            type="primary"
            @click="respondApproval(true)"
          >
            {{ t('biscuit.approve') }}
          </el-button>
        </div>
      </div>

      <!-- Live agent panel: per-agent status, elapsed, cancel; the raw
           activity log folds underneath. Persists after the turn. -->
      <agent-panel
        :agents="agentList"
        :activity="activity"
        @cancel="cancelAgent"
        @retry="retryAgent"
      />

      <!-- Thinking Indicator -->
      <div
        v-if="sending"
        class="message message--assistant message--thinking"
      >
        <div class="message__text italic">
          {{ runState === 'paused' ? t('biscuit.pausedNote') : t('biscuit.thinking') }}
        </div>
      </div>
    </section>

    <footer class="prompt-footer">
      <GlobalAgentReview />
      <div class="prompt-input-outer">
        <div class="prompt-input-wrapper">
          <textarea
            v-model="userInput"
            rows="4"
            aria-label="Chat input"
            :placeholder="t('biscuit.placeholder')"
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.shift.tab.exact.prevent="cycleMode"
          />
        </div>
        <!-- Autonomy mode line (Claude-CLI style): shift+tab cycles -->
        <div class="mode-line-row">
          <div
            class="mode-line"
            :class="`mode-line--${mode}`"
            :title="currentModeInfo.hint()"
            @click="cycleMode"
          >
            <span class="mode-symbol">{{ currentModeInfo.symbol }}</span>
            <span class="mode-name">{{ currentModeInfo.label() }}</span>
            <span class="mode-cycle-hint">{{ t('biscuit.modeCycleHint') }}</span>
          </div>

          <!-- Session token counter -->
          <div
            v-if="tokenUsage"
            class="token-counter"
            :title="tokenTip"
          >
            ▼{{ fmtTokens(tokenUsage.session.inputTokens) }} ▲{{ fmtTokens(tokenUsage.session.outputTokens) }}
          </div>

          <!-- Context ring (GH-Copilot style): fills as the conversation
               approaches the point where Biscuit condenses old turns. -->
          <div
            v-if="contextUsage"
            class="context-ring"
            :class="{ compacting: contextUsage.compacting || manualCompacting, clickable: !sending }"
            :title="contextRingTip"
            @click="condenseNow"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
            >
              <circle
                class="ring-track"
                cx="8"
                cy="8"
                r="6.5"
              />
              <circle
                class="ring-fill"
                :class="contextRingLevel"
                cx="8"
                cy="8"
                r="6.5"
                :stroke-dasharray="`${ringDash} ${ringCircumference}`"
              />
            </svg>
          </div>
        </div>
        <div class="prompt-input-actions">
          <el-button
            :type="aiIsConnected ? 'success' : 'info'"
            size="small"
            plain
            class="connection-status-btn"
            :title="t('biscuit.configureTip')"
            @click="openAiSettings"
          >
            <span
              class="status-indicator"
              :class="{ 'connected': aiIsConnected }"
            />
            {{ currentModelName }}
          </el-button>

          <el-button
            v-if="runState !== 'paused'"
            size="small"
            :disabled="runState !== 'running'"
            @click="pauseRun"
          >
            ⏸ {{ t('biscuit.pause') }}
          </el-button>
          <el-button
            v-else
            size="small"
            type="warning"
            @click="resumeRun"
          >
            ▶ {{ t('biscuit.resume') }}
          </el-button>
          <el-button
            type="danger"
            size="small"
            :disabled="!sending"
            @click="stopGeneration"
          >
            {{ t('biscuit.stop') }}
          </el-button>
          <el-button
            type="primary"
            size="small"
            :disabled="!aiIsConnected || !userInput.trim()"
            @click="sendMessage"
          >
            {{ sending ? t('biscuit.steer') : t('biscuit.send') }}
          </el-button>
        </div>
      </div>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { ref, nextTick, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '../../store/preferences'
import { useLayoutStore } from '../../store/layout'
import { useProjectStore } from '../../store/project'
import { langGraphService } from '../../services/langgraph'
import bus from '../../bus'
import { t } from '../../i18n'
import { renderChatMarkdown } from '../../util/chatMarkdown'
import { estimateCostUsd, formatCostUsd } from '../../util/modelPricing'
import { DArrowRight, Plus, ChatLineSquare, Delete } from '@element-plus/icons-vue'
import GlobalAgentReview from '../agent/GlobalAgentReview.vue'
import AgentPanel from './AgentPanel.vue'
import PlanCard from './PlanCard.vue'
import ErrorCard from './ErrorCard.vue'
import type {
  ILangGraphMessage,
  IAgentActivityEvent,
  IAgentApprovalRequest,
  IContextUsage,
  IPlanProposal,
  ITokenUsageUpdate,
  IAgentStatus,
  AgentPermissionMode
} from '@shared/types/langgraph'

// Store
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const { aiProvider, aiConfigs, aiIsConnected } = storeToRefs(preferencesStore)

const currentModelName = computed(() => {
  if (!aiIsConnected.value) return t('biscuit.disconnected')
  const config = aiConfigs.value[aiProvider.value]
  const name = config?.model || t('biscuit.connected')
  return name.length > 15 ? name.substring(0, 12) + '...' : name
})

// Resize logic
const DEFAULT_WIDTH = 340
const MIN_WIDTH = 250
const MAX_WIDTH = 600
const panelWidth = ref(Number(localStorage.getItem('right-prompt-width')) || DEFAULT_WIDTH)
const isResizing = ref(false)

const rightPromptStyle = computed(() => ({
  width: `${panelWidth.value}px`,
  flex: `0 0 ${panelWidth.value}px`
}))

const startResizing = (event: MouseEvent) => {
  isResizing.value = true
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', stopResizing)
  document.body.style.cursor = 'col-resize'
}

const handleMouseMove = (event: MouseEvent) => {
  if (!isResizing.value) return

  // Calculate width from the right side
  const newWidth = window.innerWidth - event.clientX

  if (newWidth < 150) {
    // If pushed too far right, hide it
    layoutStore.SET_LAYOUT({ showRightPrompt: false })
    stopResizing()
    return
  }

  panelWidth.value = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH))
}

const stopResizing = () => {
  isResizing.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', stopResizing)
  document.body.style.cursor = ''
  localStorage.setItem('right-prompt-width', String(panelWidth.value))
}

const togglePanel = () => {
  layoutStore.SET_LAYOUT({ showRightPrompt: false })
}

onBeforeUnmount(() => {
  stopResizing()
  unsubActivity?.()
  unsubApproval?.()
  unsubUsage?.()
  unsubPlan?.()
  unsubTokens?.()
  unsubAgents?.()
  unsubRunState?.()
  bus.off('biscuit-ask', handleBiscuitAsk)
})

// Chat entries: plain conversation messages, plus structured info for
// error cards (friendly title/explanation wrapped around the raw detail).
interface ErrorInfo {
  title: string
  explanation: string
  showSettings?: boolean
}
interface ChatEntry extends ILangGraphMessage {
  errorInfo?: ErrorInfo
}

// Reactive state
const promptBody = ref<HTMLElement | null>(null)
const userInput = ref('')
const sending = ref(false)
const aiMessages = ref<ChatEntry[]>([])

/** Map a raw failure onto a human explanation for the error card. */
const classifyError = (raw: string): ErrorInfo => {
  if (/\b401\b|\b403\b|rejected|User not found|MODEL_AUTHENTICATION|api[_ ]?key/i.test(raw)) {
    return {
      title: t('biscuit.errorTitleAuth'),
      explanation: t('biscuit.errorExplainAuth'),
      showSettings: true
    }
  }
  if (/\b429\b|rate.?limit|quota|overloaded|insufficient/i.test(raw)) {
    return {
      title: t('biscuit.errorTitleRate'),
      explanation: t('biscuit.errorExplainRate')
    }
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Could not reach|fetch failed|network|timeout/i.test(raw)) {
    return {
      title: t('biscuit.errorTitleNetwork'),
      explanation: t('biscuit.errorExplainNetwork'),
      showSettings: true
    }
  }
  return {
    title: t('biscuit.errorTitleGeneric'),
    explanation: t('biscuit.errorExplainGeneric')
  }
}

// ---- Autonomy mode (Claude-CLI style: line under the prompt, shift+tab cycles) ----
// Labels/hints are functions so they re-resolve when the app language changes.
const MODES: Array<{
  id: AgentPermissionMode
  label: () => string
  symbol: string
  hint: () => string
}> = [
  { id: 'plan', label: () => t('biscuit.modePlan'), symbol: '⏸', hint: () => t('biscuit.modePlanHint') },
  { id: 'ask', label: () => t('biscuit.modeAsk'), symbol: '⇥', hint: () => t('biscuit.modeAskHint') },
  { id: 'auto', label: () => t('biscuit.modeAuto'), symbol: '⏵', hint: () => t('biscuit.modeAutoHint') },
  { id: 'full-auto', label: () => t('biscuit.modeMax'), symbol: '⏵⏵', hint: () => t('biscuit.modeMaxHint') }
]
const mode = ref<AgentPermissionMode>(
  (localStorage.getItem('biscuit-mode') as AgentPermissionMode) || 'ask'
)

const currentModeInfo = computed(
  () => MODES.find((m) => m.id === mode.value) ?? MODES[1]
)

const setMode = async (m: AgentPermissionMode): Promise<void> => {
  mode.value = m
  localStorage.setItem('biscuit-mode', m)
  try {
    await window.electron.ai.setMode(m)
  } catch {
    // Not connected yet — pushed again after connect.
  }
}

const cycleMode = (): void => {
  const index = MODES.findIndex((m) => m.id === mode.value)
  const next = MODES[(index + 1) % MODES.length]
  setMode(next.id)
}

// Push the persisted mode down to main once connected.
watch(aiIsConnected, (connected) => {
  if (connected) setMode(mode.value)
})

// ---- Context ring (fills as the conversation nears compaction) ----
const contextUsage = ref<IContextUsage | null>(null)

const ringCircumference = 2 * Math.PI * 6.5

const ringDash = computed(() =>
  contextUsage.value ? Math.max(0.5, contextUsage.value.ratio * ringCircumference) : 0
)

// Green-ish → amber → red as the budget fills; compaction fires at ~80%.
const contextRingLevel = computed(() => {
  const ratio = contextUsage.value?.ratio ?? 0
  if (ratio >= 0.75) return 'level-high'
  if (ratio >= 0.5) return 'level-mid'
  return 'level-low'
})

const contextRingTip = computed(() => {
  if (!contextUsage.value) return ''
  if (contextUsage.value.compacting || manualCompacting.value) return t('biscuit.compacting')
  return t('biscuit.contextTip', {
    percent: Math.round(contextUsage.value.ratio * 100)
  }) + (sending.value ? '' : ` ${t('biscuit.condenseHint')}`)
})

// ---- Plan approval (Claude-Code-style: plan file → card → mode switch) ----
const pendingPlan = ref<IPlanProposal | null>(null)

const approvePlan = async (targetMode: 'ask' | 'auto'): Promise<void> => {
  const plan = pendingPlan.value
  if (!plan) return
  pendingPlan.value = null
  await setMode(targetMode)
  const message =
    `The plan "${plan.title}" is APPROVED — I switched to ${targetMode} mode. ` +
    `Execute it now, step by step. The full plan is saved at ${plan.path} ` +
    '(read it with read_project_file if you need to re-check a step).'
  userInput.value = message
  if (aiIsConnected.value && !sending.value) {
    sendMessage()
  }
}

const dismissPlan = (): void => {
  // The plan file stays on disk; only the card is dismissed.
  pendingPlan.value = null
}

// ---- Run state (idle / running / paused) ----
const runState = ref<'idle' | 'running' | 'paused'>('idle')

const pauseRun = async (): Promise<void> => {
  await window.electron.ai.pause()
}

const resumeRun = async (): Promise<void> => {
  await window.electron.ai.resume()
}

// ---- Manual compaction (click the ring while idle) ----
const manualCompacting = ref(false)

const condenseNow = async (): Promise<void> => {
  if (sending.value || manualCompacting.value) return
  manualCompacting.value = true
  try {
    const result = await window.electron.ai.compactNow()
    if (result.busy) return
    ElMessage.success(
      result.compacted ? t('biscuit.condensed') : t('biscuit.nothingToCondense')
    )
  } catch {
    // Not connected — nothing to condense.
  } finally {
    manualCompacting.value = false
  }
}

// ---- Retry a failed/cancelled agent ----
const retryAgent = (task: string): void => {
  const message = t('biscuit.retryMessage', { task })
  if (sending.value) {
    steerWith(message)
  } else {
    userInput.value = message
    sendMessage()
  }
}

// ---- Transcript export ----
const exportTranscript = async (): Promise<void> => {
  historyVisible.value = false
  const lines: string[] = [`# Biscuit — ${new Date().toISOString().slice(0, 10)}`, '']
  for (const message of aiMessages.value) {
    const who = message.role === 'user' ? 'Writer' : message.role === 'error' ? 'Error' : 'Biscuit'
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

// ---- Token usage counter ----
const tokenUsage = ref<ITokenUsageUpdate | null>(null)

const fmtTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

const tokenTip = computed(() => {
  if (!tokenUsage.value) return ''
  const { turn, session } = tokenUsage.value
  const roles = Object.entries(session.byRole)
    .map(([role, u]) => `${role}: ▼${fmtTokens(u.inputTokens)} ▲${fmtTokens(u.outputTokens)} (${u.calls})`)
    .join('\n')
  let base = t('biscuit.usageTip', {
    tin: fmtTokens(turn.inputTokens),
    tout: fmtTokens(turn.outputTokens),
    sin: fmtTokens(session.inputTokens),
    sout: fmtTokens(session.outputTokens),
    calls: session.calls
  })
  // Best-effort cost estimate — cloud models with known prices only.
  const provider = aiProvider.value
  if (provider !== 'ollama' && provider !== 'ollama_bundled') {
    const model = aiConfigs.value[provider]?.model
    const cost = estimateCostUsd(model, session.inputTokens, session.outputTokens)
    if (cost !== null) {
      base += ` · ${t('biscuit.usageCost', { cost: formatCostUsd(cost) })}`
    }
  }
  return base + (roles ? `\n${roles}` : '')
})

// ---- Live agents (panel with per-agent cancel) ----
const agentMap = ref(new Map<string, IAgentStatus>())
const agentList = computed(() => Array.from(agentMap.value.values()))

const cancelAgent = async (agentId: string): Promise<void> => {
  await window.electron.ai.cancelAgent(agentId)
}

// ---- Activity feed + approvals ----
const activity = ref<IAgentActivityEvent[]>([])
const pendingApproval = ref<IAgentApprovalRequest | null>(null)

let unsubActivity: (() => void) | null = null
let unsubApproval: (() => void) | null = null
let unsubUsage: (() => void) | null = null
let unsubPlan: (() => void) | null = null
let unsubTokens: (() => void) | null = null
let unsubAgents: (() => void) | null = null
let unsubRunState: (() => void) | null = null

onMounted(() => {
  if (aiIsConnected.value) setMode(mode.value)
  // Restore the last open conversation so a renderer reload doesn't lose it.
  loadHistory()
  const current = conversations.value.find((c) => c.id === currentId.value)
  if (current) aiMessages.value = JSON.parse(JSON.stringify(current.messages))
  unsubActivity = window.electron.ai.onActivity(async (event) => {
    activity.value.push(event)
    if (activity.value.length > 200) activity.value.splice(0, 100)
    await nextTick()
    if (promptBody.value) promptBody.value.scrollTop = promptBody.value.scrollHeight
  })
  unsubApproval = window.electron.ai.onApprovalRequest((request) => {
    pendingApproval.value = request
  })
  unsubUsage = window.electron.ai.onContextUsage((usage) => {
    contextUsage.value = usage
  })
  unsubPlan = window.electron.ai.onPlanProposal((plan) => {
    pendingPlan.value = plan
  })
  unsubTokens = window.electron.ai.onTokenUsage((usage) => {
    tokenUsage.value = usage
  })
  unsubAgents = window.electron.ai.onAgentStatus((status) => {
    const next = new Map(agentMap.value)
    next.set(status.agentId, status)
    agentMap.value = next
  })
  unsubRunState = window.electron.ai.onRunState(({ state }) => {
    runState.value = state
  })
  // Selection actions in the editor route through the normal chat pipeline.
  bus.on('biscuit-ask', handleBiscuitAsk)
})

const respondApproval = async (approved: boolean): Promise<void> => {
  const request = pendingApproval.value
  pendingApproval.value = null
  if (request) {
    await window.electron.ai.approve(request.id, approved)
  }
}

// ---- Conversation history (renderer-local, persisted in localStorage) ----
interface StoredConversation {
  id: string
  title: string
  messages: ChatEntry[]
  updatedAt: number
}

const HISTORY_KEY = 'biscuit-conversations'
const CURRENT_KEY = 'biscuit-current-conversation'

const conversations = ref<StoredConversation[]>([])
const currentId = ref<string>('')
const historyVisible = ref(false)

const sortedConversations = computed(() =>
  [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt)
)

const loadHistory = (): void => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    conversations.value = raw ? (JSON.parse(raw) as StoredConversation[]) : []
  } catch {
    conversations.value = []
  }
  currentId.value = localStorage.getItem(CURRENT_KEY) || ''
}

const persistHistory = (): void => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations.value))
  localStorage.setItem(CURRENT_KEY, currentId.value)
}

const deriveTitle = (messages: ChatEntry[]): string => {
  const firstUser = messages.find((m) => m.role === 'user')
  const text = firstUser?.content?.trim() || 'New conversation'
  return text.length > 40 ? text.slice(0, 40) + '…' : text
}

// Save the live transcript into the current conversation entry (creating one
// on the first message). Called whenever aiMessages changes.
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

const writeTranscript = async (snapshot: ChatEntry[]): Promise<void> => {
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

const newConversation = async (): Promise<void> => {
  saveCurrent()
  try {
    await window.electron.ai.resetThread()
  } catch {
    // Not connected — clear the local transcript anyway.
  }
  aiMessages.value = []
  activity.value = []
  agentMap.value = new Map()
  pendingApproval.value = null
  contextUsage.value = null
  tokenUsage.value = null
  currentId.value = ''
  persistHistory()
}

const loadConversation = async (id: string): Promise<void> => {
  historyVisible.value = false
  if (id === currentId.value) return
  saveCurrent()
  const conv = conversations.value.find((c) => c.id === id)
  if (!conv) return
  // Start a fresh main-process thread; the transcript is replayed as context
  // on the next send.
  try {
    await window.electron.ai.resetThread()
  } catch {
    // ignore — not connected
  }
  aiMessages.value = JSON.parse(JSON.stringify(conv.messages)) as ChatEntry[]
  activity.value = []
  pendingApproval.value = null
  currentId.value = id
  persistHistory()
  await nextTick()
  if (promptBody.value) promptBody.value.scrollTop = promptBody.value.scrollHeight
}

const deleteConversation = (id: string): void => {
  conversations.value = conversations.value.filter((c) => c.id !== id)
  if (id === currentId.value) {
    aiMessages.value = []
    currentId.value = ''
  }
  persistHistory()
}

// A selection action from the editor: put the request in the input and
// send immediately when connected (otherwise leave it for the writer).
function handleBiscuitAsk (payload: unknown): void {
  const text = typeof payload === 'string' ? payload : ''
  if (!text) return
  userInput.value = text
  if (aiIsConnected.value && !sending.value) {
    sendMessage()
  }
}

// Window-open is denied app-wide; route chat links to the system browser.
function handleMarkdownClick (event: MouseEvent): void {
  const anchor = (event.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href')
  if (href && /^https?:\/\//i.test(href)) {
    event.preventDefault()
    window.electron.shell.openExternal(href)
  }
}

// Open settings window to AI page
function openAiSettings (): void {
  window.electron.ipcRenderer.send('mt::open-setting-window', 'ai')
}

// Stop generation
async function stopGeneration (): Promise<void> {
  try {
    await langGraphService.abort()
  } catch {
    // ignore abort errors
  }
}

const steerWith = async (text: string): Promise<void> => {
  const queued = await window.electron.ai.steer(text)
  if (queued.queued) {
    aiMessages.value.push({ role: 'user', content: `⤷ ${text}` })
    await nextTick()
    if (promptBody.value) promptBody.value.scrollTop = promptBody.value.scrollHeight
  }
}

// Send message to AI
async function sendMessage (): Promise<void> {
  if (!userInput.value.trim() || !aiIsConnected.value) return
  // Mid-run: the same button steers — the note reaches the supervisor at
  // its next step boundary instead of waiting for the turn to finish.
  if (sending.value) {
    const text = userInput.value.trim()
    userInput.value = ''
    await steerWith(text)
    return
  }

  const userMessage: ILangGraphMessage = {
    role: 'user',
    content: userInput.value.trim()
  }

  aiMessages.value.push(userMessage)
  userInput.value = ''
  sending.value = true
  activity.value = []
  agentMap.value = new Map()

  await nextTick()
  if (promptBody.value) {
    promptBody.value.scrollTop = promptBody.value.scrollHeight
  }

  try {
    // Error/stopped cards are UI furniture — never send them to the model.
    const conversation = aiMessages.value
      .filter((m) => m.role !== 'error' && m.role !== 'stopped')
      .map(({ role, content }) => ({ role, content }))
    const response = await langGraphService.sendMessage(conversation)

    if (response && response.content) {
      aiMessages.value.push({
        role: 'assistant',
        content: response.content
      })
    } else {
      throw new Error('AI returned an empty response')
    }
    // Auto-scroll to bottom after response
    await nextTick()
    if (promptBody.value) {
      promptBody.value.scrollTop = promptBody.value.scrollHeight
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('aborted') || errorMessage.includes('canceled') || errorMessage.includes('stopped')) {
      aiMessages.value.push({
        role: 'stopped',
        content: t('biscuit.stopped')
      })
    } else {
      // Structured error card in the transcript — no toast splash.
      aiMessages.value.push({
        role: 'error',
        content: errorMessage,
        errorInfo: classifyError(errorMessage)
      })
    }

    await nextTick()
    if (promptBody.value) {
      promptBody.value.scrollTop = promptBody.value.scrollHeight
    }
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.right-prompt {
  display: flex;
  flex-direction: column;
  background: var(--editorBgColor);
  overflow: visible;
  box-sizing: border-box;
  position: relative;
}

.resizer {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
  transition: background 0.2s;
}

.resizer:hover, .resizer:active {
  background: var(--color-primary, #409eff);
}

.prompt-header {
  height: 40px;
  padding: 0 var(--spacing-3, 8px);
  background: var(--editorBgColor);
  /* Three-column grid: the title stays centered, actions pin right, and
     neither can ever overlap — when space runs out the right column keeps
     its content (max-content floor) and the title shifts left instead. */
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(max-content, 1fr);
  column-gap: 6px;
  align-items: center;
  box-sizing: border-box;
  position: relative;
  border-bottom: 1px solid var(--itemBgColor);
}

/* Base style for toggle buttons in both SideBar (Expand) and RightPrompt (Collapse) */
:global(.toggle-biscuit-btn) {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 60px;
  background: var(--editorBgColor);
  border: 1px solid var(--color-border, rgba(128, 128, 128, 0.2));
  border-right: none;
  border-radius: 8px 0 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000;
  color: var(--color-secondary, #909399);
  transition: all 0.2s;
}

:global(.toggle-biscuit-btn:hover) {
  width: 20px;
  color: var(--color-primary, #409eff);
  background: var(--dialogBgColor, var(--editorBgColor));
}

/* Specific positioning for the collapse button inside the panel */
.toggle-biscuit-btn.collapse {
  position: absolute; /* Relative to .right-prompt */
  top: 50%;
  left: -16px; /* Stick out to the left into the editor area */
  border-radius: 8px 0 0 8px;
  border-right: none;
}

.toggle-biscuit-btn.collapse:hover {
  left: -20px;
  width: 20px;
}

.prompt-title {
  grid-column: 2;
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--themeColor, #409eff);
  letter-spacing: 0.05em;
  border: 1px solid var(--themeColor, #409eff);
  padding: 1px 10px;
  border-radius: 12px;
  background: var(--itemBgColor);
  line-height: normal;
  white-space: nowrap;
}

.header-actions {
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.header-action {
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  font: inherit;
  color: var(--iconColor, #909399);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 3px 6px;
  &:hover {
    color: var(--themeColor, #409eff);
    border-color: var(--itemBgColor);
  }
}

.new-chat-btn {
  font-size: 0.7rem;
  padding: 3px 9px;
  border-color: var(--itemBgColor);
  color: var(--editorColor);
  &:hover {
    border-color: var(--themeColor, #409eff);
  }
}

/* History popover contents */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  overflow-y: auto;
}

.history-export {
  font: inherit;
  font-size: 0.72rem;
  text-align: left;
  padding: 4px 8px;
  margin-bottom: 4px;
  border: 1px dashed var(--floatBorderColor, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: transparent;
  color: var(--floatFontColor, #303133);
  cursor: pointer;
  &:hover:not(:disabled) {
    border-color: var(--themeColor, #409eff);
    color: var(--themeColor, #409eff);
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.history-list__title {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--iconColor, #909399);
  padding: 2px 6px 6px;
}

.history-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  &:hover {
    background: var(--floatHoverColor, var(--itemBgColor));
    & .history-row__delete {
      opacity: 1;
    }
  }
  &.current {
    background: var(--itemBgColor);
  }
}

.history-row__label {
  flex: 1;
  font-size: 0.78rem;
  color: var(--floatFontColor, var(--editorColor));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-row__delete {
  opacity: 0;
  color: var(--iconColor, #909399);
  flex-shrink: 0;
  &:hover {
    color: var(--deleteColor, #f56c6c);
  }
}

.history-empty {
  padding: 12px 6px;
  font-size: 0.75rem;
  color: var(--iconColor, #909399);
  text-align: center;
}

/* Claude-CLI-style mode line under the prompt, ring on the right. */
.mode-line-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mode-line {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 4px;
  font-size: 0.72rem;
  cursor: pointer;
  user-select: none;
  color: var(--color-secondary, #909399);
  min-width: 0;
  &:hover .mode-cycle-hint {
    opacity: 1;
  }
}

.token-counter {
  font-size: 0.66rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--iconColor, #909399);
  white-space: nowrap;
  cursor: help;
  flex-shrink: 0;
}

/* Context ring: quiet at rest, amber past half, red near compaction,
   pulsing while old turns are being condensed. */
.context-ring {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 4px;
  cursor: help;
}

.context-ring.clickable {
  cursor: pointer;
}

.context-ring svg {
  transform: rotate(-90deg);
}

.ring-track {
  fill: none;
  stroke: var(--itemBgColor, rgba(128, 128, 128, 0.2));
  stroke-width: 2.5;
}

.ring-fill {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dasharray 0.4s ease, stroke 0.4s ease;
  &.level-low {
    stroke: var(--iconColor, #909399);
  }
  &.level-mid {
    stroke: #e6a23c;
  }
  &.level-high {
    stroke: #f56c6c;
  }
}

.context-ring.compacting svg {
  animation: ring-pulse 1.2s infinite ease-in-out;
}

@keyframes ring-pulse {
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
}

.mode-symbol {
  font-size: 0.7rem;
}

.mode-name {
  font-weight: 600;
}

.mode-line--plan .mode-symbol,
.mode-line--plan .mode-name {
  color: #e6a23c;
}

.mode-line--ask .mode-symbol,
.mode-line--ask .mode-name {
  color: var(--color-secondary, #909399);
}

.mode-line--auto .mode-symbol,
.mode-line--auto .mode-name {
  color: var(--color-primary, #409eff);
}

.mode-line--full-auto .mode-symbol,
.mode-line--full-auto .mode-name {
  color: #f56c6c;
}

.mode-cycle-hint {
  opacity: 0.55;
  transition: opacity 0.15s;
}

.approval-card {
  border: 1px solid var(--color-primary, #409eff);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(64, 158, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.approval-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-primary, #409eff);
}

.approval-summary {
  font-size: 0.78rem;
  color: var(--color-text, #303133);
  white-space: pre-wrap;
  max-height: 140px;
  overflow-y: auto;
}

.approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.prompt-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  background: var(--editorBgColor);
}

.message {
  display: flex;
  flex-direction: column;
  margin: 0 4px;
}

.message--user {
  align-items: flex-end;
}

.message--assistant, .message--error {
  align-items: flex-start;
}

.message--stopped {
  align-items: flex-start;
}

.message__text {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text, #303133);
  max-width: 90%;
}

.message--user .message__text {
  text-align: right;
  color: var(--color-secondary, #909399);
}

.message--assistant .message__text {
  text-align: left;
  color: var(--color-primary, #409eff);
}

/* Rendered-markdown subset for assistant replies. Uses :deep() because
   the HTML comes from v-html and misses the scoped attribute. */
.message__text--md {
  color: var(--editorColor, #303133);
  & :deep(p) {
    margin: 0 0 0.5em;
  }
  & :deep(p:last-child) {
    margin-bottom: 0;
  }
  & :deep(strong) {
    font-weight: 700;
    color: var(--editorColor, #303133);
  }
  & :deep(em) {
    font-style: italic;
  }
  & :deep(ul),
  & :deep(ol) {
    margin: 0.3em 0 0.6em;
    padding-left: 1.4em;
  }
  & :deep(li) {
    margin: 0.15em 0;
  }
  & :deep(h1),
  & :deep(h2),
  & :deep(h3),
  & :deep(h4),
  & :deep(h5),
  & :deep(h6) {
    font-size: 0.9rem;
    font-weight: 700;
    margin: 0.7em 0 0.35em;
    color: var(--editorColor, #303133);
  }
  & :deep(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.78rem;
    background: var(--itemBgColor, rgba(128, 128, 128, 0.12));
    padding: 1px 5px;
    border-radius: 4px;
  }
  & :deep(pre) {
    background: var(--itemBgColor, rgba(128, 128, 128, 0.12));
    padding: 8px 10px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.4em 0 0.6em;
    & code {
      background: transparent;
      padding: 0;
    }
  }
  & :deep(blockquote) {
    margin: 0.4em 0;
    padding: 2px 10px;
    border-left: 3px solid var(--themeColor, #409eff);
    color: var(--iconColor, #909399);
  }
  & :deep(hr) {
    border: none;
    border-top: 1px solid var(--itemBgColor, rgba(128, 128, 128, 0.2));
    margin: 0.7em 0;
  }
  & :deep(a) {
    color: var(--themeColor, #409eff);
    text-decoration: underline;
  }
  & :deep(table) {
    border-collapse: collapse;
    margin: 0.4em 0;
    font-size: 0.78rem;
  }
  & :deep(th),
  & :deep(td) {
    border: 1px solid var(--itemBgColor, rgba(128, 128, 128, 0.25));
    padding: 3px 8px;
  }
}

.message--stopped .message__text {
  text-align: left;
  color: var(--color-primary, #409eff);
  font-style: italic;
}

/* Structured error card: friendly headline + explanation, technical
   detail folded away, optional action button. */

.message--thinking .message__text {
  color: var(--color-secondary, #909399);
  font-style: italic;
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

.prompt-footer {
  padding: var(--spacing-3) var(--spacing-4) var(--spacing-4);
  border-top: 1px solid var(--color-border, rgba(128, 128, 128, 0.15));
  background: var(--dialogBgColor, var(--editorBgColor));
}

.prompt-config-drawer {
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.3s ease-out;
  background: var(--dialogBgColor, var(--editorBgColor));
}

.prompt-config-drawer--open {
  max-height: 400px;
  padding-bottom: var(--spacing-3);
}

.prompt-config-drawer__content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: var(--spacing-3);
}

.prompt-config-drawer__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prompt-config-drawer__label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text, #303133);
}

.prompt-config-drawer__select,
.prompt-config-drawer__input {
  width: 100%;
}

.prompt-config-drawer__actions {
  display: flex;
  gap: var(--spacing-2);
  justify-content: flex-end;
  margin-top: var(--spacing-2);
}

.prompt-input-outer {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.prompt-input-wrapper {
  display: flex;
  background: var(--inputBgColor, rgba(128, 128, 128, 0.05));
  border: 1px solid var(--color-border, rgba(128, 128, 128, 0.25));
  border-radius: 8px;
  padding: 8px var(--spacing-3);
  box-sizing: border-box;
}

.prompt-input-wrapper textarea {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text, #303133);
  resize: vertical;
  min-height: 60px;
  outline: none;
  font-family: inherit;
  font-size: 0.85rem;
  line-height: 1.4;
}

.prompt-input-wrapper textarea::placeholder {
  color: var(--color-secondary, #c0c4cc);
}

.prompt-input-actions {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--spacing-2);
}

.connection-status-btn {
  margin-right: auto;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  transition: all 0.2s ease;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #909399; /* el-color-info fallback */
  display: inline-block;
}

.status-indicator.connected {
  background-color: #67c23a; /* el-color-success fallback */
  box-shadow: 0 0 5px rgba(103, 194, 58, 0.5);
}
</style>

<style>
/* The history popover teleports to <body>, outside this component's DOM —
   theme its shell explicitly with the app's float variables so it follows
   every WordBird theme (Element Plus would otherwise render it white). */
.el-popover.biscuit-history-popover {
  background: var(--floatBgColor, #ffffff);
  border: 1px solid var(--floatBorderColor, rgba(128, 128, 128, 0.25));
  box-shadow: var(--floatShadow, 0 4px 12px rgba(0, 0, 0, 0.15));
  color: var(--floatFontColor, #303133);
}

.el-popover.biscuit-history-popover .el-popper__arrow::before {
  background: var(--floatBgColor, #ffffff);
  border-color: var(--floatBorderColor, rgba(128, 128, 128, 0.25));
}
</style>
