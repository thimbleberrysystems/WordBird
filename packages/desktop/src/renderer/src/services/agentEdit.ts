import bus from '@/bus'
import { useAgentStore, type AgentEditReview } from '@/store/agent'
import type { IAgentApplyEditRequest } from '@shared/types/langgraph'

export function createAgentApplyEditRequest(edit: AgentEditReview): IAgentApplyEditRequest {
  return {
    edit: {
      id: edit.id,
      filePath: edit.filePath,
      start: edit.start,
      end: edit.end,
      newContent: edit.newContent,
      reason: edit.reason
    },
    oldContent: edit.oldContent,
    originalPath: edit.originalPath
  }
}

export async function applyAgentEdit(edit: AgentEditReview): Promise<void> {
  const request = createAgentApplyEditRequest(edit)
  const agentStore = useAgentStore()
  bus.emit('apply-agent-edit', request)
  agentStore.updateEditStatus(edit.id, 'applied')
}

export function rejectAgentEdit(id: string): void {
  useAgentStore().updateEditStatus(id, 'rejected')
}
