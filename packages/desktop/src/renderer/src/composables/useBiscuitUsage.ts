/**
 * Token-usage counter + context-pressure ring for the Biscuit panel.
 *
 * Owns the two indicator refs (fed by the component's IPC subscriptions),
 * their tooltips, the ring geometry, and manual compaction. Pure UI state —
 * no persistence.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '../store/preferences'
import { t } from '../i18n'
import { estimateCostUsd, formatCostUsd } from '../util/modelPricing'
import type { IContextUsage, ITokenUsageUpdate } from '@shared/types/langgraph'

export interface BiscuitUsage {
  tokenUsage: Ref<ITokenUsageUpdate | null>
  contextUsage: Ref<IContextUsage | null>
  manualCompacting: Ref<boolean>
  ringCircumference: number
  ringDash: ComputedRef<number>
  contextRingLevel: ComputedRef<string>
  contextRingTip: ComputedRef<string>
  tokenTip: ComputedRef<string>
  fmtTokens: (n: number) => string
  condenseNow: () => Promise<void>
}

export const useBiscuitUsage = (options: { sending: Ref<boolean> }): BiscuitUsage => {
  const { sending } = options
  const { aiProvider, aiConfigs, aiCapabilities } = storeToRefs(usePreferencesStore())

  // ---- Token usage counter ----
  const tokenUsage = ref<ITokenUsageUpdate | null>(null)

  const fmtTokens = (n: number): string =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1000
        ? `${(n / 1000).toFixed(1)}k`
        : String(n)

  const tokenTip = computed(() => {
    if (!tokenUsage.value) return ''
    const { turn, session } = tokenUsage.value
    const roles = Object.entries(session.byRole)
      .map(
        ([role, u]) =>
          `${role}: ▼${fmtTokens(u.inputTokens)} ▲${fmtTokens(u.outputTokens)} (${u.calls})`
      )
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
    if (provider !== 'ollama') {
      const model = aiConfigs.value[provider]?.model
      const cost = estimateCostUsd(model, session.inputTokens, session.outputTokens)
      if (cost !== null) {
        base += ` · ${t('biscuit.usageCost', { cost: formatCostUsd(cost) })}`
      }
    }
    return base + (roles ? `\n${roles}` : '')
  })

  // ---- Context ring (fills as the conversation nears compaction) ----
  const contextUsage = ref<IContextUsage | null>(null)
  const manualCompacting = ref(false)

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
    // Real numbers when the model's window is known — the ring is honest
    // about actual context pressure, not an arbitrary internal budget.
    const { usedTokens, budgetTokens } = contextUsage.value
    const tokens =
      usedTokens != null && budgetTokens != null
        ? ` ${t('biscuit.contextTokens', {
          used: usedTokens.toLocaleString(),
          budget: budgetTokens.toLocaleString()
        })}`
        : ''
    // Managed runtimes (claude-code) compact themselves — the ring stays
    // honest and the click explains instead of silently doing nothing.
    const hint = !aiCapabilities.value.manualCompact
      ? ` ${t('biscuit.contextManagedByRuntime')}`
      : sending.value
        ? ''
        : ` ${t('biscuit.condenseHint')}`
    return (
      t('biscuit.contextTip', {
        percent: Math.round(contextUsage.value.ratio * 100)
      }) +
      tokens +
      hint
    )
  })

  // Manual compaction (click the ring while idle).
  const condenseNow = async(): Promise<void> => {
    if (sending.value || manualCompacting.value) return
    if (!aiCapabilities.value.manualCompact) {
      ElMessage.info(t('biscuit.contextManagedByRuntime'))
      return
    }
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

  return {
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
  }
}
