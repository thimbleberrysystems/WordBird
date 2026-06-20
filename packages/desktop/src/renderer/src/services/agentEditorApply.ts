import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import type { IAgentApplyEditRequest, IBlockDiffState } from '@shared/types/langgraph'
import type { IFileState } from '@shared/types/files'

interface AgentApplyTarget {
  currentFile: IFileState | null
  setMarkdown: (markdown: string) => void
  /** Persist the edited file to disk. Called after the buffer is updated. */
  save?: () => void
}

export function applyAgentEditToCurrentFile(
  request: IAgentApplyEditRequest,
  target: AgentApplyTarget
): boolean {
  if (!target.currentFile) return false

  const { edit } = request
  const currentFile = target.currentFile

  const proposalFilename = edit.filePath.split('/').pop() || edit.filePath
  const currentFilename = currentFile.filename || currentFile.pathname?.split('/').pop() || ''

  const pathMatches =
    proposalFilename === currentFilename ||
    edit.filePath === currentFile.pathname ||
    edit.filePath === currentFile.filename ||
    request.originalPath === currentFile.pathname

  if (!pathMatches) {
    return false
  }

  target.setMarkdown(edit.newContent)

  useEditorStore().UPDATE_CURRENT_FILE({
    ...currentFile,
    markdown: edit.newContent,
    isSaved: false
  })

  bus.emit('file-saved', { id: currentFile.id, saved: false })

  // Persist to disk so accepting an AI edit writes the file (like VSCode).
  target.save?.()
  return true
}

export function applyDiffStateToMuya(muya: unknown, diffStates: IBlockDiffState[]): void {
  const m = muya as { contentState?: { setDiffState: (s: IBlockDiffState[]) => void } } | null
  if (!m?.contentState) return
  m.contentState.setDiffState(diffStates)
}

export function clearDiffStateInMuya(muya: unknown): void {
  const m = muya as { contentState?: { clearDiffState: () => void } } | null
  if (!m?.contentState) return
  m.contentState.clearDiffState()
}
