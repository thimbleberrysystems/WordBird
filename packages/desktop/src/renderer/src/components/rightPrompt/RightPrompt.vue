<template>
  <aside
    class="right-prompt"
    :class="{ 'right-prompt--detached': detached }"
    role="complementary"
    aria-label="Biscuit panel"
    :style="detached ? undefined : rightPromptStyle"
  >
    <div
      v-if="!detached"
      class="resizer"
      @mousedown="startResizing"
    />

    <!-- Unified Toggle Button (Collapse) -->
    <div
      v-if="!detached"
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
        <!-- Detach to a resizable window / bring back into the editor. -->
        <button
          class="header-action"
          :title="detached ? t('biscuit.reattachTip') : t('biscuit.detachTip')"
          @click="detached ? reattachBiscuit() : detachBiscuit()"
        >
          <el-icon>
            <CopyDocument v-if="!detached" />
            <Back v-else />
          </el-icon>
        </button>

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
      <!-- First-open onboarding: what Biscuit is, how to start, and — when
           no model is connected — the one action that unblocks everything. -->
      <div
        v-if="aiMessages.length === 0 && !sending"
        class="biscuit-welcome"
      >
        <div class="welcome-title">
          {{ t('biscuit.welcomeTitle') }}
        </div>
        <p
          v-if="!aiIsConnected"
          class="welcome-sub"
        >
          {{ t('biscuit.welcomeConnect') }}
        </p>
        <el-button
          v-if="!aiIsConnected"
          type="primary"
          size="small"
          @click="openAiSettings"
        >
          {{ t('biscuit.welcomeConfigure') }}
        </el-button>
        <template v-else>
          <button
            v-for="(starter, i) in starterPrompts"
            :key="i"
            class="welcome-suggestion"
            @click="sendStarter(starter())"
          >
            {{ starter() }}
          </button>
        </template>
        <p class="welcome-hint">
          {{ t('biscuit.welcomeModeHint') }}
        </p>
      </div>

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
          <!-- eslint-disable vue/no-v-html -- sanitized by DOMPurify in renderChatMarkdown -->
          <div
            class="message__text message__text--md"
            @click="handleMarkdownClick"
            v-html="renderChatMarkdown(message.content)"
          />
          <!-- eslint-enable vue/no-v-html -->
        </div>

        <!-- Informational notice (e.g. a quiet-but-alive run) — calm, not
             alarming, distinct from the red error card. -->
        <div
          v-else-if="message.role === 'notice'"
          class="message message--notice"
        >
          <el-icon class="message--notice__icon">
            <InfoFilled />
          </el-icon>
          <div class="message__text">
            {{ message.content }}
          </div>
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
      <!-- Decision dock: pending plan/question/approval cards live HERE,
           outside the scrolling transcript, so streaming activity can
           never push a waiting decision out of view. -->
      <div
        v-if="pendingPlan || pendingQuestion || pendingApproval"
        class="decision-dock"
      >
        <!-- Plan approval card (Claude-Code-style plan mode) -->
        <plan-card
          v-if="pendingPlan"
          :plan="pendingPlan"
          @approve="approvePlan"
          @dismiss="dismissPlan"
        />

        <!-- Writer question card: selectable options + free-form answer -->
        <div
          v-if="pendingQuestion"
          class="question-card"
        >
          <div class="question-card__text">
            {{ pendingQuestion.question }}
          </div>
          <button
            v-for="(option, i) in pendingQuestion.options"
            :key="i"
            class="question-option"
            :title="option.description"
            @click="answerQuestion(option.label)"
          >
            <span class="question-option__label">{{ option.label }}</span>
            <span
              v-if="option.description"
              class="question-option__desc"
            >{{ option.description }}</span>
          </button>
          <div class="question-freeform">
            <input
              v-model="questionFreeform"
              :placeholder="t('biscuit.questionFreeform')"
              @keydown.enter.prevent="answerQuestion(questionFreeform)"
            >
            <el-button
              size="small"
              type="primary"
              :disabled="!questionFreeform.trim()"
              @click="answerQuestion(questionFreeform)"
            >
              {{ t('biscuit.send') }}
            </el-button>
          </div>
        </div>

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
          <div
            v-if="approvalTimeLeft"
            class="approval-countdown"
          >
            {{ t('biscuit.approvalCountdown', { time: approvalTimeLeft }) }}
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
      </div>
      <GlobalAgentReview />
      <div class="prompt-input-outer">
        <div class="prompt-input-wrapper">
          <!-- @-mention picker (Cline-style): scenes + bible pages. -->
          <div
            v-if="mentionOpen && mentionCandidates.length > 0"
            class="mention-popover"
          >
            <div class="mention-hint">
              {{ t('biscuit.mentionHint') }}
            </div>
            <div
              v-for="(candidate, i) in mentionCandidates"
              :key="candidate.path"
              class="mention-item"
              :class="{ active: i === mentionIndex }"
              @mousedown.prevent="insertMention(candidate)"
            >
              <span class="mention-title">{{ candidate.title }}</span>
              <span class="mention-path">{{ candidate.path }}</span>
            </div>
          </div>
          <!-- Starter prompts, reachable any time via the / button. -->
          <div
            v-if="startersOpen"
            class="mention-popover starters-popover"
          >
            <div class="mention-hint">
              {{ t('biscuit.startersHint') }}
            </div>
            <div
              v-for="(starter, i) in starterPrompts"
              :key="i"
              class="mention-item"
              @mousedown.prevent="pickStarter(starter())"
            >
              <span class="mention-title">{{ starter() }}</span>
            </div>
          </div>
          <textarea
            ref="promptInput"
            v-model="userInput"
            rows="4"
            aria-label="Message Biscuit"
            :placeholder="t('biscuit.placeholder')"
            @keydown="handleInputKeydown"
            @input="updateMentionState"
            @click="updateMentionState"
            @blur="closeMention"
          />
        </div>
        <!-- Command row: every hidden power feature, one glance.
             Mode chip (click = compare all three) · @ scenes · / starters. -->
        <div class="mode-line-row">
          <div class="mode-chip-wrap">
            <div
              class="mode-line"
              :class="`mode-line--${mode}`"
              :title="currentModeInfo.hint()"
              @click.stop="modePopoverOpen = !modePopoverOpen"
            >
              <span class="mode-symbol">{{ currentModeInfo.symbol }}</span>
              <span class="mode-name">{{ currentModeInfo.label() }}</span>
              <span class="mode-cycle-hint">{{ t('biscuit.modeCycleHint') }}</span>
            </div>
            <!-- All three modes side by side — no more hover-and-cycle
                 archaeology to learn what they do. -->
            <div
              v-if="modePopoverOpen"
              class="mode-popover"
            >
              <button
                v-for="info in MODES"
                :key="info.id"
                class="mode-option"
                :class="{ active: info.id === mode }"
                @click="chooseMode(info.id)"
              >
                <span class="mode-option__head">
                  <span class="mode-symbol">{{ info.symbol }}</span>
                  <span class="mode-option__label">{{ info.label() }}</span>
                </span>
                <span class="mode-option__hint">{{ info.hint() }}</span>
              </button>
            </div>
          </div>
          <button
            class="cmd-btn"
            :title="t('biscuit.mentionButtonTip')"
            @click.stop="openMentionPicker"
          >
            @
          </button>
          <button
            class="cmd-btn"
            :title="t('biscuit.startersButtonTip')"
            @click.stop="startersOpen = !startersOpen"
          >
            /
          </button>
          <span
            class="cmd-hint"
            :title="t('biscuit.historyHintTip')"
          >↑</span>

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

          <!-- While idle: [Send] primary, rightmost. While running the
               roles swap (writer request): Steer becomes the quiet left
               button, STOP takes the prominent rightmost slot — the
               panic button is the one your hand finds first. -->
          <el-button
            v-if="sending"
            size="small"
            plain
            :disabled="!userInput.trim()"
            @click="sendMessage"
          >
            {{ t('biscuit.steer') }}
          </el-button>
          <el-button
            v-if="sending"
            type="danger"
            size="small"
            @click="stopGeneration"
          >
            {{ t('biscuit.stop') }}
          </el-button>
          <el-button
            v-else
            type="primary"
            size="small"
            :disabled="!aiIsConnected || !userInput.trim()"
            @click="sendMessage"
          >
            {{ t('biscuit.send') }}
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
import { modeKey } from '../../util/projectStorageKeys'
import { useNovelStore } from '../../store/novel'
import { useEditorStore } from '../../store/editor'
import { useAgentsStore } from '../../store/agents'
import { langGraphService } from '../../services/langgraph'
import bus from '../../bus'
import { t } from '../../i18n'
import { classifyError } from '../../util/aiErrors'
import { renderChatMarkdown } from '../../util/chatMarkdown'
import { useBiscuitUsage } from '../../composables/useBiscuitUsage'
import {
  useConversationHistory,
  type ChatEntry
} from '../../composables/useConversationHistory'
import { DArrowRight, Plus, ChatLineSquare, Delete, CopyDocument, Back, InfoFilled } from '@element-plus/icons-vue'
import GlobalAgentReview from '../agent/GlobalAgentReview.vue'
import PlanCard from './PlanCard.vue'
import ErrorCard from './ErrorCard.vue'
import type {
  ILangGraphMessage,
  IAgentApprovalRequest,
  IPlanProposal,
  AgentPermissionMode
} from '@shared/types/langgraph'

// Detached mode: this instance fills its own window (pages/biscuit.vue);
// resizing/collapsing don't apply and the detach button becomes reattach.
const props = defineProps<{ detached?: boolean }>()
const detached = computed(() => !!props.detached)

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

  // Clamp instead of hiding: silently vanishing on an over-drag was a trap
  // (the panel "disappeared" with only a subtle expand arrow to recover).
  // Hiding stays an explicit action: the collapse button or View → Toggle
  // AI Panel.
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
  stopStallWatchdog()
  document.removeEventListener('click', closePopovers)
  unsubApproval?.()
  unsubHeartbeat?.()
  unsubApprovalResolved?.()
  unsubUsage?.()
  unsubPlan?.()
  unsubPlanSaved?.()
  unsubQuestion?.()
  unsubTokens?.()
  if (approvalTimer) clearInterval(approvalTimer)
  stopStallWatchdog()
  unsubModeChanged?.()
  bus.off('biscuit-ask', handleBiscuitAsk)
  bus.off('biscuit-retry-task', handleRetryTask)
})

// Reactive state
const promptBody = ref<HTMLElement | null>(null)
const userInput = ref('')
const sending = ref(false)
const aiMessages = ref<ChatEntry[]>([])

// ---- Autonomy mode (Claude-CLI style: line under the prompt, shift+tab cycles) ----
// Labels/hints are functions so they re-resolve when the app language changes.
const MODES: Array<{
  id: AgentPermissionMode
  label: () => string
  symbol: string
  hint: () => string
}> = [
  { id: 'ask', label: () => t('biscuit.modeAsk'), symbol: '🔍', hint: () => t('biscuit.modeAskHint') },
  { id: 'approvals', label: () => t('biscuit.modeApprovals'), symbol: '✓?', hint: () => t('biscuit.modeApprovalsHint') },
  { id: 'auto', label: () => t('biscuit.modeAuto'), symbol: '⏵⏵', hint: () => t('biscuit.modeAutoHint') }
]

// Legacy persisted values from the four-mode era map onto the three modes:
// old 'plan' ≈ read-only ask; old 'ask' (spawn-approval) ≈ approvals;
// 'full-auto' folds into auto.
const normalizeMode = (value: string | null): AgentPermissionMode => {
  if (value === 'auto' || value === 'full-auto') return 'auto'
  if (value === 'plan' || value === 'ask') return value === 'plan' ? 'ask' : 'approvals'
  if (value === 'approvals') return 'approvals'
  return 'approvals'
}
// The permission mode is a PER-PROJECT preference: main persists it in the
// project's .wordbird/agent-state/session.json, so a project reopens in the
// mode the writer last used with it (a brand-new project starts in the safe
// approvals default). The renderer mirrors main's answer; localStorage keeps
// a per-project copy only for the auto-apply checks in editor.vue and
// agentReviewFallback.ts.
//
// The cache is keyed by project because those checks auto-apply edits when
// it reads `auto`: a shared key let the mode of the LAST project stand in
// until main answered, which could auto-apply in a project the writer never
// put in auto mode. An unknown project now normalizes to `approvals`.
const cachedMode = (): string | null =>
  localStorage.getItem(modeKey(useProjectStore().currentProjectPath))
const mode = ref<AgentPermissionMode>(normalizeMode(cachedMode()))

const refreshModeFromMain = async (): Promise<void> => {
  try {
    const { mode: saved } = await window.electron.ai.getMode()
    mode.value = normalizeMode(saved)
    localStorage.setItem(modeKey(useProjectStore().currentProjectPath), mode.value)
  } catch {
    // Main not ready yet — the per-project mirror stands in.
  }
}
// Adopt the saved mode when the active project changes (and at mount below).
// Re-seed from the NEW project's cache first: main's answer is a round trip,
// and until it lands the mode line must never still show the old project's.
watch(() => useProjectStore().currentProjectPath, () => {
  mode.value = normalizeMode(cachedMode())
  refreshModeFromMain().catch(() => {
    // Already swallowed inside; the cache stands in.
  })
})

const currentModeInfo = computed(
  () => MODES.find((m) => m.id === mode.value) ?? MODES[1]
)

const setMode = async (m: AgentPermissionMode): Promise<void> => {
  mode.value = m
  localStorage.setItem(modeKey(useProjectStore().currentProjectPath), m)
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

// Command-row state: the mode comparison popover and the starter list.
const modePopoverOpen = ref(false)
const startersOpen = ref(false)

const chooseMode = (id: AgentPermissionMode): void => {
  modePopoverOpen.value = false
  setMode(id)
}

const pickStarter = (text: string): void => {
  startersOpen.value = false
  userInput.value = text
  promptInput.value?.focus()
}

/** The @ button does what typing @ does — no tribal knowledge required. */
const openMentionPicker = (): void => {
  const el = promptInput.value
  if (!el) return
  el.focus()
  const caret = el.selectionStart ?? userInput.value.length
  userInput.value = `${userInput.value.slice(0, caret)}@${userInput.value.slice(caret)}`
  nextTick(() => {
    el.selectionStart = el.selectionEnd = caret + 1
    updateMentionState()
  })
}

// ---- @-mention picker: reference scenes/bible pages precisely instead
// of hoping the model guesses the right file from a title.
const novelStore = useNovelStore()
const promptInput = ref<HTMLTextAreaElement | null>(null)
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionIndex = ref(0)
let mentionStart = -1

interface MentionCandidate {
  title: string
  path: string
}

const mentionSources = ref<MentionCandidate[]>([])

const loadMentionSources = async (): Promise<void> => {
  const items: MentionCandidate[] = []
  const walk = (units: Array<{ title: string; path?: string; children?: unknown[] }>): void => {
    for (const unit of units) {
      if (unit.path) items.push({ title: unit.title, path: unit.path })
      if (unit.children) walk(unit.children as never)
    }
  }
  walk((novelStore.structure?.units ?? []) as never)
  const root = useProjectStore().currentProjectPath
  // Skills: @fight loads the writer's technique file for this message.
  {
    const tree = useProjectStore().projectTree as {
      folders?: Array<{ name: string; files?: Array<{ name: string; pathname: string }> }>
    } | null
    const skillsDir = tree?.folders?.find((f) => f.name === 'skills')
    for (const file of skillsDir?.files ?? []) {
      if (!/\.(md|markdown)$/i.test(file.name)) continue
      items.push({ title: file.name.replace(/\.(md|markdown)$/i, ''), path: `skills/${file.name}` })
    }
  }
  // Open editor tabs (Cline's @file): reference whatever is on screen even
  // outside a novel project. Project files get project-relative paths.
  for (const tab of useEditorStore().tabs) {
    if (!tab.pathname) continue
    const relative =
      root && tab.pathname.startsWith(root)
        ? tab.pathname.slice(root.length).replace(/^[/\\]+/, '')
        : tab.pathname
    if (!items.some((c) => c.path === relative)) {
      items.push({ title: tab.filename, path: relative })
    }
  }
  if (root) {
    try {
      const index = await window.electron.novel.entityIndex(root)
      for (const entity of index.entities) {
        items.push({ title: entity.name, path: entity.page })
      }
    } catch {
      // No entity index — scenes alone still help.
    }
  }
  mentionSources.value = items
}

const mentionCandidates = computed<MentionCandidate[]>(() => {
  const q = mentionQuery.value.toLowerCase()
  return mentionSources.value
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.path.toLowerCase().includes(q))
    .slice(0, 8)
})

const updateMentionState = (): void => {
  const el = promptInput.value
  if (!el) return
  const upToCaret = userInput.value.slice(0, el.selectionStart ?? 0)
  const match = /@([\w-]{0,40})$/.exec(upToCaret)
  if (match) {
    mentionStart = upToCaret.length - match[0].length
    mentionQuery.value = match[1]
    mentionIndex.value = 0
    if (!mentionOpen.value) {
      mentionOpen.value = true
      loadMentionSources()
    }
  } else {
    mentionOpen.value = false
  }
}

const closeMention = (): void => {
  mentionOpen.value = false
}

const insertMention = (candidate: MentionCandidate): void => {
  const el = promptInput.value
  if (!el || mentionStart < 0) return
  const caret = el.selectionStart ?? userInput.value.length
  userInput.value =
    userInput.value.slice(0, mentionStart) + candidate.path + ' ' + userInput.value.slice(caret)
  mentionOpen.value = false
  nextTick(() => {
    const pos = mentionStart + candidate.path.length + 1
    el.focus()
    el.setSelectionRange(pos, pos)
  })
}

// ---- Prompt history (shell-style): ArrowUp recalls earlier prompts,
// ArrowDown walks back toward the draft you were typing. Only fires when
// the caret is at the very start/end so multiline editing is untouched.
let historyIndex = -1
let draftBeforeHistory = ''

const promptHistory = (): string[] =>
  aiMessages.value
    .filter((m) => m.role === 'user' && !m.content.startsWith('⤷'))
    .map((m) => m.content)

const recallHistory = (direction: -1 | 1, textarea: HTMLTextAreaElement): void => {
  const history = promptHistory()
  if (history.length === 0) return
  if (historyIndex === -1) {
    if (direction === 1) return
    draftBeforeHistory = userInput.value
    historyIndex = history.length
  }
  const next = historyIndex + direction
  if (next >= history.length) {
    // Walked past the newest entry — restore the draft.
    historyIndex = -1
    userInput.value = draftBeforeHistory
    return
  }
  if (next < 0) return
  historyIndex = next
  userInput.value = history[next]
  // Caret at the end so continued typing appends naturally.
  nextTick(() => {
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  })
}

const handleInputKeydown = (event: KeyboardEvent): void => {
  // While the @-mention picker is open it owns the navigation keys
  // (deliberately shadowing prompt-history arrows).
  if (mentionOpen.value && mentionCandidates.value.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      mentionIndex.value = (mentionIndex.value + 1) % mentionCandidates.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      mentionIndex.value =
        (mentionIndex.value - 1 + mentionCandidates.value.length) %
        mentionCandidates.value.length
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      insertMention(mentionCandidates.value[mentionIndex.value])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMention()
      return
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault()
    historyIndex = -1
    draftBeforeHistory = ''
    sendMessage()
    return
  }
  if (event.key === 'Tab' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault()
    cycleMode()
    return
  }
  if (
    (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
    !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
  ) {
    const textarea = event.target as HTMLTextAreaElement
    const empty = userInput.value.length === 0
    const caretAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0
    const caretAtEnd =
      textarea.selectionStart === textarea.value.length &&
      textarea.selectionEnd === textarea.value.length
    if (
      (event.key === 'ArrowUp' && (empty || caretAtStart || historyIndex !== -1)) ||
      (event.key === 'ArrowDown' && historyIndex !== -1 && (empty || caretAtEnd))
    ) {
      event.preventDefault()
      recallHistory(event.key === 'ArrowUp' ? -1 : 1, textarea)
    }
  }
}

// Push the persisted mode down to main once connected.
watch(aiIsConnected, (connected) => {
  if (connected) setMode(mode.value)
})

// ---- Plan approval (Claude-Code-style: plan file → card → mode switch) ----
const pendingPlan = ref<IPlanProposal | null>(null)

const approvePlan = async (targetMode: 'approvals' | 'auto'): Promise<void> => {
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

// ---- Live plan file → main editor ----
const openPlanInEditor = (relativePath: string): void => {
  const root = useProjectStore().currentProjectPath
  if (!root || !relativePath) return
  const pathname = window.path.join(root, relativePath)
  const editorStore = useEditorStore()
  const openedTab = editorStore.tabs.find((f) =>
    window.fileUtils.isSamePathSync(f.pathname, pathname)
  )
  if (openedTab) {
    if (editorStore.currentFile?.pathname !== openedTab.pathname) {
      editorStore.UPDATE_CURRENT_FILE(openedTab)
    }
  } else {
    window.electron.ipcRenderer.send('mt::open-file', pathname, {})
  }
}

// ---- Detach / reattach ----
const detachBiscuit = async (): Promise<void> => {
  const { ok } = await window.electron.ai.detachBiscuit({
    conversationId: currentId.value || undefined,
    projectRoot: useProjectStore().currentProjectPath ?? undefined
  })
  if (ok) {
    // Hide the docked panel; the reattach broadcast restores it when the
    // detached window closes.
    layoutStore.SET_LAYOUT({ showRightPrompt: false })
  }
}

const reattachBiscuit = (): void => {
  // Closing the window triggers main's reattach broadcast.
  window.close()
}

// ---- Retry a failed/cancelled agent (from the Agents sidebar) ----
const handleRetryTask = (payload: unknown): void => {
  const task = typeof payload === 'string' ? payload : ''
  if (!task) return
  const message = t('biscuit.retryMessage', { task })
  if (sending.value) {
    steerWith(message)
  } else {
    userInput.value = message
    sendMessage()
  }
}

// ---- Live agents + activity: shared store, shown in the Agents sidebar ----
const agentsStore = useAgentsStore()
const { activity, runState, agentMap } = storeToRefs(agentsStore)

// Keep the chat pinned to the latest turn while agents stream activity.
// (Must sit AFTER the destructure above — watch runs its getter
// synchronously at creation, so an earlier placement is a TDZ crash that
// takes the whole workspace subtree down with it.)
watch(
  () => activity.value.length,
  async () => {
    await nextTick()
    if (promptBody.value) promptBody.value.scrollTop = promptBody.value.scrollHeight
  }
)

// ---- Writer questions (selectable option cards) ----
interface WriterQuestion {
  id: string
  question: string
  options: Array<{ label: string; description?: string }>
}
const pendingQuestion = ref<WriterQuestion | null>(null)
const questionFreeform = ref('')

const answerQuestion = (answer: string): void => {
  const text = answer.trim()
  if (!text) return
  pendingQuestion.value = null
  questionFreeform.value = ''
  userInput.value = text
  sendMessage()
}

// ---- Approvals ----
const pendingApproval = ref<IAgentApprovalRequest | null>(null)

// ---- Usage indicators (token counter + context ring) ----
const {
  tokenUsage,
  contextUsage,
  manualCompacting,
  ringCircumference,
  ringDash,
  contextRingLevel,
  contextRingTip,
  tokenTip,
  fmtTokens,
  condenseNow
} = useBiscuitUsage({ sending })

// ---- Conversation history (localStorage + project transcript mirror) ----
const {
  currentId,
  historyVisible,
  sortedConversations,
  initialize: initializeHistory,
  claimFreshThreadIfNeeded,
  newConversation,
  loadConversation,
  deleteConversation,
  exportTranscript
} = useConversationHistory({
  aiMessages,
  isBusy: () => sending.value,
  onSwitch: () => {
    agentsStore.clear()
    pendingApproval.value = null
    pendingQuestion.value = null
    contextUsage.value = null
    tokenUsage.value = null
  },
  afterLoad: async () => {
    await nextTick()
    if (promptBody.value) promptBody.value.scrollTop = promptBody.value.scrollHeight
  }
})

// Countdown to main's auto-decline deadline; the card dismisses itself
// when it lapses so a stale card can never sit around looking answerable.
const approvalNow = ref(Date.now())
let approvalTimer: ReturnType<typeof setInterval> | null = null

const approvalTimeLeft = computed(() => {
  const expiresAt = pendingApproval.value?.expiresAt
  if (!expiresAt) return ''
  const seconds = Math.max(0, Math.floor((expiresAt - approvalNow.value) / 1000))
  const m = Math.floor(seconds / 60)
  const sec = String(seconds % 60).padStart(2, '0')
  return `${m}:${sec}`
})

watch(pendingApproval, (request) => {
  if (approvalTimer) {
    clearInterval(approvalTimer)
    approvalTimer = null
  }
  if (!request?.expiresAt) return
  approvalNow.value = Date.now()
  approvalTimer = setInterval(() => {
    approvalNow.value = Date.now()
    const expiresAt = pendingApproval.value?.expiresAt
    if (expiresAt && Date.now() >= expiresAt) {
      // Main has already treated this as declined.
      pendingApproval.value = null
      ElMessage.info(t('biscuit.approvalTimedOut'))
    }
  }, 1000)
})

let unsubApproval: (() => void) | null = null
let unsubModeChanged: (() => void) | null = null
let unsubApprovalResolved: (() => void) | null = null
let unsubUsage: (() => void) | null = null
let unsubPlan: (() => void) | null = null
let unsubPlanSaved: (() => void) | null = null
let unsubQuestion: (() => void) | null = null
let unsubTokens: (() => void) | null = null

const closePopovers = (): void => {
  modePopoverOpen.value = false
  startersOpen.value = false
}

onMounted(() => {
  // Main owns the per-project mode — adopt it (never push the local mirror).
  refreshModeFromMain()
  agentsStore.init()
  initializeHistory()
  document.addEventListener('click', closePopovers)
  unsubApproval = window.electron.ai.onApprovalRequest((request) => {
    pendingApproval.value = request
  })
  // Main's liveness heartbeat: its presence keeps the dead-main timer at bay.
  unsubHeartbeat = window.electron.ai.onRunHeartbeat?.(() => {
    lastHeartbeatAt = Date.now()
  }) ?? null
  // Mode changes broadcast from main keep every window's mode line in sync.
  unsubModeChanged = window.electron.ai.onModeChanged?.(({ mode: m }) => {
    mode.value = normalizeMode(m)
    localStorage.setItem(modeKey(useProjectStore().currentProjectPath), mode.value)
  }) ?? null
  // Approvals broadcast to every window; whoever answers clears the rest.
  unsubApprovalResolved = window.electron.ai.onApprovalResolved(({ id }) => {
    if (pendingApproval.value?.id === id) pendingApproval.value = null
  })
  unsubUsage = window.electron.ai.onContextUsage((usage) => {
    contextUsage.value = usage
  })
  unsubPlan = window.electron.ai.onPlanProposal((plan) => {
    pendingPlan.value = plan
    openPlanInEditor(plan.path)
  })
  // The live plan is a real markdown file — surface it in the main editor
  // the moment Biscuit creates or updates it, so the writer watches the
  // plan take shape (and can edit it) while brainstorming.
  unsubPlanSaved = window.electron.ai.onPlanSaved(({ path: planPath }) => {
    openPlanInEditor(planPath)
  })
  unsubQuestion = window.electron.ai.onWriterQuestion((question) => {
    pendingQuestion.value = question
  })
  unsubTokens = window.electron.ai.onTokenUsage((usage) => {
    tokenUsage.value = usage
  })
  // Selection actions in the editor route through the normal chat pipeline;
  // agent retries from the sidebar arrive the same way.
  bus.on('biscuit-ask', handleBiscuitAsk)
  bus.on('biscuit-retry-task', handleRetryTask)
})

const respondApproval = async (approved: boolean): Promise<void> => {
  const request = pendingApproval.value
  pendingApproval.value = null
  if (request) {
    await window.electron.ai.approve(request.id, approved)
  }
}

// Starter prompts on the welcome card — one click sends them.
const starterPrompts: Array<() => string> = [
  () => t('biscuit.starterBrainstorm'),
  () => t('biscuit.starterStatus'),
  () => t('biscuit.starterContinuity'),
  () => t('biscuit.starterHealth'),
  () => t('biscuit.starterRetroOutline')
]

const sendStarter = (text: string): void => {
  userInput.value = text
  sendMessage()
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
    // Through the store so interrupted agent rows close out as CANCELLED.
    await agentsStore.stopAll()
  } catch {
    // ignore abort errors
  }
}

const steerWith = async (text: string): Promise<void> => {
  try {
    const queued = await window.electron.ai.steer(text)
    if (queued.queued) {
      aiMessages.value.push({ role: 'user', content: `⤷ ${text}` })
      await nextTick()
      if (promptBody.value) promptBody.value.scrollTop = promptBody.value.scrollHeight
    } else {
      // Not queued (run just ended?) — the note must never vanish.
      userInput.value = text
    }
  } catch {
    userInput.value = text
    ElMessage.error(t('biscuit.steerFailed'))
  }
}

// ---- Quiet-run notice: "sending" must never look alive forever without a
// word. Any run event (activity, tokens, context) counts as a heartbeat; a
// long silence gets an INFORMATIONAL notice — not an error — because at this
// point the run is almost certainly still alive: main's own watchdog does not
// give up until 5 min, and a genuinely dead runtime (crash, stream closed,
// LLM loop gone) arrives as a real error event from main and gets the red
// card. A long research or drafting step legitimately runs quiet, so this is
// "still working, no output yet", with Stop offered as the exit.
const STALL_AFTER_MS_DEFAULT = 90_000
/**
 * DEAD-MAIN budget. Main emits a heartbeat every ~15s while a turn runs, so
 * its ABSENCE means main itself is wedged or gone (a blocked event loop can't
 * fire the heartbeat, and no other event can reach us either). At that point
 * the quiet notice would be a lie — there is nothing alive to wait for — so we
 * raise a real error. Comfortably above the 15s cadence so a couple of missed
 * beats are tolerated. All the "is a turn running" work stays in main; the
 * renderer only watches presence vs absence of the beat.
 */
const LIVENESS_AFTER_MS_DEFAULT = 50_000
/**
 * Budgets read per-run (not at module load) so an e2e spec can shrink them via
 * `addInitScript` — a test that had to wait 90s would double the suite's
 * runtime, which is why this watchdog previously had no coverage at all.
 */
const overrideMs = (key: string, fallback: number): number => {
  const v = Number((window as unknown as Record<string, unknown>)[key])
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const stallAfterMs = (): number => overrideMs('__wordbirdStallMs', STALL_AFTER_MS_DEFAULT)
const livenessAfterMs = (): number => overrideMs('__wordbirdLivenessMs', LIVENESS_AFTER_MS_DEFAULT)

let stallTimer: ReturnType<typeof setInterval> | null = null
let lastRunEventAt = 0
// Any model/agent output resets the QUIET timer; a main heartbeat resets the
// LIVENESS timer. They are separate on purpose — a quiet-but-alive run keeps
// heartbeating without producing output.
watch(
  [() => activity.value.length, tokenUsage, contextUsage],
  () => {
    lastRunEventAt = Date.now()
  }
)
let lastHeartbeatAt = 0
let unsubHeartbeat: (() => void) | null = null

function stopStallWatchdog (): void {
  if (stallTimer) {
    clearInterval(stallTimer)
    stallTimer = null
  }
}

function startStallWatchdog (): void {
  stopStallWatchdog()
  const now = Date.now()
  lastRunEventAt = now
  lastHeartbeatAt = now
  let quietWarned = false
  let deadWarned = false
  const quietBudget = stallAfterMs()
  const livenessBudget = livenessAfterMs()
  const tick = Math.max(
    200,
    Math.min(10_000, Math.floor(Math.min(quietBudget, livenessBudget) / 3))
  )
  stallTimer = setInterval(() => {
    if (!sending.value) {
      stopStallWatchdog()
      return
    }
    const nowMs = Date.now()
    // DEAD MAIN takes precedence: no heartbeat means nothing is alive to wait
    // for. A real error, once.
    if (!deadWarned && nowMs - lastHeartbeatAt > livenessBudget) {
      deadWarned = true
      aiMessages.value.push({
        role: 'error',
        content: t('biscuit.notResponding'),
        errorInfo: {
          title: t('biscuit.notRespondingTitle'),
          explanation: t('biscuit.notResponding')
        }
      })
      return
    }
    // Otherwise, alive but quiet: an informational notice, once.
    if (!quietWarned && !deadWarned && nowMs - lastRunEventAt > quietBudget) {
      quietWarned = true
      aiMessages.value.push({ role: 'notice', content: t('biscuit.quiet') })
    }
  }, tick)
}

// Send message to AI
async function sendMessage (): Promise<void> {
  if (!userInput.value.trim() || !aiIsConnected.value) return
  // A window that opened fresh detaches from the previous durable thread
  // the moment it actually starts chatting.
  await claimFreshThreadIfNeeded()
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
  startStallWatchdog()
  activity.value = []
  agentMap.value = new Map()

  await nextTick()
  if (promptBody.value) {
    promptBody.value.scrollTop = promptBody.value.scrollHeight
  }

  try {
    // Error/stopped/notice cards are UI furniture — never send them to the model.
    const conversation = aiMessages.value
      .filter((m) => m.role !== 'error' && m.role !== 'stopped' && m.role !== 'notice')
      .map(({ role, content }) => ({ role, content }))
    const response = await langGraphService.sendMessage(conversation)

    if (response && response.content) {
      aiMessages.value.push({
        role: 'assistant',
        content: response.content
      })
    } else {
      throw new Error('Biscuit returned an empty response')
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
    stopStallWatchdog()
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
  background: var(--color-primary, var(--wbInfoColor));
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
  color: var(--color-secondary, var(--wbMutedColor));
  transition: all 0.2s;
}

:global(.toggle-biscuit-btn:hover) {
  width: 20px;
  color: var(--color-primary, var(--wbInfoColor));
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
  color: var(--themeColor, var(--wbInfoColor));
  letter-spacing: 0.05em;
  border: 1px solid var(--themeColor, var(--wbInfoColor));
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
  color: var(--iconColor, var(--wbMutedColor));
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 3px 6px;
  &:hover {
    color: var(--themeColor, var(--wbInfoColor));
    border-color: var(--itemBgColor);
  }
}

.new-chat-btn {
  font-size: 0.7rem;
  padding: 3px 9px;
  border-color: var(--itemBgColor);
  color: var(--editorColor);
  &:hover {
    border-color: var(--themeColor, var(--wbInfoColor));
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
    border-color: var(--themeColor, var(--wbInfoColor));
    color: var(--themeColor, var(--wbInfoColor));
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
  color: var(--iconColor, var(--wbMutedColor));
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
  color: var(--iconColor, var(--wbMutedColor));
  flex-shrink: 0;
  &:hover {
    color: var(--deleteColor, var(--wbErrorColor));
  }
}

.history-empty {
  padding: 12px 6px;
  font-size: 0.75rem;
  color: var(--iconColor, var(--wbMutedColor));
  text-align: center;
}

/* Claude-CLI-style mode line under the prompt, ring on the right. */
.mode-line-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* Decision dock: waiting cards pinned above the input, never scrolled away. */
.decision-dock {
  max-height: 45vh;
  overflow-y: auto;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mode-chip-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.mode-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 280px;
  padding: 6px;
  border: 1px solid var(--floatBorderColor, #ddd);
  border-radius: 8px;
  background: var(--floatBgColor, #fff);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.mode-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.mode-option:hover,
.mode-option.active {
  background: var(--floatHoverColor, rgba(120, 120, 120, 0.12));
}

.mode-option__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--editorColor, #444);
}

.mode-option__hint {
  font-size: 11px;
  color: var(--iconColor, #888);
  line-height: 1.35;
}

.cmd-btn {
  flex-shrink: 0;
  width: 22px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--floatBorderColor, #ddd);
  border-radius: 5px;
  background: transparent;
  color: var(--iconColor, #888);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
}

.cmd-btn:hover {
  color: var(--themeColor, #4a9bd9);
  border-color: var(--themeColor, #4a9bd9);
}

.cmd-hint {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--iconColor, #aaa);
  cursor: help;
}

.starters-popover {
  z-index: 25;
}

.mode-line {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 4px;
  font-size: 0.72rem;
  cursor: pointer;
  user-select: none;
  color: var(--color-secondary, var(--wbMutedColor));
  min-width: 0;
  &:hover .mode-cycle-hint {
    opacity: 1;
  }
}

.token-counter {
  font-size: 0.66rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--iconColor, var(--wbMutedColor));
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
    stroke: var(--iconColor, var(--wbMutedColor));
  }
  &.level-mid {
    stroke: var(--wbWarningColor);
  }
  &.level-high {
    stroke: var(--wbErrorColor);
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
  color: var(--wbWarningColor);
}

.mode-line--ask .mode-symbol,
.mode-line--ask .mode-name {
  color: var(--color-secondary, var(--wbMutedColor));
}

.mode-line--auto .mode-symbol,
.mode-line--auto .mode-name {
  color: var(--color-primary, var(--wbInfoColor));
}

.mode-line--full-auto .mode-symbol,
.mode-line--full-auto .mode-name {
  color: var(--wbErrorColor);
}

.mode-cycle-hint {
  opacity: 0.55;
  transition: opacity 0.15s;
}

.approval-card {
  border: 1px solid var(--color-primary, var(--wbInfoColor));
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
  color: var(--color-primary, var(--wbInfoColor));
}

.question-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 4px;
  padding: 10px 12px;
  border: 1px solid var(--themeColor, var(--wbInfoColor));
  border-radius: 10px;
  background: var(--floatBgColor, transparent);
}

.question-card__text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--editorColor, #303133);
  margin-bottom: 2px;
  white-space: pre-wrap;
}

.question-option {
  font: inherit;
  text-align: left;
  padding: 6px 10px;
  border: 1px solid var(--itemBgColor, rgba(128, 128, 128, 0.25));
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1px;
  &:hover {
    border-color: var(--themeColor, var(--wbInfoColor));
  }
}

.question-option__label {
  font-size: 0.8rem;
  color: var(--editorColor, #303133);
}

.question-option__desc {
  font-size: 0.7rem;
  color: var(--iconColor, var(--wbMutedColor));
}

.question-freeform {
  display: flex;
  gap: 6px;
  margin-top: 2px;
  & input {
    flex: 1;
    font: inherit;
    font-size: 0.78rem;
    padding: 5px 8px;
    border: 1px solid var(--itemBgColor, rgba(128, 128, 128, 0.25));
    border-radius: 8px;
    background: transparent;
    color: var(--editorColor, #303133);
    outline: none;
    &:focus {
      border-color: var(--themeColor, var(--wbInfoColor));
    }
  }
}

.approval-countdown {
  font-size: 0.68rem;
  color: var(--iconColor, var(--wbMutedColor));
  margin-top: 4px;
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

.right-prompt--detached {
  width: 100%;
  flex: 1 1 auto;
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

/* First-open onboarding card */
.biscuit-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: auto 12px;
  text-align: center;
}

.welcome-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--editorColor, #303133);
}

.welcome-sub {
  font-size: 0.8rem;
  color: var(--iconColor, var(--wbMutedColor));
  margin: 0;
  line-height: 1.5;
}

.welcome-suggestion {
  font: inherit;
  font-size: 0.78rem;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border: 1px solid var(--itemBgColor, rgba(128, 128, 128, 0.25));
  border-radius: 8px;
  background: transparent;
  color: var(--editorColor, #303133);
  cursor: pointer;
  &:hover {
    border-color: var(--themeColor, var(--wbInfoColor));
    color: var(--themeColor, var(--wbInfoColor));
  }
}

.welcome-hint {
  font-size: 0.7rem;
  color: var(--iconColor, var(--wbMutedColor));
  opacity: 0.8;
  margin: 4px 0 0;
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

/* Informational notice: calm, clearly not an error. Left accent + info icon,
   muted tone — a quiet-but-alive run should reassure, not alarm. */
.message--notice {
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border-left: 2px solid var(--wbInfoColor, #409eff);
  border-radius: 4px;
  background: color-mix(in srgb, var(--wbInfoColor, #409eff) 8%, transparent);
}
.message--notice__icon {
  color: var(--wbInfoColor, #409eff);
  flex-shrink: 0;
  margin-top: 2px;
}
.message--notice .message__text {
  color: var(--color-secondary, var(--wbMutedColor));
  max-width: 100%;
}

.message__text {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text, #303133);
  max-width: 90%;
}

.message--user .message__text {
  text-align: right;
  color: var(--color-secondary, var(--wbMutedColor));
}

.message--assistant .message__text {
  text-align: left;
  color: var(--color-primary, var(--wbInfoColor));
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
    border-left: 3px solid var(--themeColor, var(--wbInfoColor));
    color: var(--iconColor, var(--wbMutedColor));
  }
  & :deep(hr) {
    border: none;
    border-top: 1px solid var(--itemBgColor, rgba(128, 128, 128, 0.2));
    margin: 0.7em 0;
  }
  & :deep(a) {
    color: var(--themeColor, var(--wbInfoColor));
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
  color: var(--color-primary, var(--wbInfoColor));
  font-style: italic;
}

/* Structured error card: friendly headline + explanation, technical
   detail folded away, optional action button. */

.message--thinking .message__text {
  color: var(--color-secondary, var(--wbMutedColor));
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
  position: relative;
  display: flex;
  background: var(--inputBgColor, rgba(128, 128, 128, 0.05));
  border: 1px solid var(--color-border, rgba(128, 128, 128, 0.25));
  border-radius: 8px;
  padding: 8px var(--spacing-3);
  box-sizing: border-box;
}

.mention-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 240px;
  overflow-y: auto;
  background: var(--floatBgColor, var(--editorBgColor));
  border: 1px solid var(--color-border, rgba(128, 128, 128, 0.25));
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  padding: 4px;
  z-index: 30;
}

.mention-hint {
  font-size: 10px;
  color: var(--iconColor);
  padding: 2px 8px 4px;
}

.mention-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  color: var(--editorColor);
  &.active,
  &:hover {
    background: var(--itemBgColor);
  }
}

.mention-title {
  flex-shrink: 0;
}

.mention-path {
  color: var(--iconColor);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background-color: var(--wbMutedColor); /* el-color-info fallback */
  display: inline-block;
}

.status-indicator.connected {
  background-color: var(--wbSuccessColor); /* el-color-success fallback */
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
