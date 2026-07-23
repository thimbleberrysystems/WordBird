import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
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

  // Number of edits still awaiting review across all files. Drives the global
  // Apply All / Discard All bar above the Biscuit prompt.
  const pendingCount = computed(
    () => pendingEdits.value.filter((edit) => edit.status === 'pending').length
  )

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

  /**
   * Drop edits that have been resolved (applied/rejected), keeping the ones
   * still pending. Auto-apply uses this instead of clearPendingEdits so a
   * proposal that arrived WHILE a batch was being written is not wiped along
   * with the batch — it survives for the next apply cycle.
   */
  function pruneResolved(): void {
    pendingEdits.value = pendingEdits.value.filter((edit) => edit.status === 'pending')
  }

  function getPendingEdit(id: string): AgentEditReview | undefined {
    return pendingEdits.value.find((edit) => edit.id === id)
  }

  function updateEditStatus(id: string, status: 'applied' | 'rejected'): void {
    const edit = pendingEdits.value.find((e) => e.id === id)
    if (edit) {
      const wasPending = edit.status === 'pending'
      edit.status = status
      // Close the feedback loop: the model's next turn learns what the
      // writer decided (main batches these into one review note).
      if (wasPending) {
        try {
          window.electron?.ai?.resolveEdit?.({
            id: edit.id,
            filePath: edit.filePath,
            accepted: status === 'applied'
          })
        } catch {
          // Reporting is best-effort — never block the review action itself.
        }
      }
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
    pendingCount,
    isApplying,
    diffState,
    addPendingEdit,
    clearPendingEdits,
    pruneResolved,
    getPendingEdit,
    updateEditStatus,
    setDiffState,
    getDiffState
  }
})
