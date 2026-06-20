import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { IAgentEditProposal, IBlockDiffState } from '@shared/types/langgraph'
import { generateUnifiedDiff } from '../services/agentDiff'

export interface AgentEditReview {
  id: string
  filePath: string
  start?: number
  end?: number
  newContent: string
  oldContent: string
  originalPath: string
  diff: string
  reason?: string
  status: 'pending' | 'applied' | 'rejected'
}

export const useAgentStore = defineStore('agent', () => {
  const pendingEdits = ref<AgentEditReview[]>([])
  const isApplying = ref(false)
  const diffState = ref<IBlockDiffState[]>([])

  function addPendingEdit(
    proposal: IAgentEditProposal,
    oldContent: string,
    originalPath: string
  ): void {
    pendingEdits.value.push({
      ...proposal,
      oldContent,
      originalPath,
      diff: proposal.diff || generateUnifiedDiff(oldContent, proposal.newContent),
      status: 'pending'
    })
  }

  function clearPendingEdits(): void {
    pendingEdits.value = []
    diffState.value = []
  }

  function getPendingEdit(id: string): AgentEditReview | undefined {
    return pendingEdits.value.find((edit) => edit.id === id)
  }

  function updateEditStatus(id: string, status: 'applied' | 'rejected'): void {
    const edit = pendingEdits.value.find((e) => e.id === id)
    if (edit) {
      edit.status = status
    }
    diffState.value = diffState.value.filter((d) => d.editId !== id)
  }

  function setDiffState(states: IBlockDiffState[]): void {
    diffState.value = states
  }

  function getDiffState(): IBlockDiffState[] {
    return diffState.value
  }

  return {
    pendingEdits,
    isApplying,
    diffState,
    addPendingEdit,
    clearPendingEdits,
    getPendingEdit,
    updateEditStatus,
    setDiffState,
    getDiffState
  }
})
