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
      title="Collapse Biscuit"
      @click="togglePanel"
    >
      <el-icon><DArrowRight /></el-icon>
    </div>

    <header class="prompt-header">
      <div class="prompt-title">
        Biscuit
      </div>
      <div class="header-actions">
        <el-tooltip
          content="Start a fresh conversation"
          placement="bottom"
        >
          <el-icon
            class="header-action"
            @click="newConversation"
          >
            <CirclePlus />
          </el-icon>
        </el-tooltip>
      </div>
    </header>

    <section
      ref="promptBody"
      class="prompt-body"
    >
      <div
        v-for="(message, index) in aiMessages"
        :key="index"
        :class="['message', `message--${message.role}`]"
      >
        <div class="message__text">
          {{ message.content }}
        </div>
      </div>

      <!-- Approval request card (ask mode) -->
      <div
        v-if="pendingApproval"
        class="approval-card"
      >
        <div class="approval-title">
          Biscuit would like to send out:
        </div>
        <div class="approval-summary">
          {{ pendingApproval.summary }}
        </div>
        <div class="approval-actions">
          <el-button
            size="small"
            @click="respondApproval(false)"
          >
            Not now
          </el-button>
          <el-button
            size="small"
            type="primary"
            @click="respondApproval(true)"
          >
            Go ahead
          </el-button>
        </div>
      </div>

      <!-- Live activity feed (plain-language agent monitor) -->
      <div
        v-if="sending && activity.length > 0"
        class="activity-feed"
      >
        <div
          v-for="item in visibleActivity"
          :key="item.id"
          class="activity-item"
          :class="`activity--${item.kind}`"
          :title="item.detail"
        >
          <span class="activity-dot" />
          <span class="activity-label">{{ item.label }}</span>
        </div>
      </div>

      <!-- Thinking Indicator -->
      <div
        v-if="sending"
        class="message message--assistant message--thinking"
      >
        <div class="message__text italic">
          Analyzing the crumbs you just dropped...
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
            placeholder="Greetings! I'm Biscuit. Bring the ink and your wildest ideas, and let's bring them to life."
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.shift.tab.exact.prevent="cycleMode"
          />
        </div>
        <!-- Autonomy mode line (Claude-CLI style): shift+tab cycles -->
        <div
          class="mode-line"
          :class="`mode-line--${mode}`"
          :title="currentModeInfo.hint"
          @click="cycleMode"
        >
          <span class="mode-symbol">{{ currentModeInfo.symbol }}</span>
          <span class="mode-name">{{ currentModeInfo.label.toLowerCase() }} mode</span>
          <span class="mode-cycle-hint">(shift+tab to cycle)</span>
        </div>
        <div class="prompt-input-actions">
          <el-button
            :type="aiIsConnected ? 'success' : 'info'"
            size="small"
            plain
            class="connection-status-btn"
            title="Configure AI"
            @click="openAiSettings"
          >
            <span
              class="status-indicator"
              :class="{ 'connected': aiIsConnected }"
            />
            {{ currentModelName }}
          </el-button>

          <el-button
            type="danger"
            size="small"
            :disabled="!sending"
            @click="stopGeneration"
          >
            Stop
          </el-button>
          <el-button
            type="primary"
            size="small"
            :disabled="!aiIsConnected || !userInput.trim()"
            :loading="sending"
            @click="sendMessage"
          >
            Send
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
import { langGraphService } from '../../services/langgraph'
import { DArrowRight, CirclePlus } from '@element-plus/icons-vue'
import GlobalAgentReview from '../agent/GlobalAgentReview.vue'
import type {
  ILangGraphMessage,
  IAgentActivityEvent,
  IAgentApprovalRequest,
  AgentPermissionMode
} from '@shared/types/langgraph'

// Store
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const { aiProvider, aiConfigs, aiIsConnected } = storeToRefs(preferencesStore)

const currentModelName = computed(() => {
  if (!aiIsConnected.value) return 'Disconnected'
  const config = aiConfigs.value[aiProvider.value]
  const name = config?.model || 'Connected'
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
})

// Reactive state
const promptBody = ref<HTMLElement | null>(null)
const userInput = ref('')
const sending = ref(false)
const aiMessages = ref<ILangGraphMessage[]>([])

// ---- Autonomy mode (Claude-CLI style: line under the prompt, shift+tab cycles) ----
const MODES: Array<{ id: AgentPermissionMode; label: string; symbol: string; hint: string }> = [
  { id: 'plan', label: 'Plan', symbol: '⏸', hint: 'Biscuit describes what it would do — nothing runs.' },
  { id: 'ask', label: 'Ask', symbol: '⇥', hint: 'Biscuit asks before sending out helpers.' },
  { id: 'auto', label: 'Auto', symbol: '⏵', hint: 'Biscuit works freely; you review every change.' },
  { id: 'full-auto', label: 'Max', symbol: '⏵⏵', hint: 'Long tasks, bigger budgets; changes still reviewed.' }
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

// ---- Activity feed + approvals ----
const activity = ref<IAgentActivityEvent[]>([])
const pendingApproval = ref<IAgentApprovalRequest | null>(null)

const visibleActivity = computed(() => activity.value.slice(-8))

let unsubActivity: (() => void) | null = null
let unsubApproval: (() => void) | null = null

onMounted(() => {
  if (aiIsConnected.value) setMode(mode.value)
  unsubActivity = window.electron.ai.onActivity(async (event) => {
    activity.value.push(event)
    if (activity.value.length > 200) activity.value.splice(0, 100)
    await nextTick()
    if (promptBody.value) promptBody.value.scrollTop = promptBody.value.scrollHeight
  })
  unsubApproval = window.electron.ai.onApprovalRequest((request) => {
    pendingApproval.value = request
  })
})

const respondApproval = async (approved: boolean): Promise<void> => {
  const request = pendingApproval.value
  pendingApproval.value = null
  if (request) {
    await window.electron.ai.approve(request.id, approved)
  }
}

const newConversation = async (): Promise<void> => {
  try {
    await window.electron.ai.resetThread()
  } catch {
    // Not connected — clear the local transcript anyway.
  }
  aiMessages.value = []
  activity.value = []
  pendingApproval.value = null
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

// Send message to AI
async function sendMessage (): Promise<void> {
  if (!userInput.value.trim() || !aiIsConnected.value || sending.value) return

  const userMessage: ILangGraphMessage = {
    role: 'user',
    content: userInput.value.trim()
  }

  aiMessages.value.push(userMessage)
  userInput.value = ''
  sending.value = true
  activity.value = []

  await nextTick()
  if (promptBody.value) {
    promptBody.value.scrollTop = promptBody.value.scrollHeight
  }

  try {
    const response = await langGraphService.sendMessage(aiMessages.value)

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
        content: 'Request aborted.'
      })
    } else {
      aiMessages.value.push({
        role: 'error',
        content: `Error: ${errorMessage}`
      })
      ElMessage.error('Failed to send message: ' + errorMessage)
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
  height: 28px;
  padding: 0 var(--spacing-4);
  background: var(--editorBgColor);
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  position: relative;
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
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-primary, #409eff);
  letter-spacing: 0.05em;
  text-align: center;
  border: 1px solid var(--color-primary, #409eff);
  padding: 1px 10px;
  border-radius: 12px;
  background: rgba(64, 158, 255, 0.05);
  line-height: normal;
}

.header-actions {
  position: absolute;
  right: var(--spacing-4);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 6px;
}

.header-action {
  cursor: pointer;
  color: var(--color-secondary, #909399);
  &:hover {
    color: var(--color-primary, #409eff);
  }
}

/* Claude-CLI-style mode line under the prompt. */
.mode-line {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 4px;
  font-size: 0.72rem;
  cursor: pointer;
  user-select: none;
  color: var(--color-secondary, #909399);
  &:hover .mode-cycle-hint {
    opacity: 1;
  }
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

.activity-feed {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 10px;
  border-left: 2px solid var(--color-border, rgba(128, 128, 128, 0.25));
  margin: 0 4px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: var(--color-secondary, #909399);
}

.activity-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-secondary, #909399);
  flex-shrink: 0;
}

.activity--spawn .activity-dot,
.activity--agent-start .activity-dot {
  background: var(--color-primary, #409eff);
}

.activity--agent-done .activity-dot {
  background: #67c23a;
}

.activity--approval .activity-dot {
  background: #e6a23c;
}

.activity-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.message--stopped .message__text {
  text-align: left;
  color: var(--color-primary, #409eff);
  font-style: italic;
}

.message--error .message__text {
  color: #f56c6c;
  font-size: 0.8rem;
  background: rgba(245, 108, 108, 0.1);
  padding: 8px;
  border-radius: 4px;
}

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
