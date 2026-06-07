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
          v-if="!PROVIDERS_WITHOUT_KEY.includes(aiProvider as AIProvider)"
          description="Enter API key"
          :input="currentConfig.apiKey || ''"
          placeholder="sk-..."
          type="password"
          :on-change="(val) => updateConfig({ apiKey: val })"
        />

        <text-box
          v-if="showEndpointField && requiresBaseUrl"
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
              :value="currentConfig.model || ''"
              :options="modelOptions"
              :filterable="true"
              :allow-create="true"
              placeholder="Select a model"
              :on-change="(val: string | number | boolean) => updateConfig({ model: String(val) })"
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

            <div v-if="pullProgress" class="pull-progress">
              <span class="status-msg success">
                {{ pullProgress.status || 'Pulling...' }}
                <span v-if="pullProgress.percent !== undefined">({{ pullProgress.percent }}%)</span>
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
import { PROVIDER_BASE_URLS, PROVIDER_LABELS, AI_PROVIDERS, PROVIDERS_WITHOUT_KEY, AI_DEFAULTS } from '@shared/constants/ai'
import { langGraphService } from '@/services/langgraph'
import type { AIProvider, IAIConfig, IAIProviderConfig } from '@shared/types/langgraph'

// Hooks
const { t } = useI18n()
const preferencesStore = usePreferencesStore()
const { aiProvider, aiConfigs } = storeToRefs(preferencesStore)

// Constants
const providerOptions = AI_PROVIDERS.map(p => ({
  label: PROVIDER_LABELS[p],
  value: p as string
}))

// Computed
const currentConfig = computed(() => aiConfigs.value[aiProvider.value] || AI_DEFAULTS.configs[aiProvider.value as AIProvider])
const defaultBaseUrl = computed(() => PROVIDER_BASE_URLS[aiProvider.value as AIProvider])
// ollama_bundled uses the default endpoint, so we don't show the URL field
// Only show endpoint URL for ollama (user hosted) or openai with custom baseUrl
const requiresBaseUrl = computed(() =>
  (aiProvider.value === 'ollama') ||
  (aiProvider.value === 'openai' && currentConfig.value?.baseUrl)
)

// For ollama_bundled, we don't need to show the endpoint URL field
const showEndpointField = computed(() => aiProvider.value !== 'ollama_bundled')

// Also expose aiIsConnected for the right prompt
const { aiIsConnected } = storeToRefs(preferencesStore)

const modelOptions = computed(() => dynamicModels.value.map(m => ({ label: m, value: m })))

// State
const loadingModels = ref(false)
const dynamicModels = ref<string[]>([])
const connecting = ref(false)
const connectionStatus = ref<{ type: 'success' | 'error', message: string } | null>(null)
const modelConnecting = ref(false)
const modelConnectionStatus = ref<{ type: 'success' | 'error', message: string } | null>(null)
const modelError = ref('')
const pullProgress = ref<{ percent?: number; status?: string } | null>(null)

// Watchers
watch(aiProvider, () => {
  connectionStatus.value = null
  modelConnectionStatus.value = null
  pullProgress.value = null
  dynamicModels.value = []
  modelError.value = ''
})

watch(() => currentConfig.value?.model, () => {
  modelConnectionStatus.value = null
})

// Methods
const handleProviderChange = (val: string | number | boolean) => {
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'aiProvider', value: String(val) })
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
    
    // Update the store's connection status
    preferencesStore.aiIsConnected = true
    
    // Fetch models immediately after connection success
    await fetchDynamicModels()
  } catch (err) {
    connectionStatus.value = { type: 'error', message: getErrorMessage(err) }
    preferencesStore.aiIsConnected = false
  } finally {
    connecting.value = false
  }
}

const testModelConnection = async () => {
  if (!currentConfig.value?.model) return
  
  modelConnecting.value = true
  modelConnectionStatus.value = null
  pullProgress.value = null
  
  // Set up pull progress listener
  const unsubscribe = langGraphService.onPullProgress((progress) => {
    pullProgress.value = {
      percent: progress.percent,
      status: progress.status
    }
  })
  
  try {
    const config = currentConfig.value
    const fullConfig: IAIConfig = {
      provider: aiProvider.value as AIProvider,
      ...config
    }
    
    if (aiProvider.value === 'ollama' || aiProvider.value === 'ollama_bundled') {
      const url = (config.baseUrl || PROVIDER_BASE_URLS.ollama).replace(/\/$/, '')
      const modelName = config.model || ''
      const response = await fetch(`${url}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      })
      
      if (!response.ok) {
        // Model not found - try to pull it
        modelConnectionStatus.value = { type: 'success', message: 'Pulling model...' }
        await langGraphService.pullModel(modelName, url)
        // After pull, verify again
        const verifyResponse = await fetch(`${url}/api/show`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: modelName })
        })
        if (!verifyResponse.ok) {
          throw new Error(`Model '${modelName}' pull failed or Ollama is busy.`)
        }
      }
      // For Ollama, we still need to connect to establish the agent
      await langGraphService.connect(fullConfig)
    } else {
      // For other providers, probe via connect logic
      await langGraphService.connect(fullConfig)
    }
    
    modelConnectionStatus.value = { type: 'success', message: 'Model Connection Successful' }
    preferencesStore.aiIsConnected = true
  } catch (err) {
    modelConnectionStatus.value = { 
      type: 'error', 
      message: `Model Connection Failed: ${getErrorMessage(err)}` 
    }
    preferencesStore.aiIsConnected = false
  } finally {
    modelConnecting.value = false
    unsubscribe()
  }
}

// Lifecycle
onMounted(() => {
  if (langGraphService.isConnected && langGraphService.currentProvider === aiProvider.value) {
    connectionStatus.value = { type: 'success', message: 'Provider Connected' }
    preferencesStore.aiIsConnected = true
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