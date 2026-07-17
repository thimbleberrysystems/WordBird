/**
 * Live agent state, shared between the Biscuit chat panel and the
 * dedicated Agents sidebar view.
 *
 * Subscribes ONCE to the main-process events (agent status, activity feed,
 * run state) and owns the per-agent / whole-run controls. Retry is the one
 * action that needs the chat pipeline — it goes out on the bus and
 * RightPrompt turns it into a message or mid-run steering note.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import bus from '../bus'
import type {
  IAgentStatus,
  IAgentActivityEvent
} from '@shared/types/langgraph'

export const useAgentsStore = defineStore('agents', () => {
  const agentMap = ref(new Map<string, IAgentStatus>())
  const activity = ref<IAgentActivityEvent[]>([])
  const runState = ref<'idle' | 'running' | 'paused'>('idle')

  const agentList = computed(() => Array.from(agentMap.value.values()))
  const runningCount = computed(
    () => agentList.value.filter((a) => a.status === 'running').length
  )

  let initialized = false
  /** Set by stopAll so interrupted rows close out as cancelled, not done. */
  let stopRequested = false

  /** Idempotent — safe to call from every consumer's onMounted. */
  const init = (): void => {
    if (initialized) return
    initialized = true
    window.electron.ai.onAgentStatus((status) => {
      const next = new Map(agentMap.value)
      next.set(status.agentId, status)
      agentMap.value = next
    })
    window.electron.ai.onActivity((event) => {
      activity.value.push(event)
      if (activity.value.length > 200) activity.value.splice(0, 100)
    })
    window.electron.ai.onRunState(({ state }) => {
      runState.value = state
      // The run is over: any row still "running" is stale (SDK subagents
      // interrupted mid-flight never get a completion event). Close them
      // out so the tree never shows phantom running agents after Stop.
      if (state === 'idle') {
        const next = new Map(agentMap.value)
        let changed = false
        for (const [id, agent] of next) {
          if (agent.status === 'running') {
            next.set(id, {
              ...agent,
              status: stopRequested ? 'cancelled' : 'done',
              endedAt: agent.endedAt ?? Date.now()
            })
            changed = true
          }
        }
        if (changed) agentMap.value = next
        stopRequested = false
      }
    })
  }

  /** New conversation — the previous run's agents are history. */
  const clear = (): void => {
    agentMap.value = new Map()
    activity.value = []
  }

  const cancelAgent = async(agentId: string): Promise<void> => {
    await window.electron.ai.cancelAgent(agentId)
  }

  const pauseAgent = async(agentId: string): Promise<void> => {
    await window.electron.ai.pauseAgent(agentId)
  }

  const resumeAgent = async(agentId: string): Promise<void> => {
    await window.electron.ai.resumeAgent(agentId)
  }

  const pauseAll = async(): Promise<void> => {
    await window.electron.ai.pause()
  }

  const resumeAll = async(): Promise<void> => {
    await window.electron.ai.resume()
  }

  const stopAll = async(): Promise<void> => {
    stopRequested = true
    await window.electron.ai.abort()
  }

  /** Route a retry through the chat pipeline (message or steering note). */
  const retryTask = (task: string): void => {
    bus.emit('biscuit-retry-task', task)
  }

  return {
    agentMap,
    activity,
    runState,
    agentList,
    runningCount,
    init,
    clear,
    cancelAgent,
    pauseAgent,
    resumeAgent,
    pauseAll,
    resumeAll,
    stopAll,
    retryTask
  }
})
