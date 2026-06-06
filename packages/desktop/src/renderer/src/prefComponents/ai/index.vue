<template>
  <div class="pref-ai">
    <h4>{{ t('preferences.ai.title') || 'AI Settings' }}</h4>
    
    <compound>
      <template #children>
        <cur-select
          description="Select model provider"
          :value="aiProvider"
          :options="providerOptions"
          :on-change="handleProviderChange"
        />
      </template>
    </compound>

    <compound v-if="currentConfig">
      <template #children>
        <text-box
          v-if="aiProvider !== 'ollama'"
          description="Enter API key"
          :input="currentConfig.apiKey || ''"
          placeholder="sk-..."
          :on-change="(val) => updateConfig({ apiKey: val })"
        />

        <text-box
          v-if="requiresBaseUrl"
          description="Enter endpoint URL"
          :input="currentConfig.baseUrl || ''"
          :placeholder="defaultBaseUrl"
          :on-change="(val) => updateConfig({ baseUrl: val })"
        />

        <div class="action-group">
          <el-button
            type="primary"
            class="action-btn"
            :loading="connecting"
            @click="testConnection"
          >
            Connect Provider
          </el-button>
          <span v-if="connectionStatus" :class="['status-msg', connectionStatus.type]">
            {{ connectionStatus.message }}
          </span>
        </div>

        <div v-if="connectionStatus?.type === 'success'" class="model-select-container">
          <div class="dynamic-model-select">
            <div class="description-row space-between">
              <span class="description">Select model</span>
              <el-button 
                link 
                type="primary" 
                size="small"
                :loading="loadingModels"
                @click="fetchDynamicModels"
              >
                Refresh Models
              </el-button>
            </div>
            
            <cur-select
              :value="currentConfig.model"
              :options="modelOptions"
              filterable
              allow-create
              placeholder="Select a model"
              :on-change="(val: string) => updateConfig({ model: val })"
            />
            
            <div class="action-group">
              <el-button
                type="primary"
                plain
                class="action-btn"
                :loading="modelConnecting"
                :disabled="!currentConfig.model"
                @click="testModelConnection"
              >
                Connect Model
              </el-button>
              <span v-if="modelConnectionStatus" :class="['status-msg', modelConnectionStatus.type]">
                {{ modelConnectionStatus.message }}
              </span>
            </div>

            <div v-if="modelError" class="status-msg error">
              {{ modelError }}
            </div>
          </div>
        </div>
      </template>
    </compound>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Compound from '../common/compound/index.vue'
import textBox from '../common/textBox/index.vue'
import curSelect from '../common/select/index.vue'
import { PROVIDER_BASE_URLS, PROVIDER_DEFAULT_MODELS } from '@/shared/types/langgraph'
import { langGraphService } from '@/services/langgraph'
import type { AIProvider, IAIConfig, IAIProviderConfig } from '@/shared/types/langgraph'

// Hooks
const { t } = useI18n()
const preferencesStore = usePreferencesStore()
const { aiProvider, aiConfigs } = storeToRefs(preferencesStore)

// Constants
const providerOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google Gemini', value: 'google' },
  { label: 'Ollama (Local)', value: 'ollama' },
  { label: 'OpenRouter', value: 'openrouter' }
]

// Computed
const currentConfig = computed(() => aiConfigs.value[aiProvider.value])
const defaultBaseUrl = computed(() => PROVIDER_BASE_URLS[aiProvider.value as AIProvider])
const requiresBaseUrl = computed(() => 
  ['ollama', 'openrouter'].includes(aiProvider.value) || 
  (aiProvider.value === 'openai' && currentConfig.value?.baseUrl)
)

const modelOptions = computed(() => dynamicModels.value.map(m => ({ label: m, value: m })))

// State
const loadingModels = ref(false)
const dynamicModels = ref<string[]>([])
const connecting = ref(false)
const connectionStatus = ref<{ type: 'success' | 'error', message: string } | null>(null)
const modelConnecting = ref(false)
const modelConnectionStatus = ref<{ type: 'success' | 'error', message: string } | null>(null)
const modelError = ref('')

// Watchers
watch(aiProvider, () => {
  connectionStatus.value = null
  modelConnectionStatus.value = null
  dynamicModels.value = []
  modelError.value = ''
})

watch(() => currentConfig.value?.model, () => {
  modelConnectionStatus.value = null
})

// Methods
const handleProviderChange = (val: string) => {
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'aiProvider', value: val })
}

const updateConfig = (config: Partial<IAIProviderConfig>) => {
  preferencesStore.SET_AI_CONFIG(aiProvider.value, config)
}

const getErrorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err)
}

const fetchDynamicModels = async () => {
  loadingModels.value = true
  modelError.value = ''
  
  try {
    const config = currentConfig.value
    const models = await langGraphService.fetchModels(
      aiProvider.value as AIProvider, 
      config.apiKey, 
      config.baseUrl
    )
    
    if (models.length === 0) {
      modelError.value = 'No models found. Please check your credentials.'
    } else {
      dynamicModels.value = models
    }
  } catch (err) {
    modelError.value = `Failed to fetch models: ${getErrorMessage(err)}`
  } finally {
    loadingModels.value = false
  }
}

const testConnection = async () => {
  connecting.value = true
  connectionStatus.value = null
  modelConnectionStatus.value = null
  modelError.value = ''
  
  try {
    const fullConfig: IAIConfig = {
      provider: aiProvider.value as AIProvider,
      ...currentConfig.value
    }
    await langGraphService.connect(fullConfig)
    connectionStatus.value = { type: 'success', message: 'Provider Connected' }
    
    // Fetch models immediately after connection success
    await fetchDynamicModels()
  } catch (err) {
    connectionStatus.value = { type: 'error', message: getErrorMessage(err) }
  } finally {
    connecting.value = false
  }
}

const testModelConnection = async () => {
  if (!currentConfig.value?.model) return
  
  modelConnecting.value = true
  modelConnectionStatus.value = null
  
  try {
    const config = currentConfig.value
    const fullConfig: IAIConfig = {
      provider: aiProvider.value as AIProvider,
      ...config
    }
    
    if (aiProvider.value === 'ollama') {
      const url = (config.baseUrl || PROVIDER_BASE_URLS.ollama).replace(/\/$/, '')
      const response = await fetch(`${url}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: config.model })
      })
      
      if (!response.ok) {
        throw new Error(`Model '${config.model}' not found or Ollama is busy.`)
      }
    } else {
      // For other providers, probe via connect logic
      await langGraphService.connect(fullConfig)
    }
    
    modelConnectionStatus.value = { type: 'success', message: 'Model Connection Successful' }
  } catch (err) {
    modelConnectionStatus.value = { 
      type: 'error', 
      message: `Model Connection Failed: ${getErrorMessage(err)}` 
    }
  } finally {
    modelConnecting.value = false
  }
}

// Lifecycle
onMounted(() => {
  if (langGraphService.isConnected && langGraphService.currentProvider === aiProvider.value) {
    connectionStatus.value = { type: 'success', message: 'Provider Connected' }
    fetchDynamicModels()
  }
})
</script>

<style scoped>
.config-group {
  margin-bottom: 12px;
}

.description-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: 6px;
}

.description-row.space-between {
  justify-content: space-between;
}

.description {
  font-size: 14px;
  color: var(--editorColor);
  font-weight: 500;
}

.action-group {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  margin-bottom: 12px;
}

.action-btn {
  width: 160px;
}

.model-select-container {
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid var(--lineColor);
}

.dynamic-model-select {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-msg {
  font-size: 13px;
  font-weight: 500;
}

.status-msg.success {
  color: #67c23a;
}

.status-msg.error {
  color: #f56c6c;
}

/* Deep Selector Overrides */
:deep(.el-select) {
  width: 100%;
}

:deep(.el-input__wrapper) {
  background-color: var(--inputBgColor);
  box-shadow: none;
  border: 1px solid var(--lineColor);
}

:deep(.el-input__inner) {
  color: var(--editorColor);
}
</style>