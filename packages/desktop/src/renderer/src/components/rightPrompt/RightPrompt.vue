<template>
  <aside class="right-prompt" role="complementary" aria-label="WordBird chat panel">
    <header class="prompt-header">
      <div class="prompt-title">WordBird</div>
    </header>

    <section class="prompt-body" ref="promptBody">
      <div
        v-for="(message, index) in aiMessages"
        :key="index"
        :class="['message', `message--${message.role}`]"
      >
        <div class="message__header">
          <span class="message__label">
            {{ message.role === 'user' ? 'You' : (message.role === 'error' ? 'System' : 'AI') }}
          </span>
        </div>
        <div class="message__text">{{ message.content }}</div>
      </div>

      <!-- Thinking Indicator -->
      <div v-if="sending" class="message message--assistant message--thinking">
        <div class="message__header">
          <span class="message__label">AI</span>
        </div>
        <div class="message__text italic">Thinking...</div>
      </div>
    </section>

    <footer class="prompt-footer">
      <div class="prompt-input-outer">
        <div class="prompt-input-wrapper">
          <textarea
            v-model="userInput"
            rows="4"
            aria-label="Chat input"
            placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
            @keydown.enter.exact.prevent="sendMessage"
          ></textarea>
        </div>
        <div class="prompt-input-actions">
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
import { ref, nextTick, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '../../store/preferences'
import { langGraphService } from '../../services/langgraph'
import { 
  type AIProvider, 
  type IAIConfig, 
  type ILangGraphMessage
} from '../../shared/types/langgraph'
import { PROVIDERS_WITHOUT_KEY } from '@shared/constants/ai'

// Store
const preferencesStore = usePreferencesStore()
const { aiProvider, aiConfigs } = storeToRefs(preferencesStore)

// Reactive state
const promptBody = ref<HTMLElement | null>(null)
const userInput = ref('')
const aiIsConnected = ref(false)
const sending = ref(false)
const aiMessages = ref<ILangGraphMessage[]>([])
const currentAbortController = ref<AbortController | null>(null)

// Connect to AI provider
async function connect(): Promise<void> {
  const currentProvider = aiProvider.value as AIProvider
  const currentConfig = aiConfigs.value[currentProvider]

  if (!currentConfig) {
    console.warn('[RightPrompt] No config found for provider:', currentProvider)
    return
  }

  // Validate API key for providers that need it
  const needsKey = !PROVIDERS_WITHOUT_KEY.includes(currentProvider)
  if (needsKey && !currentConfig.apiKey?.trim()) {
    console.warn('[RightPrompt] Missing API key for provider:', currentProvider)
    aiIsConnected.value = false
    return
  }

  try {
    const config: IAIConfig = {
      provider: currentProvider,
      apiKey: currentConfig.apiKey,
      baseUrl: currentConfig.baseUrl,
      model: currentConfig.model
    }
    
    // Check if the service is already connected to this EXACT config
    // to avoid redundant reconnections
    if (langGraphService.isConnected && 
        langGraphService.currentProvider === currentProvider &&
        (langGraphService as any)._currentModel === (currentConfig.model || null)) {
      aiIsConnected.value = true
      return
    }

    await langGraphService.connect(config)
    aiIsConnected.value = true
    console.log('[RightPrompt] AI Connected successfully')
  } catch (error) {
    console.error('[RightPrompt] Connect error:', error)
    aiIsConnected.value = false
  }
}

// Watch for provider/config changes and reconnect
watch([aiProvider, aiConfigs], () => {
  connect()
}, { deep: true })

onMounted(() => {
  connect()
})

// Stop generation
function stopGeneration(): void {
  if (currentAbortController.value) {
    currentAbortController.value.abort()
    currentAbortController.value = null
  }
}

// Send message to AI
async function sendMessage(): Promise<void> {
  if (!userInput.value.trim() || !aiIsConnected.value || sending.value) return

  const userMessage: ILangGraphMessage = {
    role: 'user',
    content: userInput.value.trim()
  }

  aiMessages.value.push(userMessage)
  userInput.value = ''
  sending.value = true
  
  // Initialize AbortController for this request
  currentAbortController.value = new AbortController()

  await nextTick()
  if (promptBody.value) {
    promptBody.value.scrollTop = promptBody.value.scrollHeight
  }

  try {
    const response = await langGraphService.sendMessage(aiMessages.value, currentAbortController.value.signal)
    
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
  } catch (error: any) {
    console.error('[RightPrompt] Send message error:', error)
    
    // Check if it was aborted
    if (error.message === 'Request aborted by user') {
      aiMessages.value.push({
        role: 'error',
        content: 'Generation stopped by user.'
      })
    } else {
      const errorMessage = error.message || String(error)
      // Add error to chat history so user can see the hint
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
    currentAbortController.value = null
  }
}
</script>

<style scoped>
.right-prompt {
  width: var(--prompt-width, 340px);
  min-width: 300px;
  max-width: 450px;
  display: flex;
  flex-direction: column;
  background: var(--editorBgColor);
  border-left: 1px solid var(--color-border, rgba(128, 128, 128, 0.2));
  overflow: hidden;
  box-sizing: border-box;
}

.prompt-header {
  padding: 12px var(--spacing-4);
  border-bottom: 1px solid var(--color-border, rgba(128, 128, 128, 0.2));
  background: var(--dialogBgColor, var(--editorBgColor));
}

.prompt-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-primary, #409eff);
  letter-spacing: 0.05em;
  text-align: center;
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
  gap: 6px;
}

.message--user .message__label {
  color: var(--color-secondary, #909399);
}

.message__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message__label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-primary, #409eff);
}

.message__text {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text, #303133);
}

.message--error .message__label {
  color: #f56c6c;
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
  justify-content: flex-end;
  gap: var(--spacing-2);
}
</style>