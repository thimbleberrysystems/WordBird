<template>
  <div class="pref-ai">
    <h4>{{ t('preferences.ai.title') }}</h4>

    <compound>
      <template #children>
        <cur-select
          :description="t('preferences.ai.selectProvider')"
          :value="aiProvider"
          :options="providerOptions"
          :on-change="handleProviderChange"
        />
      </template>
    </compound>

    <compound v-if="currentConfig">
      <template #children>
        <text-box
          v-if="aiProvider === 'claude-code'"
          :description="t('preferences.ai.claudeCodeToken')"
          :input="currentConfig.apiKey || ''"
          placeholder="sk-ant-oat01-…"
          type="password"
          :notes="t('preferences.ai.claudeCodeHint')"
          :on-change="(val) => updateConfig({ apiKey: val })"
        />
        <text-box
          v-else-if="!PROVIDERS_WITHOUT_KEY.includes(aiProvider as AIProvider)"
          :description="t('preferences.ai.enterApiKey')"
          :input="currentConfig.apiKey || ''"
          placeholder="sk-..."
          type="password"
          :on-change="(val) => updateConfig({ apiKey: val })"
        />

        <text-box
          v-if="showEndpointField && requiresBaseUrl"
          :description="t('preferences.ai.enterEndpoint')"
          :input="currentConfig.baseUrl || ''"
          :placeholder="defaultBaseUrl"
          :on-change="(val) => updateConfig({ baseUrl: val })"
        />

        <!-- The Claude Code runtime manages sampling and output size itself. -->
        <cur-range
          v-if="aiProvider !== 'claude-code'"
          :description="t('preferences.ai.temperature')"
          :value="currentConfig.temperature ?? 0.7"
          :min="0"
          :max="2"
          :step="0.1"
          :on-change="(val: number) => updateConfig({ temperature: val })"
        />

        <text-box
          v-if="aiProvider !== 'claude-code'"
          :description="t('preferences.ai.maxTokens')"
          :input="String(currentConfig.maxTokens ?? 8192)"
          :notes="t('preferences.ai.maxTokensNotes')"
          :on-change="updateMaxTokens"
        />

        <div class="action-group">
          <el-button
            type="primary"
            class="action-btn"
            :loading="connecting"
            @click="testConnection"
          >
            {{ t('preferences.ai.connectProvider') }}
          </el-button>
          <span
            v-if="connectionStatus"
            :class="['status-msg', connectionStatus.type]"
          >
            {{ connectionStatus.message }}
          </span>
        </div>

        <div
          v-if="connectionStatus?.type === 'success'"
          class="model-select-container"
        >
          <div class="dynamic-model-select">
            <div class="description-row space-between">
              <span class="description">{{ t('preferences.ai.selectModel') }}</span>
              <el-button
                link
                type="primary"
                size="small"
                :loading="loadingModels"
                @click="fetchDynamicModels"
              >
                {{ t('preferences.ai.refreshModels') }}
              </el-button>
            </div>

            <cur-select
              :value="currentConfig.model || ''"
              :options="modelOptions"
              :filterable="true"
              :allow-create="true"
              :placeholder="t('preferences.ai.selectModelPlaceholder')"
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
                {{ t('preferences.ai.connectModel') }}
              </el-button>
              <span
                v-if="modelConnectionStatus"
                :class="['status-msg', modelConnectionStatus.type]"
              >
                {{ modelConnectionStatus.message }}
              </span>
            </div>

            <div
              v-if="pullProgress"
              class="pull-progress"
            >
              <span class="status-msg success">
                {{ pullProgress.status || t('preferences.ai.pulling') }}
                <span v-if="pullProgress.percent !== undefined">({{ pullProgress.percent }}%)</span>
              </span>
            </div>

            <div
              v-if="modelError"
              class="status-msg error"
            >
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
import curRange from '../common/range/index.vue'
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
// Only show endpoint URL for ollama (local server) or openai with custom baseUrl
const requiresBaseUrl = computed(() =>
  (aiProvider.value === 'ollama') ||
  (aiProvider.value === 'openai' && currentConfig.value?.baseUrl)
)

const showEndpointField = computed(() => true)

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

const updateMaxTokens = (val: string) => {
  const parsed = Number.parseInt(val, 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    updateConfig({ maxTokens: parsed })
  }
}

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

const getFullConfig = (): IAIConfig => ({ provider: aiProvider.value as AIProvider, ...currentConfig.value })

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
      modelError.value = t('preferences.ai.noModels')
    } else {
      dynamicModels.value = models
    }
  } catch (err) {
    modelError.value = t('preferences.ai.fetchModelsFailed', { error: getErrorMessage(err) })
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
    await langGraphService.connect(getFullConfig())
    connectionStatus.value = { type: 'success', message: t('preferences.ai.providerConnected') }

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
    const fullConfig = getFullConfig()
    const config = fullConfig

    if (aiProvider.value === 'ollama') {
      const url = (config.baseUrl || PROVIDER_BASE_URLS.ollama).replace(/\/$/, '')
      const modelName = config.model || ''
      const response = await fetch(`${url}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      })

      if (!response.ok) {
        // Model not found - try to pull it
        modelConnectionStatus.value = {
          type: 'success',
          message: t('preferences.ai.pullingModel')
        }
        await langGraphService.pullModel(modelName, url)
        // After pull, verify again
        const verifyResponse = await fetch(`${url}/api/show`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: modelName })
        })
        if (!verifyResponse.ok) {
          throw new Error(t('preferences.ai.pullFailed', { model: modelName }))
        }
      }
      // For Ollama, we still need to connect to establish the agent
      await langGraphService.connect(fullConfig)
    } else {
      // For other providers, probe via connect logic
      await langGraphService.connect(fullConfig)
    }

    modelConnectionStatus.value = {
      type: 'success',
      message: t('preferences.ai.modelConnected')
    }
    preferencesStore.aiIsConnected = true
  } catch (err) {
    modelConnectionStatus.value = {
      type: 'error',
      message: t('preferences.ai.modelConnectionFailed', { error: getErrorMessage(err) })
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
    connectionStatus.value = { type: 'success', message: t('preferences.ai.providerConnected') }
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
