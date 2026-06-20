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
          />
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
import { ref, nextTick, computed, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '../../store/preferences'
import { useLayoutStore } from '../../store/layout'
import { langGraphService } from '../../services/langgraph'
import { DArrowRight } from '@element-plus/icons-vue'
import GlobalAgentReview from '../agent/GlobalAgentReview.vue'
import {
  type ILangGraphMessage
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
})

// Reactive state
const promptBody = ref<HTMLElement | null>(null)
const userInput = ref('')
const sending = ref(false)
const aiMessages = ref<ILangGraphMessage[]>([])

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
